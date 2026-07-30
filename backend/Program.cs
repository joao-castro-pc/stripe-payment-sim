using Microsoft.EntityFrameworkCore;
using PaymentSim.Api;
using PaymentSim.Api.Data;
using PaymentSim.Api.Endpoints;
using PaymentSim.Api.Payments;
using Stripe;

var builder = WebApplication.CreateBuilder(args);

// Console logs: one line per entry, with a short timestamp. Replaces the default
// two-line formatter so our webhook/checkout logs are easy to scan.
builder.Logging.ClearProviders();
builder.Logging.AddSimpleConsole(options =>
{
    options.SingleLine = true;
    options.TimestampFormat = "HH:mm:ss ";
});

// Connection string from config so production can point SQLite at a persistent
// volume (e.g. "Data Source=/data/paymentsim.db" via ConnectionStrings__Default).
// Falls back to a local file for development.
var connectionString = builder.Configuration.GetConnectionString("Default")
    ?? "Data Source=paymentsim.db";
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(connectionString));

// Serialize enums as their NAMES ("Paid") instead of numbers (1) in JSON. The
// wire format becomes self-describing, and the OpenAPI schema exposes the exact
// string values — so the frontend's generated types are a real union
// ("Pending" | "Paid" | ...) instead of an opaque number.
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));

// Singleton: one shared notifier for the whole app (holds the SSE subscribers).
builder.Services.AddSingleton<OrderNotifier>();

// The payment gateway. Endpoints depend on IPaymentGateway; DI hands them the
// real Stripe implementation here. Tests register a fake instead.
builder.Services.AddScoped<IPaymentGateway, StripePaymentGateway>();

// Swagger: an in-browser UI to explore and call the API by hand (dev only).
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new() { Title = "PaymentSim API", Version = "v1" });

    // Feed our XML doc comments into Swagger so summaries/examples show up.
    var xmlFile = $"{System.Reflection.Assembly.GetExecutingAssembly().GetName().Name}.xml";
    options.IncludeXmlComments(Path.Combine(AppContext.BaseDirectory, xmlFile));
});

// CORS: the frontend (http://localhost:5173) is a different origin from this API
// (http://localhost:5144). Browsers block cross-origin calls unless the server
// opts in. This policy lets our dev frontend call the API. (Webhooks are
// server-to-server and don't involve CORS.)
builder.Services.AddCors(options =>
    options.AddPolicy("frontend", policy =>
        policy.WithOrigins("http://localhost:5173")
              .AllowAnyHeader()
              .AllowAnyMethod()));

var app = builder.Build();

app.UseCors("frontend");

// Serve the built React app (copied into wwwroot in the Docker image). In a
// single-container ("monolith") deploy the API and the SPA share one origin, so
// there's no CORS and the frontend calls the API with a relative base URL.
// In local dev there's no wwwroot, so these are no-ops and Vite serves the SPA.
app.UseDefaultFiles();
app.UseStaticFiles();

// Serve Swagger UI at /swagger while developing.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Tell the Stripe SDK which secret key to use for every API call.
// The key comes from configuration (user-secrets in dev) — never hard-coded.
StripeConfiguration.ApiKey = builder.Configuration["Stripe:SecretKey"];

// Dev-only: create the SQLite file + tables if they don't exist yet.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
}

// Endpoints, grouped by area (see Endpoints/*.cs).
app.MapSystemEndpoints();
app.MapOrderEndpoints();
app.MapWebhookEndpoints();

// Destructive dev tools — only exist in Development.
if (app.Environment.IsDevelopment())
    app.MapDevEndpoints();

// SPA fallback: any request that didn't match an API route or a static file
// returns index.html, so client-side routes (/checkout, /admin) work on reload.
// Harmless in dev (no index.html present) since Vite serves the SPA there.
app.MapFallbackToFile("index.html");

app.Run();

// Program uses top-level statements, which compile into an internal Program class.
// WebApplicationFactory<Program> (in the test project) needs it public to boot the
// app in-memory. This one line exposes it — no behaviour change.
public partial class Program { }
