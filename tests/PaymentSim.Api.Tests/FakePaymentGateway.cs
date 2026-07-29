using PaymentSim.Api.Payments;

namespace PaymentSim.Api.Tests;

// Test double for IPaymentGateway. No network, no real Stripe — returns
// deterministic ids so tests can assert on them. Flip ShouldFail to exercise
// the endpoint's error path (provider rejects -> 400).
public class FakePaymentGateway : IPaymentGateway
{
    public bool ShouldFail { get; set; }
    public string FailMessage { get; set; } = "amount too small";

    // Records the last call so tests can assert what the endpoint passed in.
    public (long amountCents, string currency, string orderId)? LastCall { get; private set; }

    public Task<PaymentIntentResult> CreatePaymentIntentAsync(
        long amountCents, string currency, string orderId, CancellationToken ct = default)
    {
        LastCall = (amountCents, currency, orderId);

        if (ShouldFail)
            throw new PaymentGatewayException(FailMessage);

        // Deterministic fake ids derived from the order id (no randomness).
        return Task.FromResult(new PaymentIntentResult($"pi_fake_{orderId}", $"pi_fake_{orderId}_secret"));
    }
}
