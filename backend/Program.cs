using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using PaymentSim.Api;
using PaymentSim.Api.Data;
using PaymentSim.Api.Endpoints;
using PaymentSim.Api.Models;
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

// Password hashing for the seeded admin login. PasswordHasher is part of ASP.NET
// Core Identity's primitives (no full Identity system needed) — salted PBKDF2.
builder.Services.AddSingleton<IPasswordHasher<AppUser>, PasswordHasher<AppUser>>();

// Cookie authentication. On login we write an encrypted, HttpOnly cookie holding
// the user's claims; the browser resends it automatically on same-origin requests
// (that's why the SPA needs no token handling). Being an API, we return 401/403
// instead of the default redirect to a (non-existent) login page.
builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "psim_auth";
        options.Cookie.HttpOnly = true;               // JS can't read it -> immune to token theft via XSS
        options.Cookie.SameSite = SameSiteMode.Lax;   // sent on same-origin + top-level nav; blocks most CSRF
        // Mark the cookie Secure in production (HTTPS) so it's never sent over
        // plain HTTP; allow HTTP in local dev where there's no TLS.
        options.Cookie.SecurePolicy = builder.Environment.IsDevelopment()
            ? CookieSecurePolicy.SameAsRequest
            : CookieSecurePolicy.Always;
        options.ExpireTimeSpan = TimeSpan.FromDays(7);
        options.SlidingExpiration = true;
        // API-style responses: no HTML redirects, just status codes.
        options.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = StatusCodes.Status401Unauthorized; return Task.CompletedTask; };
        options.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = StatusCodes.Status403Forbidden; return Task.CompletedTask; };
    });
builder.Services.AddAuthorization();

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

// Authenticate (read the cookie into HttpContext.User) then authorize (enforce
// .RequireAuthorization on endpoints). Order matters: authentication first.
app.UseAuthentication();
app.UseAuthorization();

// Serve Swagger UI at /swagger while developing.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Tell the Stripe SDK which secret key to use for every API call.
// The key comes from configuration (user-secrets in dev) — never hard-coded.
StripeConfiguration.ApiKey = builder.Configuration["Stripe:SecretKey"];

// Apply any pending EF Core migrations at startup (creates the DB + schema on a
// fresh volume, and applies future schema changes going forward). Then seed the
// single admin account from configuration (Admin:Email / Admin:Password). The
// password is only ever read from config (user-secrets in dev, host secrets in
// prod) and stored as a hash — never in source. Seeds only if the user is absent,
// so it's safe to run on every startup.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();

    var adminEmail = builder.Configuration["Admin:Email"]?.Trim().ToLowerInvariant();
    var adminPassword = builder.Configuration["Admin:Password"];
    var seedLog = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Seed");

    if (string.IsNullOrWhiteSpace(adminEmail) || string.IsNullOrWhiteSpace(adminPassword))
    {
        // No credentials configured -> no admin. Auth-protected endpoints will be
        // unreachable until you set Admin:Email and Admin:Password. Warn loudly.
        seedLog.LogWarning("⚠️ Admin not seeded: set Admin:Email and Admin:Password (user-secrets in dev, host secrets in prod).");
    }
    else if (!db.Users.Any(u => u.Email == adminEmail))
    {
        var hasher = scope.ServiceProvider.GetRequiredService<IPasswordHasher<AppUser>>();
        var admin = new AppUser { Email = adminEmail, Role = UserRole.Admin };
        admin.PasswordHash = hasher.HashPassword(admin, adminPassword);
        db.Users.Add(admin);
        db.SaveChanges();
        seedLog.LogInformation("🌱 Seeded admin {Email}", adminEmail);
    }
}

// Endpoints, grouped by area (see Endpoints/*.cs).
app.MapSystemEndpoints();
app.MapAuthEndpoints();
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
