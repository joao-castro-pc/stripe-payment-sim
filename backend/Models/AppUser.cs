using System.Text.Json.Serialization;
namespace PaymentSim.Api.Models;

// An account that can sign in. The app seeds a single admin (see Program.cs); public
// registration creates Customer accounts only (never admin). The password is never
// stored in the clear: we keep a salted hash produced by ASP.NET's PasswordHasher and
// verify against it at login.

// [JsonConverter] serializes the role by NAME ("Admin") in JSON, and makes
// Swashbuckle expose it as a string enum in OpenAPI, so the frontend's generated
// type is a real union ("Admin" | "Customer") — same pattern as OrderStatus.
//
// Order matters for security: Customer is first, so Customer == 0 == default(UserRole).
// Any code path that creates an AppUser without setting Role (a future bulk import,
// migration backfill, or new endpoint) then defaults to the LEAST-privileged role, not
// admin. The role is persisted as TEXT (HasConversion<string> in AppDbContext), so this
// ordering never has to match a stored integer — reordering is safe for existing rows.
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum UserRole
{
    Customer,
    Admin
}

public class AppUser
{
    public Guid Id { get; set; } = Guid.NewGuid();

    // Login identifier. Compared case-insensitively (we store it lowercased).
    public string Email { get; set; } = "";

    // Output of PasswordHasher.HashPassword — an opaque string that embeds the
    // salt and the hash. Never the plaintext password.
    public string PasswordHash { get; set; } = "";

    // Coarse role for authorization. Defaults to the least-privileged role: an admin is
    // only ever minted explicitly (the seed in Program.cs), never by omission. Public
    // registration always sets Customer, so no request can self-promote to admin.
    public UserRole Role { get; set; } = UserRole.Customer;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
