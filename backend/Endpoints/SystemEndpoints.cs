namespace PaymentSim.Api.Endpoints;

public static class SystemEndpoints
{
    public static void MapSystemEndpoints(this WebApplication app)
    {
        // NB: no MapGet("/") here. In the production image "/" must serve the SPA's
        // index.html (static files + SPA fallback); a root endpoint would shadow it.

        app.MapGet("/health", () => new { status = "ok" })
            .WithTags("System")
            .WithSummary("Liveness check")
            .WithDescription("Returns 200 with { status: \"ok\" } if the API is up. No parameters.");
    }
}
