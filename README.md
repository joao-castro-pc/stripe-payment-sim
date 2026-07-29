# stripe-payment-sim

A small e-commerce checkout that integrates **Stripe** and processes **payment webhooks**.
Learning project (talent pool) to master production-grade async payment patterns:
**webhook signature verification** and **idempotency**.

## Stack

- **Frontend:** Vite + React + TypeScript + TanStack Query
- **Backend:** .NET 9 Minimal API + EF Core (SQLite)
- **Payments:** Stripe (test mode); local webhook forwarding via the Stripe CLI

## The two mistakes this project is about

Most people who wire up Stripe webhooks in a hurry make one (or both) of these:

1. **Not verifying the signature** — they trust any POST to `/webhook`. Anyone who
   knows the URL can then fake a "payment succeeded" and get free goods.
2. **Not handling duplicate deliveries** — Stripe retries a webhook until you answer
   `2xx`. If your handler isn't *idempotent*, the same payment gets processed twice
   (double-shipped order, double credit, etc.).

The whole point of the project is to do both correctly.

## High-level flow

```
React client  ──create checkout──▶  .NET API  ──▶  Stripe (test mode)
     ▲                                                   │
     │                                          payment happens
     │                                                   │
     │                                                   ▼
     └──────  order shows "paid"  ◀──webhook──  Stripe  ──▶  .NET /webhook
                                              (verify signature + idempotent)
```

## Project layout

```
stripe-payment-sim/
├── backend/    # .NET 9 Minimal API
└── frontend/   # Vite + React + TS
```

## Status

Built step by step — one feature per commit. See the git history.

- [x] 1. Repo skeleton
- [x] 2. Backend health endpoint
- [x] 3. Order model + EF Core (SQLite)
- [ ] 4. Create checkout (PaymentIntent)
- [ ] 5. Webhook endpoint + signature verification
- [ ] 6. Idempotency on event id
- [ ] 7. Order transitions to "paid"
- [ ] 8. Frontend checkout button
- [ ] 9. UI reflects order status
- [ ] 10. End-to-end README (Stripe CLI)
