using Stripe;

namespace PaymentSim.Api.Payments;

// The real implementation: talks to Stripe. This is the ONLY place in the app
// (besides startup config) that references Stripe's PaymentIntent API. It's the
// boundary — everything Stripe-specific stays behind IPaymentGateway.
public class StripePaymentGateway : IPaymentGateway
{
    public async Task<PaymentIntentResult> CreatePaymentIntentAsync(
        long amountCents, string currency, string orderId, CancellationToken ct = default)
    {
        try
        {
            // Metadata carries our order id so a later webhook can find the order.
            var intent = await new PaymentIntentService().CreateAsync(new PaymentIntentCreateOptions
            {
                Amount = amountCents,
                Currency = currency,
                PaymentMethodTypes = ["card"],
                Metadata = new Dictionary<string, string> { ["order_id"] = orderId }
            }, cancellationToken: ct);

            return new PaymentIntentResult(intent.Id, intent.ClientSecret);
        }
        catch (StripeException ex)
        {
            // Translate Stripe's exception into our own domain exception so the
            // endpoint doesn't need to know about Stripe.net to handle errors.
            throw new PaymentGatewayException(ex.StripeError?.Message ?? ex.Message);
        }
    }
}
