using System.Net;

namespace PaymentSim.Api;

// Shared guards for destructive dev endpoints (reset, delete).
public static class RequestGuards
{
    // Returns a failing IResult if the request must be rejected, or null if it's OK.
    // Two checks:
    //   1. Loopback only — the real socket peer IP must be localhost (127.0.0.1 / ::1),
    //      not a spoofable header. A remote caller can never pass this.
    //   2. Explicit confirmation — ?confirm=true, so an accidental call can't destroy data.
    public static IResult? RequireLocalAndConfirmed(HttpContext http, bool confirm, ILogger log, string action)
    {
        var ip = http.Connection.RemoteIpAddress;
        if (ip is null || !IPAddress.IsLoopback(ip))
        {
            log.LogWarning("🚫 {Action} blocked for non-local caller {Ip}", action, ip);
            return Results.NotFound();
        }

        if (!confirm)
            return Results.BadRequest(new { error = $"{action} is destructive. Add ?confirm=true to proceed." });

        return null;
    }
}
