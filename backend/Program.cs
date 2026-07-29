using Microsoft.EntityFrameworkCore;
using PaymentSim.Api.Data;
using PaymentSim.Api.Models;
using Stripe;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite("Data Source=paymentsim.db"));

var app = builder.Build();

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

app.MapGet("/", () => "PaymentSim API");

app.MapGet("/health", () => new { status = "ok" });

app.MapGet("/orders", async (AppDbContext db) =>
    await db.Orders.OrderByDescending(o => o.CreatedAt).ToListAsync());

// Start a checkout: create our order (Pending) AND a Stripe PaymentIntent.
// Returns the clientSecret the frontend needs to confirm the card payment.
app.MapPost("/orders", async (CreateOrderRequest req, AppDbContext db) =>
{
    if (string.IsNullOrEmpty(StripeConfiguration.ApiKey))
        return Results.Problem("Stripe secret key not configured. Set Stripe:SecretKey via user-secrets.");

    // 1. Create the order in our DB, still Pending.
    var order = new Order { AmountCents = req.AmountCents, Currency = req.Currency };
    db.Orders.Add(order);

    // 2. Create the matching PaymentIntent on Stripe (test mode).
    //    Metadata carries our order id so we can find the order from a webhook.
    var intent = await new PaymentIntentService().CreateAsync(new PaymentIntentCreateOptions
    {
        Amount = req.AmountCents,
        Currency = req.Currency,
        PaymentMethodTypes = ["card"],
        Metadata = new Dictionary<string, string> { ["order_id"] = order.Id.ToString() }
    });

    // 3. Remember which PaymentIntent belongs to this order, then save.
    order.StripePaymentIntentId = intent.Id;
    await db.SaveChangesAsync();

    // 4. Hand the clientSecret to the frontend so Stripe.js can confirm the payment.
    return Results.Created($"/orders/{order.Id}", new
    {
        orderId = order.Id,
        clientSecret = intent.ClientSecret,
        amountCents = order.AmountCents,
        currency = order.Currency
    });
});

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
});

app.Run();

record CreateOrderRequest(long AmountCents, string Currency);
