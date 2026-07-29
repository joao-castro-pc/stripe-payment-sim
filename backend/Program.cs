using Microsoft.EntityFrameworkCore;
using PaymentSim.Api.Data;
using PaymentSim.Api.Models;
using Stripe;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite("Data Source=paymentsim.db"));

// Swagger: an in-browser UI to explore and call the API by hand (dev only).
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new() { Title = "PaymentSim API", Version = "v1" });

    // Feed our XML doc comments into Swagger so summaries/examples show up.
    var xmlFile = $"{System.Reflection.Assembly.GetExecutingAssembly().GetName().Name}.xml";
    options.IncludeXmlComments(Path.Combine(AppContext.BaseDirectory, xmlFile));
});

var app = builder.Build();

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

// Start a checkout: create our order (Pending) AND a Stripe PaymentIntent.
// Returns the clientSecret the frontend needs to confirm the card payment.
app.MapPost("/orders", async (CreateOrderRequest req, AppDbContext db) =>
{
    if (string.IsNullOrEmpty(StripeConfiguration.ApiKey))
        return Results.Problem("Stripe secret key not configured. Set Stripe:SecretKey via user-secrets.");

    // Cheap sanity check before calling Stripe: a non-positive amount is
    // obviously the caller's mistake, so fail fast with 400.
    if (req.AmountCents <= 0)
        return Results.BadRequest(new { error = "amountCents must be a positive integer (cents)." });

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
        return Results.BadRequest(new { error = ex.StripeError?.Message ?? ex.Message });
    }

    // 3. Stripe accepted it: now persist the order with its PaymentIntent id.
    order.StripePaymentIntentId = intent.Id;
    db.Orders.Add(order);
    await db.SaveChangesAsync();

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
app.MapPost("/webhook", async (HttpRequest request) =>
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
    }
    catch (StripeException)
    {
        // Bad/missing signature -> reject. Never trust an unverified payload.
        return Results.BadRequest(new { error = "Invalid signature" });
    }

    // 4. Verified. For now just acknowledge; Steps 6-7 add idempotency + order update.
    app.Logger.LogInformation("Verified Stripe event: {Type} ({Id})",
        stripeEvent.Type, stripeEvent.Id);

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

app.Run();

/// <summary>Request body to start a checkout.</summary>
/// <param name="AmountCents">Amount in the smallest currency unit (cents). Example: 1999 means 19.99.</param>
/// <param name="Currency">Lowercase ISO currency code. Example: "eur".</param>
record CreateOrderRequest(long AmountCents, string Currency);
