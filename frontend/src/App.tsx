import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { listOrders, createOrder, OrderStatus, type Order } from './api'

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100)
}

function StatusBadge({ status }: { status: number }) {
  const paid = status === OrderStatus.Paid
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
      paid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
    }`}>
      {paid ? 'Paid' : 'Pending'}
    </span>
  )
}

// Stripe's card iframe can't be styled with CSS/Tailwind — only via this API.
const cardStyle = {
  style: {
    base: {
      fontSize: '16px',
      color: '#1f2937',
      fontFamily: 'system-ui, sans-serif',
      '::placeholder': { color: '#9ca3af' },
    },
    invalid: { color: '#dc2626' },
  },
}

function CheckoutForm() {
  const stripe = useStripe()
  const elements = useElements()
  const queryClient = useQueryClient()
  const [euros, setEuros] = useState('19.99')
  const [focused, setFocused] = useState(false)

  const pay = useMutation({
    mutationFn: async () => {
      if (!stripe || !elements) throw new Error('Stripe not ready yet')
      const card = elements.getElement(CardElement)
      if (!card) throw new Error('Card field not ready')

      const amountCents = Math.round(parseFloat(euros) * 100)
      const { clientSecret } = await createOrder(amountCents, 'eur')

      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card },
      })
      if (result.error) throw new Error(result.error.message ?? 'Payment failed')
      return result.paymentIntent
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
  })

  return (
    <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-center text-lg font-semibold text-gray-900">Checkout</h2>

      <label className="mb-4 block">
        <span className="mb-1.5 block text-sm font-medium text-gray-500">Amount (EUR)</span>
        <input
          type="number" step="0.01" min="0.50" value={euros}
          onChange={(e) => setEuros(e.target.value)}
          className="w-36 rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
      </label>

      <label className="mb-1.5 block text-sm font-medium text-gray-500">Card details</label>
      <div className={`rounded-lg border bg-white px-3.5 py-3 transition ${
        focused ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-gray-300'
      }`}>
        <CardElement
          options={cardStyle}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </div>

      <button
        onClick={() => pay.mutate()}
        disabled={!stripe || pay.isPending}
        className="mt-4 w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pay.isPending ? 'Processing…' : 'Pay'}
      </button>

      {pay.isError && <p className="mt-3 text-sm text-red-600">{(pay.error as Error).message}</p>}
      {pay.isSuccess && <p className="mt-3 text-sm text-emerald-700">Payment succeeded! The order will show as Paid.</p>}

      <p className="mt-3 text-xs text-gray-400">
        Test card <code className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">4242 4242 4242 4242</code>, any future date, any CVC.
      </p>
    </div>
  )
}

export default function App() {
  const { data: orders, isPending, isError, error } = useQuery({
    queryKey: ['orders'],
    queryFn: listOrders,
    // Poll every 2s ONLY while some order is still Pending (waiting for its
    // webhook). Once everything is Paid, stop polling. This is what makes an
    // order flip to Paid on screen without a manual refresh.
    refetchInterval: (query) => {
      const hasPending = query.state.data?.some((o) => o.status === OrderStatus.Pending)
      return hasPending ? 2000 : false
    },
  })

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="mb-8 text-center text-3xl font-bold text-gray-900">PaymentSim</h1>

      <CheckoutForm />

      <h2 className="mb-3 text-lg font-semibold text-gray-900">Orders</h2>
      {isPending && <p className="text-gray-500">Loading…</p>}
      {isError && <p className="text-red-600">Error: {(error as Error).message}</p>}
      {orders && orders.length === 0 && <p className="text-gray-500">No orders yet.</p>}
      {orders && orders.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o: Order) => (
                <tr key={o.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{formatMoney(o.amountCents, o.currency)}</td>
                  <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                  <td className="px-4 py-3 text-sm text-gray-500">{new Date(o.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
