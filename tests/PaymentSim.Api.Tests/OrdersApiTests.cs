using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PaymentSim.Api.Data;
using PaymentSim.Api.Models;
using Xunit;

namespace PaymentSim.Api.Tests;

// Each test gets a fresh factory (fresh in-memory DB) so they don't interfere.
public class OrdersApiTests
{
    [Fact]
    public async Task Health_returns_ok()
    {
        using var factory = new TestAppFactory();
        var client = factory.CreateClient();

        var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<HealthResponse>();
        Assert.Equal("ok", body?.Status);
    }

    [Fact]
    public async Task CreateOrder_with_valid_items_creates_pending_order()
    {
        using var factory = new TestAppFactory();
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.PostAsJsonAsync("/orders",
            new { currency = "eur", items = new[] { Item(1999) } });

        // 201 Created, and the body carries the clientSecret the frontend needs.
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<CreateOrderResponse>();
        Assert.NotNull(body);
        Assert.Equal(1999, body!.AmountCents);
        Assert.Equal("eur", body.Currency);
        Assert.StartsWith("pi_fake_", body.ClientSecret);

        // The endpoint passed the summed total through to the gateway.
        Assert.Equal((1999, "eur", body.OrderId.ToString()), factory.Payments.LastCall);

        // And the order was persisted as Pending with its item and the fake PI id.
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var order = db.Orders.Include(o => o.Items).Single();
        Assert.Equal(OrderStatus.Pending, order.Status);
        Assert.Equal($"pi_fake_{order.Id}", order.StripePaymentIntentId);
        var item = Assert.Single(order.Items);
        Assert.Equal(1999, item.UnitAmountCents);
        Assert.Equal(1, item.Quantity);
    }

    [Fact]
    public async Task CreateOrder_totals_the_line_items_server_side()
    {
        using var factory = new TestAppFactory();
        var client = await factory.CreateAuthenticatedClientAsync();

        // 2 × 1000 + 1 × 500 = 2500. The client sends no total — the server sums it.
        var response = await client.PostAsJsonAsync("/orders",
            new { currency = "eur", items = new[] { Item(1000, qty: 2), Item(500, qty: 1, productId: 2) } });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<CreateOrderResponse>();
        Assert.Equal(2500, body!.AmountCents);
        // The gateway is charged the summed total, not any client-sent figure.
        Assert.Equal((2500L, "eur", body.OrderId.ToString()), factory.Payments.LastCall);
    }

    [Fact]
    public async Task CreateOrder_with_no_items_returns_400()
    {
        using var factory = new TestAppFactory();
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.PostAsJsonAsync("/orders",
            new { currency = "eur", items = Array.Empty<object>() });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Null(factory.Payments.LastCall);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-100)]
    public async Task CreateOrder_with_non_positive_item_amount_returns_400(long unitAmountCents)
    {
        using var factory = new TestAppFactory();
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.PostAsJsonAsync("/orders",
            new { currency = "eur", items = new[] { Item(unitAmountCents) } });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        // Guard runs before the gateway — so it was never called.
        Assert.Null(factory.Payments.LastCall);
    }

    [Fact]
    public async Task CreateOrder_normalizes_currency_to_lowercase()
    {
        using var factory = new TestAppFactory();
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.PostAsJsonAsync("/orders",
            new { currency = "USD", items = new[] { Item(1999) } });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<CreateOrderResponse>();
        Assert.Equal("usd", body!.Currency);
        // The gateway (and the persisted order) get the normalized value.
        Assert.Equal((1999L, "usd", body.OrderId.ToString()), factory.Payments.LastCall);
    }

    [Theory]
    [InlineData("")]
    [InlineData("e")]
    [InlineData("euro")]
    [InlineData("u5d")]
    public async Task CreateOrder_with_invalid_currency_returns_400(string currency)
    {
        using var factory = new TestAppFactory();
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.PostAsJsonAsync("/orders",
            new { currency, items = new[] { Item(1999) } });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        // Rejected before reaching the gateway.
        Assert.Null(factory.Payments.LastCall);
    }

    [Fact]
    public async Task CreateOrder_when_gateway_rejects_returns_400()
    {
        using var factory = new TestAppFactory();
        factory.Payments.ShouldFail = true;
        factory.Payments.FailMessage = "Amount must be at least €0.50";
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.PostAsJsonAsync("/orders",
            new { currency = "eur", items = new[] { Item(3) } });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        // No order should be persisted when the provider rejects.
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Empty(db.Orders);
    }

    [Fact]
    public async Task Order_is_attributed_to_the_customer_who_created_it()
    {
        using var factory = new TestAppFactory();

        // A customer registers and places an order.
        var customer = await factory.CreateCustomerClientAsync("shopper@test.local", "hunter2!");
        var created = await customer.PostAsJsonAsync("/orders",
            new { currency = "eur", items = new[] { Item(1999) } });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);

        // The admin lists orders and sees who placed it.
        var admin = await factory.CreateAuthenticatedClientAsync();
        var orders = await admin.GetFromJsonAsync<List<OrderRow>>("/orders");

        var row = Assert.Single(orders!);
        Assert.Equal("shopper@test.local", row.CustomerEmail);
    }

    [Fact]
    public async Task GetOrderDetail_returns_items_and_payment_intent()
    {
        using var factory = new TestAppFactory();
        var client = await factory.CreateAuthenticatedClientAsync();

        // Place an order with two lines, then fetch its detail.
        var created = await client.PostAsJsonAsync("/orders",
            new { currency = "eur", items = new[] { Item(1000, qty: 2, title: "Mug"), Item(500, title: "Sticker", productId: 2) } });
        var createdBody = await created.Content.ReadFromJsonAsync<CreateOrderResponse>();
        var orderId = createdBody!.OrderId;

        var detail = await client.GetFromJsonAsync<OrderDetail>($"/orders/{orderId}");

        Assert.NotNull(detail);
        Assert.Equal(orderId, detail!.Id);
        Assert.Equal(2500, detail.AmountCents);
        Assert.Equal($"pi_fake_{orderId}", detail.StripePaymentIntentId);
        Assert.Equal(2, detail.Items.Count);
        // Items come back ordered by title: "Mug" then "Sticker".
        Assert.Equal("Mug", detail.Items[0].Title);
        Assert.Equal(2, detail.Items[0].Quantity);
        Assert.Equal("Sticker", detail.Items[1].Title);
    }

    [Fact]
    public async Task GetOrderDetail_unknown_order_returns_404()
    {
        using var factory = new TestAppFactory();
        var client = await factory.CreateAuthenticatedClientAsync();

        var response = await client.GetAsync($"/orders/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task GetOrderDetail_is_admin_only()
    {
        using var factory = new TestAppFactory();
        // A signed-in customer places an order...
        var customer = await factory.CreateCustomerClientAsync("nosey@test.local", "hunter2!");
        var created = await customer.PostAsJsonAsync("/orders",
            new { currency = "eur", items = new[] { Item(1999) } });
        var body = await created.Content.ReadFromJsonAsync<CreateOrderResponse>();

        // ...but a customer must not read the admin order detail (403).
        var response = await customer.GetAsync($"/orders/{body!.OrderId}");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    // A checkout line item. Sensible defaults; override per test.
    private static object Item(long unitAmountCents, int qty = 1, string title = "Test product", int productId = 1, string? thumbnail = null)
        => new { productId, title, unitAmountCents, quantity = qty, thumbnail };

    // Response DTOs used only for deserializing in tests.
    private record HealthResponse(string Status);
    private record CreateOrderResponse(Guid OrderId, string ClientSecret, long AmountCents, string Currency);
    private record OrderRow(Guid Id, long AmountCents, string Currency, string Status, DateTime CreatedAt, string? CustomerEmail);
    private record OrderDetail(Guid Id, long AmountCents, string Currency, string Status, DateTime CreatedAt,
        string? CustomerEmail, string? StripePaymentIntentId, List<OrderItemRow> Items);
    private record OrderItemRow(int ProductId, string Title, long UnitAmountCents, int Quantity, string? Thumbnail);
}
