using System.Net;
using System.Net.Http.Json;
using Xunit;

namespace PaymentSim.Api.Tests;

// Auth behaviour: login/logout/me, and that protection is applied where it should
// be (orders) but NOT where it must stay open (the Stripe webhook).
public class AuthTests
{
    [Fact]
    public async Task Login_with_valid_credentials_returns_200_and_user()
    {
        using var factory = new TestAppFactory();
        var client = factory.CreateClient();

        var res = await client.PostAsJsonAsync("/auth/login",
            new { email = TestAppFactory.AdminEmail, password = TestAppFactory.AdminPassword });

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var user = await res.Content.ReadFromJsonAsync<UserDto>();
        Assert.Equal(TestAppFactory.AdminEmail, user!.Email);
        Assert.Equal("Admin", user.Role);
        // The auth cookie must have been set.
        Assert.Contains(res.Headers, h => h.Key == "Set-Cookie" && h.Value.Any(v => v.Contains("psim_auth")));
    }

    [Fact]
    public async Task Login_with_wrong_password_returns_401()
    {
        using var factory = new TestAppFactory();
        var client = factory.CreateClient();

        var res = await client.PostAsJsonAsync("/auth/login",
            new { email = TestAppFactory.AdminEmail, password = "wrong" });

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Login_with_unknown_email_returns_401()
    {
        using var factory = new TestAppFactory();
        var client = factory.CreateClient();

        var res = await client.PostAsJsonAsync("/auth/login",
            new { email = "nobody@test.local", password = TestAppFactory.AdminPassword });

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Me_without_cookie_returns_401()
    {
        using var factory = new TestAppFactory();
        var client = factory.CreateClient();

        var res = await client.GetAsync("/auth/me");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Me_after_login_returns_user()
    {
        using var factory = new TestAppFactory();
        var client = await factory.CreateAuthenticatedClientAsync();

        var res = await client.GetAsync("/auth/me");

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var user = await res.Content.ReadFromJsonAsync<UserDto>();
        Assert.Equal(TestAppFactory.AdminEmail, user!.Email);
    }

    [Fact]
    public async Task Protected_orders_without_auth_returns_401()
    {
        using var factory = new TestAppFactory();
        var client = factory.CreateClient();

        var res = await client.GetAsync("/orders");

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
    }

    [Fact]
    public async Task Protected_orders_with_auth_returns_200()
    {
        using var factory = new TestAppFactory();
        var client = await factory.CreateAuthenticatedClientAsync();

        var res = await client.GetAsync("/orders");

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
    }

    [Fact]
    public async Task Logout_clears_the_session()
    {
        using var factory = new TestAppFactory();
        var client = await factory.CreateAuthenticatedClientAsync();

        // Signed in first.
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/auth/me")).StatusCode);

        var logout = await client.PostAsync("/auth/logout", null);
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);

        // Cookie cleared -> back to 401.
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Webhook_stays_public_even_without_auth()
    {
        using var factory = new TestAppFactory();
        var client = factory.CreateClient();

        // No auth, no valid signature: the webhook must reject on the SIGNATURE
        // (400), not on authentication (401). A 401 here would mean we accidentally
        // locked Stripe out — it can't log in; its auth IS the signature.
        var res = await client.PostAsync("/webhook",
            new StringContent("{}", System.Text.Encoding.UTF8, "application/json"));

        Assert.NotEqual(HttpStatusCode.Unauthorized, res.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Register_creates_a_customer_and_signs_in()
    {
        using var factory = new TestAppFactory();
        var client = factory.CreateClient();

        var res = await client.PostAsJsonAsync("/auth/register",
            new { email = "new@shop.local", password = "hunter2!" });

        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
        var user = await res.Content.ReadFromJsonAsync<UserDto>();
        Assert.Equal("new@shop.local", user!.Email);
        Assert.Equal("Customer", user.Role);
        // Registration signs you in, so /auth/me now succeeds on the same client.
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Register_duplicate_email_returns_409()
    {
        using var factory = new TestAppFactory();
        var client = factory.CreateClient();
        var body = new { email = "dupe@shop.local", password = "hunter2!" };

        Assert.Equal(HttpStatusCode.Created, (await client.PostAsJsonAsync("/auth/register", body)).StatusCode);
        // Second registration with the same email is rejected.
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/auth/register", body)).StatusCode);
    }

    [Fact]
    public async Task Register_weak_password_returns_400()
    {
        using var factory = new TestAppFactory();
        var client = factory.CreateClient();

        var res = await client.PostAsJsonAsync("/auth/register",
            new { email = "weak@shop.local", password = "123" });

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Customer_cannot_list_orders_returns_403()
    {
        using var factory = new TestAppFactory();
        var client = await factory.CreateCustomerClientAsync();

        // Authenticated but not an admin -> 403 (not 401).
        var res = await client.GetAsync("/orders");

        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
    }

    [Fact]
    public async Task Customer_can_create_an_order()
    {
        using var factory = new TestAppFactory();
        var client = await factory.CreateCustomerClientAsync();

        // Checkout is allowed for any signed-in user, admin or customer.
        var res = await client.PostAsJsonAsync("/orders", new { amountCents = 1999, currency = "eur" });

        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
    }

    private record UserDto(string Email, string Role);
}
