using System.Net;
using Microsoft.EntityFrameworkCore;
using PaymentSim.Api;
using PaymentSim.Api.Data;
using PaymentSim.Api.Models;
using Stripe;

var builder = WebApplication.CreateBuilder(args);

// Console logs: one line per entry, with a short timestamp. Replaces the default
// two-line formatter so our webhook/checkout logs are easy to scan.
builder.Logging.ClearProviders();
builder.Logging.AddSimpleConsole(options =>
{
    options.SingleLine = true;
    options.TimestampFormat = "HH:mm:ss ";
});

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite("Data Source=paymentsim.db"));

// Singleton: one shared notifier for the whole app (holds the SSE subscribers).
builder.Services.AddSingleton<OrderNotifier>();

// Swagger: an in-browser UI to explore and call the API by hand (dev only).
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new() { Title = "PaymentSim API", Version = "v1" });

    // Feed our XML doc comments into Swagger so summaries/examples show up.
    var xmlFile = $"{System.Reflection.Assembly.GetExecutingAssembly().GetName().Name}.xml";
    options.IncludeXmlComments(Path.Combine(AppContext.BaseDirectory, xmlFile));
});

// CORS: the frontend (http://localhost:5173) is a different origin from this API
// (http://localhost:5144). Browsers block cross-origin calls unless the server
// opts in. This policy lets our dev frontend call the API. (Webhooks are
// server-to-server and don't involve CORS.)
builder.Services.AddCors(options =>
    options.AddPolicy("frontend", policy =>
        policy.WithOrigins("http://localhost:5173")
              .AllowAnyHeader()
              .AllowAnyMethod()));

var app = builder.Build();

app.UseCors("frontend");

// Named loggers so each log line says which part of the system it came from
// (shows as e.g. "info: Checkout[0] ..." instead of "PaymentSim.Api[0] ...").
var checkoutLog = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Checkout");
var webhookLog = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Webhook");
var devLog = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Dev");

// Serve Swagger UI at /swagger while developing.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Tell the Stripe SDK which secret key to use for every API call.
// The key comes from configuration (user-secrets in dev) — never hard-coded.
StripeConfiguration.ApiKey = builder.Configuration["Stripe:SecretKey"];

// The webhook signing secret ("whsec_..."). Stripe uses it to sign every
// webhook it sends us; we use it to verify the request really came from Stripe.
var webhookSecret = builder.Configuration["Stripe:WebhookSecret"];

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
}

app.MapGet("/", () => "PaymentSim API")
    .ExcludeFromDescription(); // hide the plain-text root from Swagger

app.MapGet("/health", () => new { status = "ok" })
    .WithTags("System")
    .WithSummary("Liveness check")
    .WithDescription("Returns 200 with { status: \"ok\" } if the API is up. No parameters.");

app.MapGet("/orders", async (AppDbContext db) =>
        await db.Orders.OrderByDescending(o => o.CreatedAt).ToListAsync())
    .WithTags("Orders")
    .WithSummary("List all orders")
    .WithDescription("Returns every order, newest first. Use it to see an order flip from Pending to Paid after a webhook.")
    .Produces<List<Order>>(StatusCodes.Status200OK);

// Server-Sent Events: a long-lived connection the browser opens once. The
// backend PUSHES a line whenever an order changes (leg B). This replaces
// frontend polling — no repeated requests, near-instant updates.
app.MapGet("/orders/stream", async (HttpContext ctx, OrderNotifier notifier, CancellationToken ct) =>
{
    ctx.Response.ContentType = "text/event-stream";
    ctx.Response.Headers.CacheControl = "no-cache";
    // Don't buffer: each message must reach the browser immediately.
    ctx.Features.Get<Microsoft.AspNetCore.Http.Features.IHttpResponseBodyFeature>()?.DisableBuffering();

    var (id, reader) = notifier.Subscribe();
    try
    {
        // Wait for messages and write each as an SSE "data:" frame.
        await foreach (var message in reader.ReadAllAsync(ct))
        {
            await ctx.Response.WriteAsync($"data: {message}\n\n", ct);
            await ctx.Response.Body.FlushAsync(ct);
        }
    }
    catch (OperationCanceledException)
    {
        // Browser closed the tab / navigated away — expected. Nothing to do.
    }
    finally
    {
        notifier.Unsubscribe(id);
    }
}).ExcludeFromDescription();

// Start a checkout: create our order (Pending) AND a Stripe PaymentIntent.
// Returns the clientSecret the frontend needs to confirm the card payment.
app.MapPost("/orders", async (CreateOrderRequest req, AppDbContext db) =>
{
    if (string.IsNullOrEmpty(StripeConfiguration.ApiKey))
    {
        checkoutLog.LogError("💥 Checkout attempted but Stripe:SecretKey is not configured");
        return Results.Problem("Stripe secret key not configured. Set Stripe:SecretKey via user-secrets.");
    }

    // Cheap sanity check before calling Stripe: a non-positive amount is
    // obviously the caller's mistake, so fail fast with 400.
    if (req.AmountCents <= 0)
    {
        checkoutLog.LogWarning("⚠️ Rejected checkout with invalid amount {Amount}", req.AmountCents);
        return Results.BadRequest(new { error = "amountCents must be a positive integer (cents)." });
    }

    checkoutLog.LogInformation("🛒 Checkout requested: {Amount} {Currency}", req.AmountCents, req.Currency);

    // 1. Build the order object (not saved yet — we only persist if Stripe succeeds).
    var order = new Order { AmountCents = req.AmountCents, Currency = req.Currency };

    // 2. Create the matching PaymentIntent on Stripe (test mode).
    //    Metadata carries our order id so we can find the order from a webhook.
    PaymentIntent intent;
    try
    {
        intent = await new PaymentIntentService().CreateAsync(new PaymentIntentCreateOptions
        {
            Amount = req.AmountCents,
            Currency = req.Currency,
            PaymentMethodTypes = ["card"],
            Metadata = new Dictionary<string, string> { ["order_id"] = order.Id.ToString() }
        });
    }
    catch (StripeException ex)
    {
        // Stripe rejected the request (e.g. amount below the currency minimum,
        // unknown currency). That's the caller's fault -> 400 with a clean message,
        // never the raw exception/stack trace.
        checkoutLog.LogWarning("⚠️ Stripe rejected checkout: {Message}", ex.StripeError?.Message ?? ex.Message);
        return Results.BadRequest(new { error = ex.StripeError?.Message ?? ex.Message });
    }

    // 3. Stripe accepted it: now persist the order with its PaymentIntent id.
    order.StripePaymentIntentId = intent.Id;
    db.Orders.Add(order);
    await db.SaveChangesAsync();

    checkoutLog.LogInformation("🧾 Order {Order} created ({Amount} {Currency}), PaymentIntent {Pi}",
        order.Id, order.AmountCents, order.Currency, intent.Id);

    // 4. Hand the clientSecret to the frontend so Stripe.js can confirm the payment.
    return Results.Created($"/orders/{order.Id}", new
    {
        orderId = order.Id,
        clientSecret = intent.ClientSecret,
        amountCents = order.AmountCents,
        currency = order.Currency
    });
})
    .WithTags("Orders")
    .WithSummary("Start a checkout")
    .WithDescription(
        "Creates a Pending order and a matching Stripe PaymentIntent, then returns the " +
        "clientSecret the frontend uses to confirm the card.\n\n" +
        "Body: amountCents (integer, in cents — 1999 = 19.99) and currency (lowercase ISO code, e.g. \"eur\").")
    .Produces(StatusCodes.Status201Created)
    .Produces(StatusCodes.Status400BadRequest)
    .ProducesProblem(StatusCodes.Status500InternalServerError);

// Receive webhooks from Stripe. This is where we learn about payments.
// CRITICAL: we must verify the signature, or anyone could POST a fake
// "payment succeeded" here and get free goods.
app.MapPost("/webhook", async (HttpRequest request, AppDbContext db, OrderNotifier notifier) =>
{
    // 1. Read the RAW body as text. We must NOT let the framework parse it into
    //    an object first: the signature is computed over the exact bytes Stripe
    //    sent, so any re-serialization would break verification.
    using var reader = new StreamReader(request.Body);
    var json = await reader.ReadToEndAsync();

    // 2. The signature Stripe attached to this request. A forged request may
    //    omit it entirely -> reject cleanly with 400 instead of crashing.
    var signature = request.Headers["Stripe-Signature"].ToString();
    if (string.IsNullOrEmpty(signature))
        return Results.BadRequest(new { error = "Missing signature" });

    if (string.IsNullOrEmpty(webhookSecret))
        return Results.Problem("Webhook secret not configured. Set Stripe:WebhookSecret via user-secrets.");

    Event stripeEvent;
    try
    {
        // 3. Recompute the signature from (json + secret) and compare. Throws if
        //    it doesn't match — i.e. the payload was forged or tampered with.
        stripeEvent = EventUtility.ConstructEvent(json, signature, webhookSecret);
        webhookLog.LogInformation("📨 Received Stripe event: {Type} ({Id})", stripeEvent.Type, stripeEvent.Id);
    }
    catch (StripeException)
    {
        // Bad/missing signature -> reject. Never trust an unverified payload.
        return Results.BadRequest(new { error = "Invalid signature" });
    }

    // 4. Idempotency fast path: if we've already recorded this event id, do nothing.
    //    Stripe delivers "at least once", so redeliveries WILL happen.
    if (await db.ProcessedEvents.AnyAsync(e => e.Id == stripeEvent.Id))
    {
        webhookLog.LogInformation("🔁 Duplicate event ignored: {Id}", stripeEvent.Id);
        return Results.Ok();
    }

    // 5. First time we see it -> do the real work. (The 📨 log above already
    //    recorded arrival; the outcome logs below say what we did.)

    // 5a. We only care about successful payments here. Find the matching order
    //     (linked by PaymentIntent id in Step 4) and flip it to Paid.
    var orderMarkedPaid = false;
    if (stripeEvent.Type == EventTypes.PaymentIntentSucceeded &&
        stripeEvent.Data.Object is PaymentIntent paymentIntent)
    {
        var order = await db.Orders
            .FirstOrDefaultAsync(o => o.StripePaymentIntentId == paymentIntent.Id);

        if (order is null)
        {
            // Happens for events not tied to one of our orders (e.g. `stripe trigger`
            // creates its own PaymentIntent). Nothing to update.
            webhookLog.LogWarning("⚠️ No order matches PaymentIntent {Pi}", paymentIntent.Id);
        }
        else
        {
            order.Status = OrderStatus.Paid;
            orderMarkedPaid = true;
            webhookLog.LogInformation("✅ Order {Order} -> Paid (PaymentIntent {Pi})",
                order.Id, paymentIntent.Id);
        }
    }

    // 6. Record it as processed. The primary key on Id is the REAL guard: if two
    //    duplicate deliveries race past the check above, the second insert fails.
    //    Because the order change and this insert share one SaveChanges, a duplicate
    //    rolls back BOTH -> the order is never marked Paid twice.
    db.ProcessedEvents.Add(new ProcessedEvent { Id = stripeEvent.Id });
    try
    {
        await db.SaveChangesAsync();

        // Save succeeded -> tell connected browsers to refresh (leg B).
        // Only after a real change, and only after the commit (never on rollback).
        if (orderMarkedPaid)
        {
            notifier.Notify("orders-changed");
            webhookLog.LogInformation("📢 Notified SSE clients of order change");
        }
    }
    catch (DbUpdateException)
    {
        // Another concurrent delivery inserted the same id first -> it's a duplicate.
        webhookLog.LogInformation("🔁 Duplicate event race ignored (PK conflict): {Id}", stripeEvent.Id);
    }

    // Always answer 2xx once handled, or Stripe keeps retrying.
    return Results.Ok();
})
    .WithTags("Webhooks")
    .WithSummary("Stripe webhook receiver")
    .WithDescription(
        "Called by Stripe (not by the frontend). Requires a valid 'Stripe-Signature' header; " +
        "the raw body is verified against the webhook secret.\n\n" +
        "You cannot produce a valid call from Swagger — use the Stripe CLI " +
        "(`stripe listen` + `stripe trigger`). Calling it here returns 400 (no valid signature), " +
        "which demonstrates the forged-request rejection.")
    .Produces(StatusCodes.Status200OK)
    .Produces(StatusCodes.Status400BadRequest);

// Dev-only: wipe all orders + processed events (keeps the schema). Handy for a
// clean slate while testing. Only mapped in Development, so it can't ship to prod.
if (app.Environment.IsDevelopment())
{
    app.MapPost("/dev/reset", async (HttpContext http, AppDbContext db, OrderNotifier notifier, bool confirm = false) =>
    {
        // Second guard: only from the local machine (loopback: 127.0.0.1 / ::1).
        // Env alone isn't enough — a staging box might run as Development and be
        // reachable remotely. We check the real socket peer IP (not a spoofable
        // header like X-Forwarded-For), so a remote caller can never reach this.
        var ip = http.Connection.RemoteIpAddress;
        if (ip is null || !IPAddress.IsLoopback(ip))
        {
            devLog.LogWarning("🚫 /dev/reset blocked for non-local caller {Ip}", ip);
            return Results.NotFound();
        }

        // Confirmation guard: destructive action requires an explicit opt-in, so an
        // accidental POST (or a stray click in Swagger) can't wipe the data.
        if (!confirm)
            return Results.BadRequest(new { error = "This deletes ALL orders and events. Add ?confirm=true to proceed." });

        // ExecuteDeleteAsync runs a single DELETE in the DB (no loading rows first).
        var orders = await db.Orders.ExecuteDeleteAsync();
        var events = await db.ProcessedEvents.ExecuteDeleteAsync();
        notifier.Notify("orders-changed"); // push so the UI clears immediately
        devLog.LogWarning("🧹 DB reset: deleted {Orders} orders, {Events} processed events", orders, events);
        return Results.Ok(new { deletedOrders = orders, deletedEvents = events });
    })
    .WithTags("Dev")
    .WithSummary("Reset the database (dev only)")
    .WithDescription("Deletes all orders and processed-event records. Schema stays. " +
        "Development only, localhost only, and requires ?confirm=true.");
}

app.Run();

/// <summary>Request body to start a checkout.</summary>
/// <param name="AmountCents">Amount in the smallest currency unit (cents). Example: 1999 means 19.99.</param>
/// <param name="Currency">Lowercase ISO currency code. Example: "eur".</param>
record CreateOrderRequest(long AmountCents, string Currency);
