namespace PaymentSim.Api.Payments;

// Abstraction over the payment provider (Stripe). The endpoints depend on THIS
// interface, not on Stripe.net directly. Two payoffs:
//   1. Testability — tests inject a fake gateway (no network, no real Stripe).
//   2. Decoupling — if we ever swap Stripe for another provider, only the
//      implementation changes; the endpoints don't.
public interface IPaymentGateway
{
    // Create a payment intent for an order. Returns the provider id + the
    // clientSecret the frontend needs to confirm the card.
    // Throws PaymentGatewayException if the provider rejects the request.
    Task<PaymentIntentResult> CreatePaymentIntentAsync(
        long amountCents, string currency, string orderId, CancellationToken ct = default);
}

// What the gateway hands back — just the two fields the endpoint uses. No Stripe
// types leak out, so callers never take a dependency on Stripe.net.
public record PaymentIntentResult(string Id, string ClientSecret);

// Domain-level failure from the gateway (e.g. amount below the currency minimum,
// unknown currency). The endpoint catches THIS instead of StripeException, so it
// stays free of Stripe types.
public class PaymentGatewayException : Exception
{
    public PaymentGatewayException(string message) : base(message) { }
}
