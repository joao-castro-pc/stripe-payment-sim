namespace PaymentSim.Api.Models;

// The status an order can be in. Starts Pending; a webhook flips it to Paid
// (payment succeeded) or Failed (payment_intent.payment_failed).
public enum OrderStatus
{
    Pending,
    Paid,
    Failed
}

// One purchase in our fake shop.
public class Order
{
    public Guid Id { get; set; } = Guid.NewGuid();

    // Money in the smallest currency unit (cents). Stripe works in cents too,
    // so storing cents avoids floating-point rounding bugs. e.g. 1999 = 19.99 EUR.
    public long AmountCents { get; set; }

    public string Currency { get; set; } = "eur";

    public OrderStatus Status { get; set; } = OrderStatus.Pending;

    // The Stripe PaymentIntent this order is paying through (e.g. "pi_3Nx...").
    // Set when we create the checkout; it's how we match an incoming webhook
    // back to our order. Null until the PaymentIntent is created.
    public string? StripePaymentIntentId { get; set; }

    // Stored as UTC. We use DateTime (not DateTimeOffset) because SQLite can't
    // translate ORDER BY over DateTimeOffset into SQL. Always store UTC and
    // convert to the user's local time in the UI.
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
