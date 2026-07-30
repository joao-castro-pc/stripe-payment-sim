using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using PaymentSim.Api.Data;
using PaymentSim.Api.Models;
using Stripe;
using Xunit;

namespace PaymentSim.Api.Tests;

public class WebhookTests
{
    [Fact]
    public async Task Webhook_without_signature_returns_400()
    {
        using var factory = new TestAppFactory();
        var client = factory.CreateClient();

        var payload = EventJson("evt_1", EventTypes.PaymentIntentSucceeded, "pi_x");
        var response = await PostWebhook(client, payload, signature: null);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Webhook_with_invalid_signature_returns_400()
    {
        using var factory = new TestAppFactory();
        var client = factory.CreateClient();

        var payload = EventJson("evt_1", EventTypes.PaymentIntentSucceeded, "pi_x");
        // A syntactically valid header, but the HMAC is wrong -> verification fails.
        var response = await PostWebhook(client, payload, signature: "t=123,v1=deadbeef");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Webhook_payment_succeeded_marks_order_paid()
    {
        using var factory = new TestAppFactory();
        var client = factory.CreateClient();
        var orderId = SeedOrder(factory, paymentIntentId: "pi_123");

        var payload = EventJson("evt_ok", EventTypes.PaymentIntentSucceeded, "pi_123");
        var response = await PostWebhook(client, payload, Sign(payload));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(OrderStatus.Paid, GetOrder(factory, orderId).Status);
        Assert.True(EventWasRecorded(factory, "evt_ok"));
    }

    [Fact]
    public async Task Webhook_payment_failed_marks_order_failed()
    {
        using var factory = new TestAppFactory();
        var client = factory.CreateClient();
        var orderId = SeedOrder(factory, paymentIntentId: "pi_456");

        var payload = EventJson("evt_fail", EventTypes.PaymentIntentPaymentFailed, "pi_456");
        var response = await PostWebhook(client, payload, Sign(payload));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(OrderStatus.Failed, GetOrder(factory, orderId).Status);
    }

    [Fact]
    public async Task Webhook_duplicate_event_processed_once()
    {
        using var factory = new TestAppFactory();
        var client = factory.CreateClient();
        var orderId = SeedOrder(factory, paymentIntentId: "pi_789");

        // First delivery: succeeded -> Paid.
        var paid = EventJson("evt_dup", EventTypes.PaymentIntentSucceeded, "pi_789");
        var first = await PostWebhook(client, paid, Sign(paid));
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal(OrderStatus.Paid, GetOrder(factory, orderId).Status);

        // Redelivery with the SAME event id but a "failed" body. Idempotency must
        // ignore it entirely — the order stays Paid, not flipped to Failed.
        var failedSameId = EventJson("evt_dup", EventTypes.PaymentIntentPaymentFailed, "pi_789");
        var second = await PostWebhook(client, failedSameId, Sign(failedSameId));
        Assert.Equal(HttpStatusCode.OK, second.StatusCode);
        Assert.Equal(OrderStatus.Paid, GetOrder(factory, orderId).Status);

        // Recorded exactly once.
        Assert.Equal(1, CountEvents(factory, "evt_dup"));
    }

    [Fact]
    public async Task Webhook_charge_refunded_marks_order_refunded()
    {
        using var factory = new TestAppFactory();
        var client = factory.CreateClient();
        var orderId = SeedOrder(factory, paymentIntentId: "pi_ref", status: OrderStatus.Paid);

        // charge.refunded carries a Charge (not a PaymentIntent); we match the order
        // via charge.payment_intent.
        var payload = ChargeEventJson("evt_ref", EventTypes.ChargeRefunded, "pi_ref");
        var response = await PostWebhook(client, payload, Sign(payload));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(OrderStatus.Refunded, GetOrder(factory, orderId).Status);
    }

    // --- helpers ---------------------------------------------------------

    private const string Secret = TestAppFactory.WebhookSecret;
    private static string Sign(string payload) => StripeSignature.Sign(payload, Secret);

    private static async Task<HttpResponseMessage> PostWebhook(HttpClient client, string payload, string? signature)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, "/webhook")
        {
            Content = new StringContent(payload, Encoding.UTF8, "application/json")
        };
        if (signature is not null)
            req.Headers.TryAddWithoutValidation("Stripe-Signature", signature);
        return await client.SendAsync(req);
    }

    // A minimal but valid Stripe event envelope. api_version must match the SDK's,
    // or ConstructEvent throws on version mismatch. object=payment_intent tells the
    // deserializer to materialize data.object as a PaymentIntent.
    // (@object => the JSON key "object"; C# keyword needs the @ prefix.)
    private static string EventJson(string eventId, string type, string paymentIntentId) =>
        JsonSerializer.Serialize(new
        {
            id = eventId,
            @object = "event",
            api_version = StripeConfiguration.ApiVersion,
            type,
            data = new { @object = new { id = paymentIntentId, @object = "payment_intent" } }
        });

    private static Guid SeedOrder(TestAppFactory factory, string paymentIntentId, OrderStatus status = OrderStatus.Pending)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var order = new Order { AmountCents = 1999, Currency = "eur", Status = status, StripePaymentIntentId = paymentIntentId };
        db.Orders.Add(order);
        db.SaveChanges();
        return order.Id;
    }

    // Like EventJson, but data.object is a Charge (object=charge) with a
    // payment_intent field — the shape of a charge.refunded event.
    private static string ChargeEventJson(string eventId, string type, string paymentIntentId) =>
        JsonSerializer.Serialize(new
        {
            id = eventId,
            @object = "event",
            api_version = StripeConfiguration.ApiVersion,
            type,
            data = new { @object = new { id = "ch_test", @object = "charge", payment_intent = paymentIntentId } }
        });

    private static Order GetOrder(TestAppFactory factory, Guid id)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return db.Orders.AsNoTracking().Single(o => o.Id == id);
    }

    private static bool EventWasRecorded(TestAppFactory factory, string eventId) => CountEvents(factory, eventId) == 1;

    private static int CountEvents(TestAppFactory factory, string eventId)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return db.ProcessedEvents.Count(e => e.Id == eventId);
    }
}
