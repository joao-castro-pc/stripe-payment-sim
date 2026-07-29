# stripe-payment-sim

A small e-commerce checkout that integrates **Stripe** and processes **payment
webhooks**. A learning project focused on the two things people get wrong in
production async payments: **webhook signature verification** and **idempotency**.

- **Frontend:** Vite + React + TypeScript + TanStack Query + Tailwind CSS
- **Backend:** .NET 9 Minimal API + EF Core (SQLite) + Stripe.net
- **Payments:** Stripe (test mode); webhook forwarding via the Stripe CLI in dev
- **Live updates:** Server-Sent Events (backend → browser)

## The two mistakes this project is about

1. **Not verifying the webhook signature.** Anyone who knows the URL could POST a
   fake "payment succeeded". We verify every webhook against a signing secret and
   reject forged/unsigned payloads with `400`.
2. **Not handling duplicate deliveries.** Stripe delivers "at least once" and
   retries until it gets a `2xx`, so the same event *will* arrive more than once.
   Our handler is **idempotent**: an event is processed exactly once, guaranteed by
   a primary-key constraint on the event id.

## How it works — two legs

```
   Stripe  ──[webhook: POST /webhook]──▶  .NET API      ← leg A (server-to-server)
   .NET API  ──[Server-Sent Events]────▶  React app     ← leg B (server → browser)
```

- **Leg A (Stripe → API):** a *webhook*. Stripe signs it; we verify and, on
  `payment_intent.succeeded`, flip the matching order to `Paid`.
- **Leg B (API → browser):** *not* a webhook — a browser isn't a server. The API
  pushes a message over SSE and the frontend refetches. (Alternatives: WebSockets/
  SignalR for bidirectional; polling for simplicity.)

## Checkout flow

```
1. React → POST /orders            → API creates a Pending order + Stripe PaymentIntent
2. API → clientSecret              → returned to the browser
3. React → Stripe (confirm card)   → card data goes straight to Stripe, never our server
4. Stripe → POST /webhook          → API verifies signature, idempotently marks order Paid
5. API → SSE push                  → browser refetches, order shows "Paid"
```

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [.NET 9 SDK](https://dotnet.microsoft.com/download)
- [Stripe CLI](https://docs.stripe.com/stripe-cli) — install it yourself (it's a
  standalone binary, not an npm package):
  - Windows: `winget install Stripe.StripeCli`
  - macOS: `brew install stripe/stripe-cli/stripe`
  - then `stripe login` (opens the browser to pair with your account)
- A free [Stripe account](https://dashboard.stripe.com/register) in **test mode**

## Setup

```bash
# 1. Install JS deps (root installs the frontend too, via postinstall).
#    .NET restores automatically on first run.
npm install
```

Then configure the three secrets. **Never commit these.**

**Backend — Stripe secret key** (kept in .NET user-secrets, outside the repo):

```bash
cd backend
dotnet user-secrets set "Stripe:SecretKey" "sk_test_..."   # from dashboard.stripe.com/test/apikeys
```

**Backend — webhook signing secret.** Get it from the Stripe CLI, then store it:

```bash
stripe listen --print-secret                                # prints whsec_...
dotnet user-secrets set "Stripe:WebhookSecret" "whsec_..."
cd ..
```

**Frontend — publishable key** (public, but still via env):

```bash
cd frontend
cp .env.example .env
# edit .env → VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...        # from the same API keys page
cd ..
```

## Run

Open a terminal that has `stripe` on its PATH, then:

```bash
npm run dev
```

This starts all three at once (via `concurrently`):

| Prefix | What | URL |
|--------|------|-----|
| `[api]` | .NET API (`dotnet watch run`) | http://localhost:5144 (Swagger at `/swagger`) |
| `[web]` | Vite dev server | http://localhost:5173 |
| `[stripe]` | `stripe listen` forwarding webhooks to the API | — |

`Ctrl+C` stops all three. You can also run one at a time: `npm run dev:api`,
`dev:web`, `dev:stripe`.

> In dev you need all three. `stripe listen` is **dev-only** — it tunnels Stripe's
> webhooks to `localhost`. In production the webhook points at your public URL and
> no CLI is involved. Without it running, orders stay `Pending` forever.

## Try it

Open http://localhost:5173, enter an amount, and pay with a Stripe test card:

- **Card:** `4242 4242 4242 4242`
- **Expiry:** any future date · **CVC:** any 3 digits · **ZIP:** any

The order appears `Pending` and flips to `Paid` within ~1s (no refresh), driven by
the webhook + SSE. Watch the `[api]` logs: `📨 received → ⚙️ processing → ✅ paid →
📢 notified`.

**See idempotency:** in the `[stripe]` output press `R` to resend the last event —
the API logs `🔁 Duplicate event ignored` and does nothing the second time.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness check |
| GET | `/orders` | List orders (newest first) |
| POST | `/orders` | Create order + Stripe PaymentIntent, returns `clientSecret` |
| GET | `/orders/stream` | Server-Sent Events stream of order changes |
| POST | `/webhook` | Stripe webhook receiver (verifies signature, idempotent) |

## Project structure

```
stripe-payment-sim/
├── package.json          # root: `npm run dev` orchestrates all three
├── backend/              # .NET 9 Minimal API
│   ├── Program.cs        # endpoints, Stripe wiring, webhook handling
│   ├── Models/           # Order, ProcessedEvent
│   ├── Data/             # AppDbContext (EF Core)
│   └── OrderNotifier.cs  # in-memory pub/sub for SSE
└── frontend/             # Vite + React + TS
    └── src/
        ├── api.ts        # backend URL + typed fetch helpers
        ├── stripe.ts     # loadStripe(publishable key)
        └── App.tsx       # checkout form + orders list + SSE
```

## Notes & limitations

- **Money is stored in cents** (`long`), never floats — avoids rounding bugs.
- **`EnsureCreated`, not migrations** — fine for a demo; a real app would use EF
  Core migrations. Delete `backend/paymentsim.db` to reset.
- **The SSE notifier is in-memory** — works for a single API instance. Scaling to
  multiple instances would need a shared bus (e.g. Redis).
- **Secrets** live in .NET user-secrets and `frontend/.env`, both untracked.
```
