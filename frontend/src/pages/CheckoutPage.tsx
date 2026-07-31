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
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useCart } from '@/cart/CartContext'
import { useCurrency } from '@/currency/CurrencyContext'
import { createOrder } from '@/orders/api'
import { stripePromise } from '@/stripe'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// The actual payment form. It lives inside an <Elements> mounted in DEFERRED mode
// (amount/currency up front, NO clientSecret). We create the order — and thus the
// PaymentIntent — only when the user clicks Pay, so abandoned checkouts never
// create orders and a fresh intent is used every time (no reuse of a terminal one).
function PaymentForm({ total, onPaid }: { total: number; onPaid: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const { format, toMinor, currency } = useCurrency()
  const { items } = useCart()

  const pay = useMutation({
    mutationFn: async () => {
      if (!stripe || !elements) throw new Error('Stripe not ready yet')

      // 1. Validate + collect the payment/address fields (required in deferred mode).
      const { error: submitError } = await elements.submit()
      if (submitError) throw new Error(submitError.message ?? 'Please check your details')

      // 2. Now create the order → PaymentIntent → clientSecret. Send the cart as
      //    line items, each unit price converted to the chosen currency's minor
      //    units (JPY has no cents). The backend sums these into the charged total —
      //    which matches the amount shown below because it's summed the same way.
      const lineItems = items.map((i) => ({
        productId: i.product.id,
        title: i.product.title,
        unitAmountCents: toMinor(i.product.price),
        quantity: i.qty,
        thumbnail: i.product.thumbnail,
      }))
      const { clientSecret } = await createOrder(currency, lineItems)

      // 3. Confirm against that fresh clientSecret. redirect:'if_required' keeps us
      //    on-page for methods that don't redirect (cards, Link).
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret,
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
        {pay.isPending ? 'Processing…' : `Pay ${format(total)}`}
      </Button>
      <p className="mt-3 text-xs text-muted-foreground">
        Test card <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">4242 4242 4242 4242</code>, any future date, any CVC.
      </p>
    </>
  )
}

export default function CheckoutPage() {
  const { items, total, clear } = useCart()
  const { currency, toMinor, format } = useCurrency()
  const [done, setDone] = useState(false)

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

  // Deferred Elements: amount/currency up front (so methods like Link/wallets can
  // show), no clientSecret yet. Match the appearance to the app's light/dark theme.
  const dark = document.documentElement.classList.contains('dark')
  // Sum the per-line minor amounts (not toMinor(total)) so the amount shown to
  // Stripe here exactly matches the total the backend sums from the same line
  // items — otherwise per-line rounding could differ by a cent.
  const amountMinor = items.reduce((sum, i) => sum + toMinor(i.product.price) * i.qty, 0)
  const options: StripeElementsOptions = {
    mode: 'payment',
    amount: amountMinor,
    currency,
    appearance: { theme: dark ? 'night' : 'stripe', variables: { colorPrimary: '#4f46e5' } },
  }

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
                  <span className="text-xs text-muted-foreground">{i.qty} × {format(i.product.price)}</span>
                </div>
                <span className="text-sm font-semibold tabular-nums">{format(i.product.price * i.qty)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t pt-3">
            <span className="font-medium">Total</span>
            <span className="text-lg font-bold tabular-nums">{format(total)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Payment */}
      <Card>
        <CardHeader>
          <CardTitle>Payment</CardTitle>
        </CardHeader>
        <CardContent>
          {/* key on currency+amount: if either changes, remount Elements so the
              deferred amount/currency stays in sync with what we'll charge. */}
          <Elements key={`${currency}-${amountMinor}`} stripe={stripePromise} options={options}>
            <PaymentForm total={total} onPaid={() => { clear(); setDone(true) }} />
          </Elements>
        </CardContent>
      </Card>
    </main>
  )
}
