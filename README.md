# stripe-payment-sim

A small e-commerce checkout that integrates **Stripe** and processes **payment webhooks**.
Learning project (talent pool) to master production-grade async payment patterns:
**webhook signature verification** and **idempotency**.

## Stack

- **Frontend:** Vite + React + TypeScript + TanStack Query
- **Backend:** .NET 9 Minimal API + EF Core (SQLite)
- **Payments:** Stripe (test mode); local webhook forwarding via the Stripe CLI

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
- [x] 4. Create checkout (PaymentIntent)
- [x] 5. Webhook endpoint + signature verification
- [x] 6. Idempotency on event id
- [ ] 7. Order transitions to "paid"
- [ ] 8. Frontend checkout button
- [ ] 9. UI reflects order status
- [ ] 10. End-to-end README (Stripe CLI)
