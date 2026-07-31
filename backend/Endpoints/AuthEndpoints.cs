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

            // Build the identity that the cookie will carry. These claims are what
            // every later request sees via HttpContext.User once the cookie is sent.
            var claims = new List<Claim>
            {
                new(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new(ClaimTypes.Email, user.Email),
                new(ClaimTypes.Role, user.Role.ToString()),
            };
            var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
            // SignInAsync serializes the principal into the encrypted, HttpOnly cookie.
            await http.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity));

            log.LogInformation("✅ Login for {Email}", user.Email);
            return Results.Ok(new UserResponse(user.Email, user.Role));
        })
            .WithTags("Auth")
            .WithSummary("Sign in")
            .WithDescription("Verifies email/password and sets the auth cookie. Returns 200 with the user, or 401 if the credentials are wrong.")
            .Produces<UserResponse>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status401Unauthorized);

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
            // The role travels in the cookie as a string claim; parse it back to the
            // enum so the response (and thus the frontend's type) is the union.
            return Enum.TryParse<UserRole>(http.User.FindFirstValue(ClaimTypes.Role), out var role)
                ? Results.Ok(new UserResponse(email, role))
                : Results.Unauthorized();
        })
            .WithTags("Auth")
            .WithSummary("Current user")
            .WithDescription("Returns the signed-in user, or 401 if there's no active session.")
            .Produces<UserResponse>(StatusCodes.Status200OK)
            .Produces(StatusCodes.Status401Unauthorized);
    }
}

/// <summary>Credentials for POST /auth/login.</summary>
/// <param name="Email">Account email (case-insensitive).</param>
/// <param name="Password">Account password (plaintext over HTTPS; verified against a stored hash).</param>
public record LoginRequest(string Email, string Password);

/// <summary>The signed-in user, returned by login and /auth/me.</summary>
/// <param name="Email">The user's email.</param>
/// <param name="Role">The user's role.</param>
public record UserResponse(string Email, UserRole Role);
