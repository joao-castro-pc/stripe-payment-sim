using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using PaymentSim.Api.Data;
using PaymentSim.Api.Payments;

namespace PaymentSim.Api.Tests;

// Boots the real API in-memory for integration tests, with two swaps:
//   1. SQLite file  -> in-memory SQLite (isolated, disappears after the test)
//   2. real Stripe  -> FakePaymentGateway (no network)
// Also injects dummy Stripe config so startup and the endpoints' key check pass.
public class TestAppFactory : WebApplicationFactory<Program>
{
    // A single open connection keeps the in-memory database alive for the whole
    // app lifetime. Close it and the schema/data vanish. That's why we hold it here.
    private readonly SqliteConnection _connection = new("DataSource=:memory:");

    // Exposed so tests can arrange behaviour (e.g. make the gateway fail).
    public FakePaymentGateway Payments { get; } = new();

    // The webhook signing secret used both to configure the app and to sign
    // test payloads (see StripeSignature). Any non-empty string works.
    public const string WebhookSecret = "whsec_test_secret";

    // Credentials for the admin the app seeds at startup (from config below).
    // Tests log in with these to reach the auth-protected endpoints.
    public const string AdminEmail = "admin@test.local";
    public const string AdminPassword = "test-password-123";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        _connection.Open();

        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                // Non-empty so the endpoint's "key configured?" guard passes.
                // The fake gateway never actually uses it.
                ["Stripe:SecretKey"] = "sk_test_dummy",
                ["Stripe:WebhookSecret"] = WebhookSecret,
                // Seeds the admin account (see Program.cs) so auth tests can log in.
                ["Admin:Email"] = AdminEmail,
                ["Admin:Password"] = AdminPassword,
            });
        });

        builder.ConfigureServices(services =>
        {
            // Drop the app's SQLite-file DbContext and re-add it on our in-memory
            // connection. RemoveAll clears the previous registration first.
            services.RemoveAll<DbContextOptions<AppDbContext>>();
            services.RemoveAll<AppDbContext>();
            services.AddDbContext<AppDbContext>(o => o.UseSqlite(_connection));

            // Swap the real Stripe gateway for our fake.
            services.RemoveAll<IPaymentGateway>();
            services.AddSingleton<IPaymentGateway>(Payments);
        });
    }

    // A client that has signed in as the seeded admin. CreateClient() keeps cookies
    // (HandleCookies defaults to true), so the auth cookie set by /auth/login is
    // resent on every later request — exactly like a real browser.
    public async Task<HttpClient> CreateAuthenticatedClientAsync()
    {
        var client = CreateClient();
        var res = await client.PostAsJsonAsync("/auth/login",
            new { email = AdminEmail, password = AdminPassword });
        if (!res.IsSuccessStatusCode)
            throw new InvalidOperationException($"Test login failed: {res.StatusCode}");
        return client;
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing)
            _connection.Dispose();
    }
}
