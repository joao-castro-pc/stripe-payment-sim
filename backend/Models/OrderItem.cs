namespace PaymentSim.Api.Models;

// One line of a purchase: a product and how many of it. An Order has many
// OrderItems (one-to-many). The catalog itself is the external DummyJSON API,
// not our database, so we snapshot the fields we want to show later (title,
// unit price, thumbnail) onto the order at checkout time — that way the admin
// order detail still renders even if the product later changes or disappears
// upstream.
public class OrderItem
{
    public Guid Id { get; set; } = Guid.NewGuid();

    // The order this line belongs to. Set via the Order.Items navigation.
    public Guid OrderId { get; set; }
    public Order Order { get; set; } = null!;

    // The DummyJSON product id (their ids are plain integers). 0 is used as a
    // sentinel for the admin's manual "raw amount" checkout, which has no product.
    public int ProductId { get; set; }

    // Snapshot of the product's title at purchase time.
    public string Title { get; set; } = "";

    // Unit price in the smallest unit of the ORDER's currency (cents), matching
    // how Order.AmountCents is stored. The order total is the sum of
    // UnitAmountCents * Quantity across all its items.
    public long UnitAmountCents { get; set; }

    public int Quantity { get; set; }

    // Snapshot of the product thumbnail URL (optional — the manual line has none).
    public string? Thumbnail { get; set; }
}
