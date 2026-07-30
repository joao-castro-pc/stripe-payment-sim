import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useCart } from '../cart/CartContext'
import { createOrder } from '../api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

// Stripe's card iframe is styled via this API (not CSS/Tailwind).
const cardStyle = {
  style: {
    base: { fontSize: '16px', color: '#1f2937', fontFamily: 'system-ui, sans-serif', '::placeholder': { color: '#9ca3af' } },
    invalid: { color: '#dc2626' },
  },
}

export default function CheckoutPage() {
  const { items, total, clear } = useCart()
  const stripe = useStripe()
  const elements = useElements()
  const [focused, setFocused] = useState(false)
  const [cardComplete, setCardComplete] = useState(false)
  const [cardError, setCardError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const pay = useMutation({
    mutationFn: async () => {
      if (!stripe || !elements) throw new Error('Stripe not ready yet')
      const card = elements.getElement(CardElement)
      if (!card) throw new Error('Card field not ready')

      // Cart total is in US dollars; our API wants an integer amount in cents.
      const amountCents = Math.round(total * 100)
      const { clientSecret } = await createOrder(amountCents, 'usd')

      const result = await stripe.confirmCardPayment(clientSecret, { payment_method: { card } })
      if (result.error) throw new Error(result.error.message ?? 'Payment failed')
      return result.paymentIntent
    },
    onSuccess: () => {
      clear()
      setDone(true)
      toast.success('Payment succeeded', { description: 'Your order is on its way.' })
    },
    onError: (e) => toast.error('Payment failed', { description: (e as Error).message }),
  })

  // Success screen (cart already cleared).
  if (done) {
    return (
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mb-4 text-5xl">✅</div>
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Payment successful</h1>
        <p className="mb-6 text-sm text-gray-500">
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
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Your cart is empty</h1>
        <p className="mb-6 text-sm text-gray-500">Add a product before checking out.</p>
        <Button asChild>
          <Link to="/">Browse products</Link>
        </Button>
      </main>
    )
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
          <label className="mb-1.5 block text-sm font-medium text-gray-500">Card details</label>
          <div className={`rounded-lg border bg-white px-3.5 py-3 transition ${focused ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-gray-300'}`}>
            <CardElement
              options={cardStyle}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onChange={(e) => {
                setCardComplete(e.complete)
                setCardError(e.error?.message ?? null)
              }}
            />
          </div>
          {cardError && <p className="mt-2 text-sm text-red-600">{cardError}</p>}

          <Button
            className="mt-4 w-full"
            onClick={() => pay.mutate()}
            disabled={!stripe || pay.isPending || !cardComplete}
          >
            {pay.isPending ? 'Processing…' : `Pay ${usd.format(total)}`}
          </Button>

          <p className="mt-3 text-xs text-gray-400">
            Test card <code className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">4242 4242 4242 4242</code>, any future date, any CVC.
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
