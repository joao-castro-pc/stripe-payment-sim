import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AddressElement,
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js'
import type { StripeElementsOptions } from '@stripe/stripe-js'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useCart } from '../cart/CartContext'
import { createOrder } from '../api'
import { stripePromise } from '../stripe'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

// The actual payment form. It lives INSIDE its own <Elements> provider (mounted
// with the order's clientSecret), so useStripe/useElements here talk to that
// PaymentIntent. PaymentElement renders every method enabled in the Dashboard;
// AddressElement collects a billing address that Stripe attaches on confirm.
function PaymentForm({ total, onPaid }: { total: number; onPaid: () => void }) {
  const stripe = useStripe()
  const elements = useElements()

  const pay = useMutation({
    mutationFn: async () => {
      if (!stripe || !elements) throw new Error('Stripe not ready yet')

      // With Elements created from a clientSecret we don't call elements.submit();
      // confirmPayment collects the card + address itself. redirect:'if_required'
      // keeps us on-page for methods that don't need a redirect (cards, Link).
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: `${window.location.origin}/checkout` },
        redirect: 'if_required',
      })
      if (error) throw new Error(error.message ?? 'Payment failed')
      return paymentIntent
    },
    onSuccess: () => {
      onPaid()
      toast.success('Payment succeeded', { description: 'Your order is on its way.' })
    },
    onError: (e) => toast.error('Payment failed', { description: (e as Error).message }),
  })

  return (
    <>
      <AddressElement options={{ mode: 'billing' }} />
      <div className="mt-5">
        <PaymentElement />
      </div>
      <Button
        className="mt-5 w-full"
        onClick={() => pay.mutate()}
        disabled={!stripe || pay.isPending}
      >
        {pay.isPending ? 'Processing…' : `Pay ${usd.format(total)}`}
      </Button>
      <p className="mt-3 text-xs text-muted-foreground">
        Test card <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">4242 4242 4242 4242</code>, any future date, any CVC.
      </p>
    </>
  )
}

export default function CheckoutPage() {
  const { items, total, clear } = useCart()
  const [done, setDone] = useState(false)

  // Create the order (→ PaymentIntent → clientSecret) as soon as we reach the
  // checkout with a non-empty cart. Keyed on the amount so changing the cart
  // total makes a fresh intent; staleTime Infinity stops it re-creating on
  // re-render (and dedupes React StrictMode's double effect in dev).
  const amountCents = Math.round(total * 100)
  const intent = useQuery({
    queryKey: ['checkout-intent', amountCents],
    queryFn: () => createOrder(amountCents, 'usd'),
    enabled: items.length > 0 && !done,
    staleTime: Infinity,
    retry: false,
  })

  // Success screen (cart already cleared).
  if (done) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mb-4 text-5xl">✅</div>
        <h1 className="mb-2 text-2xl font-bold text-foreground">Payment successful</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          The order was created and will show as Paid once the Stripe webhook arrives (see the Admin tab).
        </p>
        <Button asChild>
          <Link to="/">Back to shop</Link>
        </Button>
      </main>
    )
  }

  // Nothing to pay for.
  if (items.length === 0) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="mb-2 text-2xl font-bold text-foreground">Your cart is empty</h1>
        <p className="mb-6 text-sm text-muted-foreground">Add a product before checking out.</p>
        <Button asChild>
          <Link to="/">Browse products</Link>
        </Button>
      </main>
    )
  }

  // Match the Stripe Elements look to the app's current light/dark theme.
  const dark = document.documentElement.classList.contains('dark')
  const options: StripeElementsOptions | undefined = intent.data
    ? {
        clientSecret: intent.data.clientSecret,
        appearance: { theme: dark ? 'night' : 'stripe', variables: { colorPrimary: '#4f46e5' } },
      }
    : undefined

  return (
    <main className="mx-auto grid max-w-4xl gap-6 px-4 py-8 md:grid-cols-2">
      {/* Order summary */}
      <Card>
        <CardHeader>
          <CardTitle>Order summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {items.map((i) => (
              <div key={i.product.id} className="flex items-center gap-3 py-2">
                <img src={i.product.thumbnail} alt="" className="size-12 rounded border bg-white object-contain p-1" />
                <div className="flex flex-1 flex-col">
                  <span className="line-clamp-1 text-sm font-medium">{i.product.title}</span>
                  <span className="text-xs text-muted-foreground">{i.qty} × {usd.format(i.product.price)}</span>
                </div>
                <span className="text-sm font-semibold tabular-nums">{usd.format(i.product.price * i.qty)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t pt-3">
            <span className="font-medium">Total</span>
            <span className="text-lg font-bold tabular-nums">{usd.format(total)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Payment */}
      <Card>
        <CardHeader>
          <CardTitle>Payment</CardTitle>
        </CardHeader>
        <CardContent>
          {intent.isPending && <p className="text-sm text-muted-foreground">Preparing checkout…</p>}
          {intent.isError && (
            <p className="text-sm text-destructive">Could not start checkout: {(intent.error as Error).message}</p>
          )}
          {options && (
            // key on the clientSecret: if the amount (and thus the intent) changes,
            // fully remount Elements — its clientSecret option can't change in place.
            <Elements key={options.clientSecret} stripe={stripePromise} options={options}>
              <PaymentForm total={total} onPaid={() => { clear(); setDone(true) }} />
            </Elements>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
