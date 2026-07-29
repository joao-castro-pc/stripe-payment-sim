using Microsoft.EntityFrameworkCore;
using PaymentSim.Api.Data;
using PaymentSim.Api.Models;

var builder = WebApplication.CreateBuilder(args);

// Register the DbContext in the DI container, backed by a local SQLite file.
// Any endpoint can now ask for an AppDbContext and get one per request.
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite("Data Source=paymentsim.db"));

var app = builder.Build();

// Dev-only: create the SQLite file + tables if they don't exist yet.
// (Good enough for a demo. A real app would use EF Core migrations instead.)
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.EnsureCreated();
}

app.MapGet("/", () => "PaymentSim API");

app.MapGet("/health", () => new { status = "ok" });

// List all orders. Proves we can read from the DB.
app.MapGet("/orders", async (AppDbContext db) =>
    await db.Orders.OrderByDescending(o => o.CreatedAt).ToListAsync());

// Create a pending order. Temporary: in Step 4 this also creates a Stripe
// PaymentIntent. For now it just proves we can write to the DB.
app.MapPost("/orders", async (CreateOrderRequest req, AppDbContext db) =>
{
    var order = new Order { AmountCents = req.AmountCents, Currency = req.Currency };
    db.Orders.Add(order);
    await db.SaveChangesAsync();
    return Results.Created($"/orders/{order.Id}", order);
});

app.Run();

// Shape of the POST /orders body. A record = a small immutable data holder.
record CreateOrderRequest(long AmountCents, string Currency);
