using System.Net;
using System.Net.Http.Json;
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
    public async Task CreateOrder_with_valid_amount_creates_pending_order()
    {
        using var factory = new TestAppFactory();
        var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/orders", new { amountCents = 1999, currency = "eur" });

        // 201 Created, and the body carries the clientSecret the frontend needs.
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<CreateOrderResponse>();
        Assert.NotNull(body);
        Assert.Equal(1999, body!.AmountCents);
        Assert.Equal("eur", body.Currency);
        Assert.StartsWith("pi_fake_", body.ClientSecret);

        // The endpoint passed our values through to the gateway.
        Assert.Equal((1999, "eur", body.OrderId.ToString()), factory.Payments.LastCall);

        // And the order was persisted as Pending with the fake PaymentIntent id.
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var order = Assert.Single(db.Orders);
        Assert.Equal(OrderStatus.Pending, order.Status);
        Assert.Equal($"pi_fake_{order.Id}", order.StripePaymentIntentId);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-100)]
    public async Task CreateOrder_with_non_positive_amount_returns_400(long amountCents)
    {
        using var factory = new TestAppFactory();
        var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/orders", new { amountCents, currency = "eur" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        // Guard runs before the gateway — so it was never called.
        Assert.Null(factory.Payments.LastCall);
    }

    [Fact]
    public async Task CreateOrder_when_gateway_rejects_returns_400()
    {
        using var factory = new TestAppFactory();
        factory.Payments.ShouldFail = true;
        factory.Payments.FailMessage = "Amount must be at least €0.50";
        var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/orders", new { amountCents = 3, currency = "eur" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        // No order should be persisted when the provider rejects.
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Empty(db.Orders);
    }

    // Response DTOs used only for deserializing in tests.
    private record HealthResponse(string Status);
    private record CreateOrderResponse(Guid OrderId, string ClientSecret, long AmountCents, string Currency);
}
