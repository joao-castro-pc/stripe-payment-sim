using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using PaymentSim.Api.Data;
using PaymentSim.Api.Models;

namespace PaymentSim.Api.Endpoints;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this WebApplication app)
    {
        var log = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Auth");

        // Sign in: verify the email/password against the stored hash and, on success,
        // issue the auth cookie. We deliberately return the SAME 401 for "unknown
        // email" and "wrong password" so an attacker can't probe which emails exist.
        app.MapPost("/auth/login", async (
            LoginRequest req,
            AppDbContext db,
            IPasswordHasher<AppUser> hasher,
            HttpContext http) =>
        {
            var email = (req.Email ?? "").Trim().ToLowerInvariant();
            var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email);

            // Verify even when the user is missing? We just fail — but note that a
            // real app would hash a dummy to keep timing constant. Overkill here.
            if (user is null ||
                hasher.VerifyHashedPassword(user, user.PasswordHash, req.Password ?? "")
                    == PasswordVerificationResult.Failed)
            {
                log.LogWarning("🔒 Failed login for {Email}", email);
                return Results.Json(new { error = "Invalid email or password." }, statusCode: StatusCodes.Status401Unauthorized);
            }

            await IssueCookie(http, user);
            log.LogInformation("✅ Login for {Email}", user.Email);
            return Results.Ok(new UserResponse(user.Email, user.Name, user.Role));
        })
            .WithTags("Auth")
            .WithSummary("Sign in")
            .WithDescription("Verifies email/password and sets the auth cookie. Returns 200 with the user, or 401 if the credentials are wrong.")
            .Produces<UserResponse>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status401Unauthorized);

        // Register a new customer account, then sign them in. Public (no auth): this
        // is how shoppers create an account so they can check out. New accounts are
        // always role Customer — never admin (that's the seeded account only).
        app.MapPost("/auth/register", async (
            RegisterRequest req,
            AppDbContext db,
            IPasswordHasher<AppUser> hasher,
            HttpContext http) =>
        {
            var email = (req.Email ?? "").Trim().ToLowerInvariant();
            if (email.Length < 3 || !email.Contains('@') || email.Contains(' '))
                return Results.BadRequest(new { error = "A valid email is required." });
            if ((req.Password ?? "").Length < 6)
                return Results.BadRequest(new { error = "Password must be at least 6 characters." });
            var name = (req.Name ?? "").Trim();
            if (name.Length == 0)
                return Results.BadRequest(new { error = "A name is required." });
            if (name.Length > 100)
                return Results.BadRequest(new { error = "Name must be 100 characters or fewer." });

            if (await db.Users.AnyAsync(u => u.Email == email))
                return Results.Conflict(new { error = "An account with this email already exists." });

            var user = new AppUser { Email = email, Name = name, Role = UserRole.Customer };
            user.PasswordHash = hasher.HashPassword(user, req.Password!);
            db.Users.Add(user);
            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                // Two concurrent registrations for the same email: the unique index
                // rejects the loser. Surface it as a clean conflict, not a 500.
                return Results.Conflict(new { error = "An account with this email already exists." });
            }

            await IssueCookie(http, user);
            log.LogInformation("🆕 Registered customer {Email}", email);
            return Results.Created("/auth/me", new UserResponse(user.Email, user.Name, user.Role));
        })
            .WithTags("Auth")
            .WithSummary("Register a customer")
            .WithDescription("Creates a Customer account and signs them in. 400 on invalid input, 409 if the email is taken.")
            .Produces<UserResponse>(StatusCodes.Status201Created)
            .Produces(StatusCodes.Status400BadRequest)
            .Produces(StatusCodes.Status409Conflict);

        // Sign out: clear the auth cookie. Safe to call even when not signed in.
        app.MapPost("/auth/logout", async (HttpContext http) =>
        {
            await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.NoContent();
        })
            .WithTags("Auth")
            .WithSummary("Sign out")
            .WithDescription("Clears the auth cookie. Always returns 204.")
            .Produces(StatusCodes.Status204NoContent);

        // Who am I? The frontend calls this on load to know if there's an active
        // session (and to show the right nav / gate routes). 401 when signed out.
        app.MapGet("/auth/me", (HttpContext http) =>
        {
            if (http.User.Identity?.IsAuthenticated != true)
                return Results.Unauthorized();

            var email = http.User.FindFirstValue(ClaimTypes.Email) ?? "";
            var name = http.User.FindFirstValue(ClaimTypes.GivenName) ?? "";
            // The role travels in the cookie as a string claim; parse it back to the
            // enum so the response (and thus the frontend's type) is the union.
            return Enum.TryParse<UserRole>(http.User.FindFirstValue(ClaimTypes.Role), out var role)
                ? Results.Ok(new UserResponse(email, name, role))
                : Results.Unauthorized();
        })
            .WithTags("Auth")
            .WithSummary("Current user")
            .WithDescription("Returns the signed-in user, or 401 if there's no active session.")
            .Produces<UserResponse>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status401Unauthorized);
    }

    // Serialize the user's identity (id, email, role) into the encrypted, HttpOnly
    // auth cookie. Shared by login and register.
    private static Task IssueCookie(HttpContext http, AppUser user)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Email, user.Email),
            new(ClaimTypes.GivenName, user.Name),
            new(ClaimTypes.Role, user.Role.ToString()),
        };
        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        return http.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity));
    }
}

/// <summary>Credentials for POST /auth/login.</summary>
/// <param name="Email">Account email (case-insensitive).</param>
/// <param name="Password">Account password (plaintext over HTTPS; verified against a stored hash).</param>
public record LoginRequest(string Email, string Password);

/// <summary>Details for POST /auth/register.</summary>
/// <param name="Email">The new account's email (must be unique).</param>
/// <param name="Password">The new account's password (min 6 chars).</param>
/// <param name="Name">The new account's display name.</param>
public record RegisterRequest(string Email, string Password, string Name);

/// <summary>The signed-in user, returned by login and /auth/me.</summary>
/// <param name="Email">The user's email.</param>
/// <param name="Name">The user's display name (may be empty for older accounts).</param>
/// <param name="Role">The user's role.</param>
public record UserResponse(string Email, string Name, UserRole Role);
