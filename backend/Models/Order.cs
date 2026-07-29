namespace PaymentSim.Api.Models;

// The status an order can be in. Starts Pending; flips to Paid when Stripe
// tells us (via webhook) the payment succeeded.
public enum OrderStatus
{
    Pending,
    Paid
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

    // Stored as UTC. We use DateTime (not DateTimeOffset) because SQLite can't
    // translate ORDER BY over DateTimeOffset into SQL. Always store UTC and
    // convert to the user's local time in the UI.
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
