namespace PaymentSim.Api.Models;

// Records which Stripe webhook events we've already handled, so a redelivered
// event is processed at most once (idempotency). The Stripe event id is the key:
// a primary key is unique by definition, so a second insert of the same id fails
// at the database level — that's our real, atomic guard against duplicates.
public class ProcessedEvent
{
    // The Stripe event id, e.g. "evt_3TyVTG9...".
    public string Id { get; set; } = default!;

    public DateTime ProcessedAt { get; set; } = DateTime.UtcNow;
}
