using System.Security.Cryptography;
using System.Text;

namespace PaymentSim.Api.Tests;

// Produces a valid "Stripe-Signature" header for a payload, the same way Stripe
// signs webhooks. Lets tests exercise the REAL verification in our endpoint
// (EventUtility.ConstructEvent) instead of bypassing it.
//
// Header format:  t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<payload>">
// keyed with the webhook signing secret.
public static class StripeSignature
{
    public static string Sign(string payload, string secret)
    {
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var signedPayload = $"{timestamp}.{payload}";

        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(signedPayload));
        var hex = Convert.ToHexString(hash).ToLowerInvariant();

        return $"t={timestamp},v1={hex}";
    }
}
