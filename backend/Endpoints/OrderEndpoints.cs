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
        var refundLog = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Refund");

        // List all orders, newest first.
        app.MapGet("/orders", async (AppDbContext db) =>
                await db.Orders.OrderByDescending(o => o.CreatedAt).ToListAsync())
            .WithTags("Orders")
            .WithSummary("List all orders")
            .WithDescription("Returns every order, newest first. Use it to see an order flip from Pending to Paid after a webhook.")
            .Produces<List<Order>>(StatusCodes.Status200OK)
            .RequireAuthorization("Admin"); // admin-only: full order list

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
        }).ExcludeFromDescription()
          // Same admin data as GET /orders. EventSource can't send an Authorization
          // header, but it DOES send cookies on same-origin requests — another reason
          // cookie auth fits here where a bearer token wouldn't.
          .RequireAuthorization("Admin");

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

            // Normalize currency to a lowercase ISO 4217 code (Stripe wants lowercase).
            // Validate the shape here so we fail fast with a clear 400 instead of
            // round-tripping garbage to Stripe.
            var currency = (req.Currency ?? "").Trim().ToLowerInvariant();
            if (currency.Length != 3 || !currency.All(char.IsAsciiLetter))
            {
                checkoutLog.LogWarning("⚠️ Rejected checkout with invalid currency {Currency}", req.Currency);
                return Results.BadRequest(new { error = "currency must be a 3-letter ISO code (e.g. \"eur\")." });
            }

            checkoutLog.LogInformation("🛒 Checkout requested: {Amount} {Currency}", req.AmountCents, currency);

            // 1. Build the order object (not saved yet — we only persist if Stripe succeeds).
            var order = new Order { AmountCents = req.AmountCents, Currency = currency };

            // 2. Create the matching PaymentIntent via the gateway (Stripe, in prod).
            //    The gateway hides Stripe.net behind IPaymentGateway (see Payments/).
            PaymentIntentResult intent;
            try
            {
                intent = await payments.CreatePaymentIntentAsync(
                    req.AmountCents, currency, order.Id.ToString());
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
            //    Returned as a named record (not an anonymous object) so it appears in
            //    the OpenAPI contract and the frontend can generate its type.
            return Results.Created($"/orders/{order.Id}", new CreateOrderResponse(
                order.Id, intent.ClientSecret, order.AmountCents, order.Currency));
        })
            .WithTags("Orders")
            .WithSummary("Start a checkout")
            .WithDescription(
                "Creates a Pending order and a matching Stripe PaymentIntent, then returns the " +
                "clientSecret the frontend uses to confirm the card.\n\n" +
                "Body: amountCents (integer, in cents — 1999 = 19.99) and currency (lowercase ISO code, e.g. \"eur\").")
            .Produces<CreateOrderResponse>(StatusCodes.Status201Created)
            .Produces(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status500InternalServerError)
            .RequireAuthorization(); // must be signed in to buy

        // Refund a paid order. We ASK Stripe to refund, then return 202 Accepted:
        // the order only becomes Refunded when the charge.refunded webhook arrives
        // (same "webhook is the source of truth" pattern as payment).
        app.MapPost("/orders/{id:guid}/refund", async (Guid id, AppDbContext db, IPaymentGateway payments) =>
        {
            var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == id);
            if (order is null)
                return Results.NotFound(new { error = "Order not found." });

            // Only a Paid order can be refunded. Pending/Failed/already-Refunded -> 400.
            if (order.Status != OrderStatus.Paid)
            {
                refundLog.LogWarning("⚠️ Refund rejected: order {Order} is {Status}, not Paid", order.Id, order.Status);
                return Results.BadRequest(new { error = $"Only a Paid order can be refunded (this one is {order.Status})." });
            }

            // A Paid order always has a PaymentIntent id, but guard defensively.
            if (string.IsNullOrEmpty(order.StripePaymentIntentId))
                return Results.BadRequest(new { error = "Order has no PaymentIntent to refund." });

            try
            {
                await payments.CreateRefundAsync(order.StripePaymentIntentId);
            }
            catch (PaymentGatewayException ex)
            {
                refundLog.LogWarning("⚠️ Payment provider rejected refund for order {Order}: {Message}", order.Id, ex.Message);
                return Results.BadRequest(new { error = ex.Message });
            }

            // Note: we do NOT set Refunded here. The charge.refunded webhook does that.
            refundLog.LogInformation("↩️ Refund requested for order {Order} (PaymentIntent {Pi})", order.Id, order.StripePaymentIntentId);

            // 202 with a typed body so the caller knows the request was accepted but
            // is still pending. The order is NOT Refunded yet — that happens on the
            // webhook. Returned as a named record so it appears in the OpenAPI contract.
            return Results.Accepted($"/orders/{order.Id}", new RefundResponse(
                order.Id,
                "refund_pending",
                "Refund requested. The order will show as Refunded once Stripe confirms."));
        })
            .WithTags("Orders")
            .WithSummary("Refund a paid order")
            .WithDescription(
                "Asks Stripe to refund the order's payment. Returns 202 Accepted immediately; " +
                "the order flips to Refunded only when the charge.refunded webhook arrives. " +
                "Fails with 404 if the order doesn't exist, or 400 if it isn't Paid.")
            .Produces<RefundResponse>(StatusCodes.Status202Accepted)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status404NotFound)
            .RequireAuthorization("Admin"); // admin-only action
    }
}

/// <summary>Request body to start a checkout.</summary>
/// <param name="AmountCents">Amount in the smallest currency unit (cents). Example: 1999 means 19.99.</param>
/// <param name="Currency">Lowercase ISO currency code. Example: "eur".</param>
public record CreateOrderRequest(long AmountCents, string Currency);

/// <summary>Response returned when a checkout starts.</summary>
/// <param name="OrderId">The new order's id.</param>
/// <param name="ClientSecret">The Stripe clientSecret the frontend uses to confirm the card.</param>
/// <param name="AmountCents">Amount in the smallest currency unit (cents).</param>
/// <param name="Currency">Lowercase ISO currency code, e.g. "eur".</param>
public record CreateOrderResponse(Guid OrderId, string ClientSecret, long AmountCents, string Currency);

/// <summary>Response returned when a refund is accepted (still pending).</summary>
/// <param name="OrderId">The order being refunded.</param>
/// <param name="Status">Always "refund_pending" — the order flips to Refunded only on the charge.refunded webhook.</param>
/// <param name="Message">Human-readable explanation the frontend can show.</param>
public record RefundResponse(Guid OrderId, string Status, string Message);
