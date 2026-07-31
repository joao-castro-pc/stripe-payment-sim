using Microsoft.Data.Sqlite;
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
        app.MapPost("/webhook", async (HttpRequest request, AppDbContext db, OrderNotifier notifier, CancellationToken ct) =>
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

            // 5a. React to outcomes and map each to a new order status + the PaymentIntent
            //     id we match our order on. Note the object type differs per event:
            //       - payment_intent.* events carry a PaymentIntent (id is its own id)
            //       - charge.refunded carries a Charge (id is on charge.PaymentIntentId)
            var orderChanged = false;
            string? paymentIntentId = null;
            OrderStatus? newStatus = null;
            switch (stripeEvent.Type)
            {
                case EventTypes.PaymentIntentSucceeded when stripeEvent.Data.Object is PaymentIntent pi:
                    (paymentIntentId, newStatus) = (pi.Id, OrderStatus.Paid);
                    break;
                case EventTypes.PaymentIntentPaymentFailed when stripeEvent.Data.Object is PaymentIntent pi:
                    (paymentIntentId, newStatus) = (pi.Id, OrderStatus.Failed);
                    break;
                case EventTypes.ChargeRefunded when stripeEvent.Data.Object is Charge charge:
                    (paymentIntentId, newStatus) = (charge.PaymentIntentId, OrderStatus.Refunded);
                    break;
                // any other event type: nothing to do
            }

            // A recognised event type whose payload didn't deserialize to the expected
            // object (e.g. a Stripe API-version mismatch between the account and the SDK)
            // would fall through the guards above with newStatus still null and be treated
            // exactly like an event we don't care about — silently dropping a real outcome.
            // Retrying wouldn't fix a version mismatch, so we don't ask Stripe to redeliver;
            // we just make the miss LOUD instead of invisible.
            if (newStatus is null && stripeEvent.Type is EventTypes.PaymentIntentSucceeded
                    or EventTypes.PaymentIntentPaymentFailed or EventTypes.ChargeRefunded)
            {
                webhookLog.LogError("Handled event type {Type} ({Id}) but its payload was not the expected object — ignoring",
                    stripeEvent.Type, stripeEvent.Id);
            }

            if (newStatus is not null && paymentIntentId is not null)
            {
                // The order might not exist YET: Stripe can deliver this webhook before
                // POST /orders has committed the order row (a race). Retry a few times
                // with a short delay before giving up, so a slightly-late commit still
                // gets matched instead of the payment being silently lost.
                const int maxAttempts = 3;
                var order = await db.Orders.FirstOrDefaultAsync(o => o.StripePaymentIntentId == paymentIntentId, ct);
                for (var attempt = 2; order is null && attempt <= maxAttempts; attempt++)
                {
                    await Task.Delay(150, ct);
                    order = await db.Orders.FirstOrDefaultAsync(o => o.StripePaymentIntentId == paymentIntentId, ct);
                }

                if (order is null)
                {
                    // Retried and still no matching order. We can't tell two cases apart:
                    //  (a) the event isn't ours — e.g. `stripe trigger` makes its own
                    //      PaymentIntent that no order references; or
                    //  (b) it IS ours, but POST /orders hasn't committed the row yet (a
                    //      commit slower than our ~450 ms retry budget).
                    // We must NOT record it as processed and MUST NOT return 2xx: a 2xx
                    // tells Stripe "handled, stop retrying", which for case (b) loses a real
                    // payment forever (the order stays Pending though the card was charged,
                    // and the idempotency fast-path would swallow any later redelivery).
                    // Returning 5xx makes Stripe redeliver later (it backs off over hours) —
                    // that heals (b); a genuinely-foreign (a) event just gets retried a few
                    // times and then Stripe gives up. Harmless.
                    webhookLog.LogWarning("⚠️ No order for PaymentIntent {Pi} after {Attempts} attempts — asking Stripe to retry", paymentIntentId, maxAttempts);
                    return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
                }
                // Only apply a SANE transition. Stripe delivers at-least-once and can
                // deliver out of order, so a late/duplicate event must not corrupt state
                // (e.g. a stray payment_failed arriving after succeeded must NOT flip a
                // Paid order to Failed). Legal moves: Pending->Paid, Failed->Paid,
                // Pending->Failed, Paid->Refunded. Anything else is ignored (but still
                // recorded as processed). Failed->Paid matters: with the Payment Element a
                // single PaymentIntent survives a declined card, so Stripe can emit
                // payment_failed then payment_intent.succeeded on a retry — without this the
                // order would stay Failed while the card was actually charged.
                if (newStatus.Value switch
                {
                    OrderStatus.Paid => order.Status is OrderStatus.Pending or OrderStatus.Failed,
                    OrderStatus.Failed => order.Status == OrderStatus.Pending,
                    OrderStatus.Refunded => order.Status == OrderStatus.Paid,
                    _ => false,
                })
                {
                    order.Status = newStatus.Value;
                    orderChanged = true;
                    var (icon, verb) = newStatus.Value switch
                    {
                        OrderStatus.Paid => ("✅", "Paid"),
                        OrderStatus.Failed => ("❌", "Failed"),
                        OrderStatus.Refunded => ("↩️", "Refunded"),
                        _ => ("ℹ️", newStatus.Value.ToString())
                    };
                    webhookLog.LogInformation("{Icon} Order {Order} -> {Verb} (PaymentIntent {Pi})", icon, order.Id, verb, paymentIntentId);
                }
                else
                {
                    // Not a legal transition for the order's current state — ignore it.
                    webhookLog.LogWarning("⏭️ Ignored {New} for order {Order} already {Current} (PaymentIntent {Pi})",
                        newStatus.Value, order.Id, order.Status, paymentIntentId);
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
            catch (DbUpdateException ex) when (ex.InnerException is SqliteException { SqliteErrorCode: 19 })
            {
                // SQLITE_CONSTRAINT (19): another concurrent delivery inserted the same event
                // id first -> the PK conflict means this really is a duplicate, so swallow it
                // and answer 2xx. We filter on the error code deliberately: a bare
                // `catch (DbUpdateException)` would ALSO swallow a locked DB (SQLITE_BUSY),
                // disk-full or I/O error as if it were a duplicate — recording success and
                // telling Stripe to stop retrying while the order update was actually rolled
                // back. Any non-constraint DbUpdateException now propagates -> 500 -> Stripe
                // redelivers.
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
