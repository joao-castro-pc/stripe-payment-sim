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

app.Run();

record CreateOrderRequest(long AmountCents, string Currency);
