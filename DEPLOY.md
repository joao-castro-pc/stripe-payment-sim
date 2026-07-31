# Deploy (Fly.io, single container)

The app deploys as **one container**: the .NET API serves the built React SPA from
`wwwroot`, so there's one public HTTPS URL, no CORS, and same-origin API calls.
SQLite lives on a **Fly volume** so orders survive restarts.

Everything code-side is ready (`Dockerfile`, `fly.toml`, static serving, env-driven
config). The steps below are the interactive ones you run yourself.

## Prerequisites

- A [Fly.io](https://fly.io) account.
- `flyctl` installed and logged in:
  ```
  # install: https://fly.io/docs/flyctl/install/
  fly auth login
  ```
- Your Stripe **test-mode** keys handy (Dashboard → Developers → API keys):
  - Publishable key `pk_test_...` (not secret; baked into the JS at build time)
  - Secret key `sk_test_...` (secret)

## 1. Create the app + volume

From the repo root (where `fly.toml` is):

```
fly launch --no-deploy         # reuse the existing fly.toml; pick an app name + region
fly volumes create data --region mad --size 1   # match primary_region in fly.toml
```

If `fly launch` renamed the app or changed the region, update `app`/`primary_region`
in `fly.toml` (and use the same region for the volume).

## 2. Set the secret key + admin credentials

```
fly secrets set Stripe__SecretKey=sk_test_xxx
fly secrets set Admin__Email=you@example.com Admin__Password=<a-strong-password>
```

`Admin__Email` / `Admin__Password` seed the single admin account on startup (the
password is stored only as a hash). Without them no admin exists, so login — and
therefore checkout and the admin dashboard — is unreachable. Setting a secret
restarts the app automatically, which re-runs the seed.

(The webhook secret comes in step 4, after the URL exists.)

## 3. First deploy

Pass the publishable key as a build arg (it's compiled into the frontend bundle):

```
fly deploy --build-arg VITE_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
```

When it finishes, open the app:

```
fly open
```

The store should load. Payments will fail until the webhook is wired (step 4),
because the order only flips to Paid on the webhook.

## 4. Register the production webhook

1. Stripe Dashboard → Developers → **Webhooks** → **Add endpoint**.
2. Endpoint URL: `https://<your-app>.fly.dev/webhook`
3. Events to send:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
4. Create it, then copy the **Signing secret** (`whsec_...`).
5. Store it and redeploy so the app picks it up:
   ```
   fly secrets set Stripe__WebhookSecret=whsec_xxx
   ```
   (Setting a secret triggers a restart automatically.)

## 5. Verify

- Visit the store, add a product, check out with test card `4242 4242 4242 4242`.
- The order appears in **Admin** and flips to **Paid** once the webhook arrives.
- Wallets: Google Pay / Apple Pay now work (HTTPS). Apple Pay also needs domain
  registration in Stripe (Dashboard → Payments → Payment method domains).
- Region-specific methods (MB WAY, Multibanco, Klarna) show when you pick **EUR**
  in the store's currency selector and have enabled them in the Dashboard.

## Notes / gotchas

- **Enable payment methods** in the Dashboard (test mode) → Settings → Payment
  methods, or the Payment Element only shows cards + Link.
- The app **scales to zero** when idle; the first request (or a Stripe webhook)
  cold-starts it. Stripe retries webhooks, so a cold start won't lose events.
- Schema is created with `EnsureCreated()` (no migrations). Fine for this demo; if
  the model changes you'd delete the volume's DB or add EF migrations.
- Dev-only endpoints (`/dev/reset`, `DELETE /orders/{id}`) are gated to the
  Development environment and are **not** mapped in production.
- One machine owns the volume — don't scale beyond a single instance (the SSE
  notifier and SQLite are per-instance).

## Stretch: CD from CI

Add a GitHub Actions job that runs `flyctl deploy` on green `main`, using a
`FLY_API_TOKEN` repo secret (`fly tokens create deploy`). Left as a follow-up.
