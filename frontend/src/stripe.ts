import { loadStripe } from '@stripe/stripe-js'

// The publishable key (pk_test_...) is meant for the browser — it's NOT secret.
// It comes from a Vite env var; only vars prefixed VITE_ are exposed to the client.
const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined

if (!publishableKey) {
  // Fail loudly in dev if the key is missing, instead of a confusing Stripe error later.
  console.error('Missing VITE_STRIPE_PUBLISHABLE_KEY. Add it to frontend/.env')
}

// loadStripe returns a promise; create it ONCE at module load, not per render.
export const stripePromise = loadStripe(publishableKey ?? '')
