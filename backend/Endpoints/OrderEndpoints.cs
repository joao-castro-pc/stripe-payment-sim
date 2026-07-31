using System.Security.Claims;
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

        // List all orders, newest first, each with the email of the customer who
        // placed it (projected via the User navigation; null for pre-account orders).
        app.MapGet("/orders", async (AppDbContext db) =>
                await db.Orders
                    .OrderByDescending(o => o.CreatedAt)
                    .Select(o => new OrderResponse(
                        o.Id, o.AmountCents, o.Currency, o.Status, o.CreatedAt,
                        o.User != null ? o.User.Email : null))
                    .ToListAsync())
            .WithTags("Orders")
            .WithSummary("List all orders")
            .WithDescription("Returns every order, newest first, with the customer's email. Use it to see an order flip from Pending to Paid after a webhook.")
            .Produces<List<OrderResponse>>(StatusCodes.Status200OK)
            .RequireAuthorization("Admin"); // admin-only: full order list

        // One order in full, with its line items and PaymentIntent id — the admin
        // order-detail view. Projected to a DTO so we never leak the entity (and so
        // the shape appears in the OpenAPI contract for the frontend).
        app.MapGet("/orders/{id:guid}", async (Guid id, AppDbContext db) =>
        {
            var order = await db.Orders
                .Where(o => o.Id == id)
                .Select(o => new OrderDetailResponse(
                    o.Id, o.AmountCents, o.Currency, o.Status, o.CreatedAt,
                    o.User != null ? o.User.Email : null,
                    o.StripePaymentIntentId,
                    o.Items
                        .OrderBy(i => i.Title)
                        .Select(i => new OrderItemResponse(
                            i.ProductId, i.Title, i.UnitAmountCents, i.Quantity, i.Thumbnail))
                        .ToList()))
                .FirstOrDefaultAsync();

            return order is null
                ? Results.NotFound(new { error = "Order not found." })
                : Results.Ok(order);
        })
            .WithTags("Orders")
            .WithSummary("Get one order with its line items")
            .WithDescription("Returns a single order plus the products it contains and its Stripe PaymentIntent id. Powers the admin order-detail page.")
            .Produces<OrderDetailResponse>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status404NotFound)
            .RequireAuthorization("Admin"); // admin-only: full order detail

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
        app.MapPost("/orders", async (CreateOrderRequest req, AppDbContext db, IPaymentGateway payments, ClaimsPrincipal user) =>
        {
            if (string.IsNullOrEmpty(StripeConfiguration.ApiKey))
            {
                checkoutLog.LogError("💥 Checkout attempted but Stripe:SecretKey is not configured");
                return Results.Problem("Stripe secret key not configured. Set Stripe:SecretKey via user-secrets.");
            }

            // An order must have at least one line item — the total is derived from them.
            if (req.Items is null || req.Items.Count == 0)
            {
                checkoutLog.LogWarning("⚠️ Rejected checkout with no items");
                return Results.BadRequest(new { error = "An order must contain at least one item." });
            }

            // Validate every line before touching Stripe.
            // TRUST NOTE: the unit prices come from the CLIENT, because the catalog is
            // the external DummyJSON API, not our own DB — so we can't re-price against a
            // source of truth we own. This is the same trust gap the old client-sent
            // amountCents already had. For this learning project we STORE what the client
            // sends; a real store would re-price every line server-side against its own
            // product table before charging (else a hostile client could under-price).
            foreach (var item in req.Items)
            {
                if (string.IsNullOrWhiteSpace(item.Title))
                    return Results.BadRequest(new { error = "Each item needs a title." });
                if (item.Quantity <= 0)
                    return Results.BadRequest(new { error = "Each item quantity must be a positive integer." });
                if (item.UnitAmountCents <= 0)
                    return Results.BadRequest(new { error = "Each item unitAmountCents must be a positive integer (cents)." });
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

            // The amount charged is SUMMED server-side from the line items — we never
            // trust a separate client-sent total (it could disagree with the lines).
            var total = req.Items.Sum(i => i.UnitAmountCents * i.Quantity);

            checkoutLog.LogInformation("🛒 Checkout requested: {Count} item(s), {Amount} {Currency}",
                req.Items.Count, total, currency);

            // 1. Build the order + its items (not saved yet — we only persist if Stripe
            //    succeeds). Attribute it to the signed-in user (the endpoint requires
            //    auth, so the id claim is always present).
            var order = new Order
            {
                AmountCents = total,
                Currency = currency,
                Items = req.Items.Select(i => new OrderItem
                {
                    ProductId = i.ProductId,
                    Title = i.Title.Trim(),
                    UnitAmountCents = i.UnitAmountCents,
                    Quantity = i.Quantity,
                    Thumbnail = i.Thumbnail,
                }).ToList(),
            };
            if (Guid.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
                order.UserId = userId;

            // 2. Create the matching PaymentIntent via the gateway (Stripe, in prod).
            //    The gateway hides Stripe.net behind IPaymentGateway (see Payments/).
            PaymentIntentResult intent;
            try
            {
                intent = await payments.CreatePaymentIntentAsync(total, currency, order.Id.ToString());
            }
            catch (PaymentGatewayException ex)
            {
                // Provider rejected the request (e.g. amount below the currency minimum,
                // unknown currency). That's the caller's fault -> 400 with a clean message,
                // never the raw exception/stack trace.
                checkoutLog.LogWarning("⚠️ Payment provider rejected checkout: {Message}", ex.Message);
                return Results.BadRequest(new { error = ex.Message });
            }

            // 3. Provider accepted it: now persist the order (its items cascade-insert
            //    through the navigation) with its PaymentIntent id.
            order.StripePaymentIntentId = intent.Id;
            db.Orders.Add(order);
            await db.SaveChangesAsync();

            checkoutLog.LogInformation("🧾 Order {Order} created ({Amount} {Currency}, {Count} item(s)), PaymentIntent {Pi}",
                order.Id, order.AmountCents, order.Currency, order.Items.Count, intent.Id);

            // 4. Hand the clientSecret to the frontend so Stripe.js can confirm the payment.
            //    Returned as a named record (not an anonymous object) so it appears in
            //    the OpenAPI contract and the frontend can generate its type.
            return Results.Created($"/orders/{order.Id}", new CreateOrderResponse(
                order.Id, intent.ClientSecret, order.AmountCents, order.Currency));
        })
            .WithTags("Orders")
            .WithSummary("Start a checkout")
            .WithDescription(
                "Creates a Pending order (with its line items) and a matching Stripe PaymentIntent, " +
                "then returns the clientSecret the frontend uses to confirm the card.\n\n" +
                "Body: currency (lowercase ISO code, e.g. \"eur\") and items[] (each with productId, " +
                "title, unitAmountCents, quantity). The charged total is the sum of the items.")
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

/// <summary>An order as shown in the admin list, with the customer who placed it.</summary>
/// <param name="Id">The order id.</param>
/// <param name="AmountCents">Amount in the smallest currency unit (cents).</param>
/// <param name="Currency">Lowercase ISO currency code, e.g. "eur".</param>
/// <param name="Status">Order status (Pending/Paid/Failed/Refunded).</param>
/// <param name="CreatedAt">When the order was created (UTC).</param>
/// <param name="CustomerEmail">Email of the account that placed it, or null if none.</param>
public record OrderResponse(
    Guid Id, long AmountCents, string Currency, OrderStatus Status, DateTime CreatedAt, string? CustomerEmail);

/// <summary>Request body to start a checkout. The charged total is the sum of the items.</summary>
/// <param name="Currency">Lowercase ISO currency code. Example: "eur".</param>
/// <param name="Items">The line items being purchased (at least one).</param>
public record CreateOrderRequest(string Currency, IReadOnlyList<OrderItemInput> Items);

/// <summary>One line item in a checkout request.</summary>
/// <param name="ProductId">The catalog (DummyJSON) product id. 0 for the admin's manual charge.</param>
/// <param name="Title">The product title, shown later in the order detail.</param>
/// <param name="UnitAmountCents">Unit price in the smallest unit of the order currency (cents).</param>
/// <param name="Quantity">How many of this product (positive integer).</param>
/// <param name="Thumbnail">Optional product image URL.</param>
public record OrderItemInput(int ProductId, string Title, long UnitAmountCents, int Quantity, string? Thumbnail);

/// <summary>One line item as returned in an order's detail.</summary>
/// <param name="ProductId">The catalog product id (0 for a manual charge).</param>
/// <param name="Title">The product title snapshot.</param>
/// <param name="UnitAmountCents">Unit price in the smallest currency unit (cents).</param>
/// <param name="Quantity">How many of this product.</param>
/// <param name="Thumbnail">Product image URL, or null.</param>
public record OrderItemResponse(int ProductId, string Title, long UnitAmountCents, int Quantity, string? Thumbnail);

/// <summary>Full detail of one order, including its line items — the admin detail view.</summary>
/// <param name="Id">The order id.</param>
/// <param name="AmountCents">Total amount in the smallest currency unit (cents).</param>
/// <param name="Currency">Lowercase ISO currency code, e.g. "eur".</param>
/// <param name="Status">Order status (Pending/Paid/Failed/Refunded).</param>
/// <param name="CreatedAt">When the order was created (UTC).</param>
/// <param name="CustomerEmail">Email of the account that placed it, or null if none.</param>
/// <param name="StripePaymentIntentId">The Stripe PaymentIntent id (deep-link to the Stripe dashboard).</param>
/// <param name="Items">The products purchased.</param>
public record OrderDetailResponse(
    Guid Id, long AmountCents, string Currency, OrderStatus Status, DateTime CreatedAt,
    string? CustomerEmail, string? StripePaymentIntentId, IReadOnlyList<OrderItemResponse> Items);

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
