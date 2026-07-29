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

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite("Data Source=paymentsim.db"));

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

app.Run();
