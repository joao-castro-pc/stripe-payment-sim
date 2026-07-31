using Microsoft.EntityFrameworkCore;
using PaymentSim.Api.Models;

namespace PaymentSim.Api.Data;

// The DbContext is EF Core's bridge between C# objects and the database.
// Each DbSet<T> becomes a table; querying/saving goes through this class.
public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    // The "Orders" table.
    public DbSet<Order> Orders => Set<Order>();

    // Ids of Stripe events we've already processed (idempotency ledger).
    public DbSet<ProcessedEvent> ProcessedEvents => Set<ProcessedEvent>();

    // Accounts that can sign in (currently just the seeded admin).
    public DbSet<AppUser> Users => Set<AppUser>();

    // The "OrderItems" table: the line items of each order.
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Store the enum as readable text ("Pending"/"Paid") in the DB column
        // instead of the default integer (0/1). Easier to inspect by hand.
        modelBuilder.Entity<Order>()
            .Property(o => o.Status)
            .HasConversion<string>();

        // One account per email. The unique index also makes login lookups fast.
        modelBuilder.Entity<AppUser>()
            .HasIndex(u => u.Email)
            .IsUnique();

        // Store the role as text ("Admin"/"Customer") for a readable DB column,
        // mirroring how OrderStatus is persisted.
        modelBuilder.Entity<AppUser>()
            .Property(u => u.Role)
            .HasConversion<string>();

        // Each order optionally belongs to one user. Keep the order if the user is
        // ever deleted (null out the link rather than cascade-deleting orders).
        modelBuilder.Entity<Order>()
            .HasOne(o => o.User)
            .WithMany()
            .HasForeignKey(o => o.UserId)
            .OnDelete(DeleteBehavior.SetNull);

        // An order has many line items. Deleting an order removes its items
        // (cascade): unlike the user link, items are part of the order and have no
        // standalone meaning.
        modelBuilder.Entity<Order>()
            .HasMany(o => o.Items)
            .WithOne(i => i.Order)
            .HasForeignKey(i => i.OrderId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
