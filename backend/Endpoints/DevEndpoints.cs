using Microsoft.EntityFrameworkCore;
using PaymentSim.Api.Data;

namespace PaymentSim.Api.Endpoints;

// Destructive helpers for local development. Mapped ONLY in Development (see
// Program.cs), and each one additionally requires a localhost caller + ?confirm=true
// (see RequestGuards) so they can never wipe data remotely or by accident.
public static class DevEndpoints
{
    public static void MapDevEndpoints(this WebApplication app)
    {
        var devLog = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Dev");
        var ordersLog = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Orders");

        // Wipe all orders + processed events (keeps the schema).
        app.MapPost("/dev/reset", async (HttpContext http, AppDbContext db, OrderNotifier notifier, bool confirm = false) =>
        {
            if (RequestGuards.RequireLocalAndConfirmed(http, confirm, devLog, "/dev/reset") is { } fail)
                return fail;

            // ExecuteDeleteAsync runs a single DELETE in the DB (no loading rows first).
            var orders = await db.Orders.ExecuteDeleteAsync();
            var events = await db.ProcessedEvents.ExecuteDeleteAsync();
            notifier.Notify("orders-changed"); // push so the UI clears immediately
            devLog.LogWarning("🧹 DB reset: deleted {Orders} orders, {Events} processed events", orders, events);
            return Results.Ok(new { deletedOrders = orders, deletedEvents = events });
        })
            .WithTags("Dev")
            .WithSummary("Reset the database (dev only)")
            .WithDescription("Deletes ALL orders and processed-event records. Schema stays. " +
                "Development only, localhost only, and requires ?confirm=true.");

        // Delete a single order by id. Removes our local record only; it does not
        // cancel the Stripe PaymentIntent (out of scope for this demo).
        app.MapDelete("/orders/{id:guid}", async (Guid id, HttpContext http, AppDbContext db, OrderNotifier notifier, bool confirm = false) =>
        {
            if (RequestGuards.RequireLocalAndConfirmed(http, confirm, ordersLog, "delete order") is { } fail)
                return fail;

            var deleted = await db.Orders.Where(o => o.Id == id).ExecuteDeleteAsync();
            if (deleted == 0)
                return Results.NotFound();

            notifier.Notify("orders-changed"); // push so every browser drops the row
            ordersLog.LogInformation("🗑️ Order {Order} deleted", id);
            return Results.NoContent();
        })
            .WithTags("Dev")
            .WithSummary("Delete an order (dev only)")
            .WithDescription("Deletes the local order record by id. Development only, localhost only, " +
                "and requires ?confirm=true. Returns 404 if it doesn't exist.")
            .Produces(StatusCodes.Status204NoContent)
            .Produces(StatusCodes.Status404NotFound);
    }
}
