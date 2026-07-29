namespace PaymentSim.Api.Endpoints;

public static class SystemEndpoints
{
    public static void MapSystemEndpoints(this WebApplication app)
    {
        app.MapGet("/", () => "PaymentSim API")
            .ExcludeFromDescription(); // hide the plain-text root from Swagger

        app.MapGet("/health", () => new { status = "ok" })
            .WithTags("System")
            .WithSummary("Liveness check")
            .WithDescription("Returns 200 with { status: \"ok\" } if the API is up. No parameters.");
    }
}
