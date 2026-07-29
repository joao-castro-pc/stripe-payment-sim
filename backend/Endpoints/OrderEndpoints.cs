using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;
using PaymentSim.Api.Data;
using PaymentSim.Api.Models;
using PaymentSim.Api.Payments;
using Stripe;

namespace PaymentSim.Api.Endpoints;

public static class OrderEndpoints
{
    public static void MapOrderEndpoints(this WebApplication app)
    {
        var checkoutLog = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Checkout");

        // List all orders, newest first.
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
            ctx.Features.Get<IHttpResponseBodyFeature>()?.DisableBuffering();

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
        app.MapPost("/orders", async (CreateOrderRequest req, AppDbContext db, IPaymentGateway payments) =>
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

            // 2. Create the matching PaymentIntent via the gateway (Stripe, in prod).
            //    The gateway hides Stripe.net behind IPaymentGateway (see Payments/).
            PaymentIntentResult intent;
            try
            {
                intent = await payments.CreatePaymentIntentAsync(
                    req.AmountCents, req.Currency, order.Id.ToString());
            }
            catch (PaymentGatewayException ex)
            {
                // Provider rejected the request (e.g. amount below the currency minimum,
                // unknown currency). That's the caller's fault -> 400 with a clean message,
                // never the raw exception/stack trace.
                checkoutLog.LogWarning("⚠️ Payment provider rejected checkout: {Message}", ex.Message);
                return Results.BadRequest(new { error = ex.Message });
            }

            // 3. Provider accepted it: now persist the order with its PaymentIntent id.
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
    }
}

/// <summary>Request body to start a checkout.</summary>
/// <param name="AmountCents">Amount in the smallest currency unit (cents). Example: 1999 means 19.99.</param>
/// <param name="Currency">Lowercase ISO currency code. Example: "eur".</param>
public record CreateOrderRequest(long AmountCents, string Currency);
