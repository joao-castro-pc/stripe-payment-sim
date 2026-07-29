using Microsoft.EntityFrameworkCore;
using PaymentSim.Api.Data;
using PaymentSim.Api.Models;
using Stripe;

namespace PaymentSim.Api.Endpoints;

public static class WebhookEndpoints
{
    public static void MapWebhookEndpoints(this WebApplication app)
    {
        var webhookLog = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Webhook");

        // The webhook signing secret ("whsec_..."). Stripe signs every webhook with
        // it; we verify against it. Read once at startup from configuration.
        var webhookSecret = app.Configuration["Stripe:WebhookSecret"];

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

            // 5a. React to payment outcomes: succeeded -> Paid, payment_failed -> Failed.
            //     Match our order by PaymentIntent id (linked in Step 4) and set its status.
            var orderChanged = false;
            OrderStatus? newStatus = stripeEvent.Type switch
            {
                EventTypes.PaymentIntentSucceeded => OrderStatus.Paid,
                EventTypes.PaymentIntentPaymentFailed => OrderStatus.Failed,
                _ => null // any other event type: nothing to do
            };

            if (newStatus is not null && stripeEvent.Data.Object is PaymentIntent paymentIntent)
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
                    order.Status = newStatus.Value;
                    orderChanged = true;
                    if (newStatus == OrderStatus.Paid)
                        webhookLog.LogInformation("✅ Order {Order} -> Paid (PaymentIntent {Pi})", order.Id, paymentIntent.Id);
                    else
                        webhookLog.LogWarning("❌ Order {Order} -> Failed (PaymentIntent {Pi})", order.Id, paymentIntent.Id);
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
                if (orderChanged)
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
    }
}
