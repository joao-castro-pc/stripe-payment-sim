var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/", () => "PaymentSim API");

// Health check: lets us (and later the frontend / Stripe CLI setup) confirm the API is up.
// Returning an object -> ASP.NET serializes it to JSON automatically.
app.MapGet("/health", () => new { status = "ok" });

app.Run();
