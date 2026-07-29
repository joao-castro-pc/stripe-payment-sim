using System.Collections.Concurrent;
using System.Threading.Channels;

namespace PaymentSim.Api;

// In-memory pub/sub so the webhook can push "an order changed" to every browser
// currently connected via SSE. One Channel per connected client.
//
// This lives in the API process's memory: it works for a single instance (fine
// for a demo). Scaling to multiple instances would need a shared bus (Redis,
// etc.) so a webhook handled by instance A reaches a browser connected to B.
public class OrderNotifier
{
    private readonly ConcurrentDictionary<Guid, Channel<string>> _subscribers = new();

    // A browser opening the SSE stream calls this to get its own message queue.
    public (Guid Id, ChannelReader<string> Reader) Subscribe()
    {
        var channel = Channel.CreateUnbounded<string>();
        var id = Guid.NewGuid();
        _subscribers[id] = channel;
        return (id, channel.Reader);
    }

    public void Unsubscribe(Guid id)
    {
        if (_subscribers.TryRemove(id, out var channel))
            channel.Writer.TryComplete();
    }

    // The webhook calls this after an order changes; every connected client gets it.
    public void Notify(string message)
    {
        foreach (var channel in _subscribers.Values)
            channel.Writer.TryWrite(message);
    }
}
