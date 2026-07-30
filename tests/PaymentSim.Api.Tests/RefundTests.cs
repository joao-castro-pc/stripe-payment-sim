using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PaymentSim.Api.Data;
using PaymentSim.Api.Models;
using Xunit;

namespace PaymentSim.Api.Tests;

public class RefundTests
{
    [Fact]
    public async Task Refund_unknown_order_returns_404()
    {
        using var factory = new TestAppFactory();
        var client = factory.CreateClient();

        var response = await client.PostAsync($"/orders/{Guid.NewGuid()}/refund", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Theory]
    [InlineData(OrderStatus.Pending)]
    [InlineData(OrderStatus.Failed)]
    [InlineData(OrderStatus.Refunded)]
    public async Task Refund_non_paid_order_returns_400(OrderStatus status)
    {
        using var factory = new TestAppFactory();
        var client = factory.CreateClient();
        var id = SeedOrder(factory, status, "pi_x");

        var response = await client.PostAsync($"/orders/{id}/refund", null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        // Gateway must not be asked to refund a non-paid order.
        Assert.Null(factory.Payments.LastRefundPaymentIntentId);
    }

    [Fact]
    public async Task Refund_paid_order_returns_202_and_asks_gateway()
    {
        using var factory = new TestAppFactory();
        var client = factory.CreateClient();
        var id = SeedOrder(factory, OrderStatus.Paid, "pi_paid");

        var response = await client.PostAsync($"/orders/{id}/refund", null);

        // 202 Accepted: refund requested, not yet confirmed.
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        // Body echoes the order and a pending status the frontend can show.
        var body = await response.Content.ReadFromJsonAsync<RefundResponseDto>();
        Assert.NotNull(body);
        Assert.Equal(id, body!.OrderId);
        Assert.Equal("refund_pending", body.Status);
        Assert.False(string.IsNullOrWhiteSpace(body.Message));
        // The endpoint asked the gateway to refund the right PaymentIntent.
        Assert.Equal("pi_paid", factory.Payments.LastRefundPaymentIntentId);
        // Status is NOT changed yet — that's the webhook's job (see WebhookTests).
        Assert.Equal(OrderStatus.Paid, GetOrder(factory, id).Status);
    }

    [Fact]
    public async Task Refund_when_gateway_rejects_returns_400()
    {
        using var factory = new TestAppFactory();
        factory.Payments.RefundShouldFail = true;
        var client = factory.CreateClient();
        var id = SeedOrder(factory, OrderStatus.Paid, "pi_paid");

        var response = await client.PostAsync($"/orders/{id}/refund", null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(OrderStatus.Paid, GetOrder(factory, id).Status);
    }

    // --- helpers ---------------------------------------------------------

    private static Guid SeedOrder(TestAppFactory factory, OrderStatus status, string paymentIntentId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var order = new Order
        {
            AmountCents = 1999,
            Currency = "eur",
            Status = status,
            StripePaymentIntentId = paymentIntentId
        };
        db.Orders.Add(order);
        db.SaveChanges();
        return order.Id;
    }

    private static Order GetOrder(TestAppFactory factory, Guid id)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return db.Orders.AsNoTracking().Single(o => o.Id == id);
    }

    // Shape of the 202 body, used only to assert the response contract. 
    //asd
    private record RefundResponseDto(Guid OrderId, string Status, string Message);
}
