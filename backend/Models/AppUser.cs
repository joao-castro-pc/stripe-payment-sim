using System.Text.Json.Serialization;
namespace PaymentSim.Api.Models;

// An account that can sign in. For now the app seeds a single admin (see Program.cs)
// and there's no public registration — customers will come later as their own task.
// The password is never stored in the clear: we keep a salted hash produced by
// ASP.NET's PasswordHasher and verify against it at login.

// [JsonConverter] serializes the role by NAME ("Admin") in JSON, and makes
// Swashbuckle expose it as a string enum in OpenAPI, so the frontend's generated
// type is a real union ("Admin" | "Customer") — same pattern as OrderStatus.
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum UserRole
{
    Admin,
    Customer
}

public class AppUser
{
    public Guid Id { get; set; } = Guid.NewGuid();

    // Login identifier. Compared case-insensitively (we store it lowercased).
    public string Email { get; set; } = "";

    // Output of PasswordHasher.HashPassword — an opaque string that embeds the
    // salt and the hash. Never the plaintext password.
    public string PasswordHash { get; set; } = "";

    // Coarse role for authorization. Only "admin" exists today; kept as a field so
    // adding "customer" later doesn't need a schema change.
    public UserRole Role { get; set; } = UserRole.Admin;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
