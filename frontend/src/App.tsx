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
    <span style={{
      padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600,
      color: paid ? '#065f46' : '#92400e',
      background: paid ? '#d1fae5' : '#fef3c7',
    }}>
      {paid ? 'Paid' : 'Pending'}
    </span>
  )
}

function CheckoutForm() {
  const stripe = useStripe()
  const elements = useElements()
  const queryClient = useQueryClient()
  const [euros, setEuros] = useState('19.99')

  const pay = useMutation({
    mutationFn: async () => {
      if (!stripe || !elements) throw new Error('Stripe not ready yet')
      const card = elements.getElement(CardElement)
      if (!card) throw new Error('Card field not ready')

      // 1. Ask our backend to create the order + PaymentIntent.
      const amountCents = Math.round(parseFloat(euros) * 100)
      const { clientSecret } = await createOrder(amountCents, 'eur')

      // 2. Confirm the card with Stripe directly (card data never touches our server).
      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card },
      })
      if (result.error) throw new Error(result.error.message ?? 'Payment failed')
      return result.paymentIntent
    },
    onSuccess: () => {
      // Payment done. The order flips to Paid via webhook — refetch the list.
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  return (
    <section style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 24 }}>
      <h2 style={{ marginTop: 0 }}>Checkout</h2>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Amount (EUR):{' '}
        <input
          type="number" step="0.01" min="0.50" value={euros}
          onChange={(e) => setEuros(e.target.value)}
          style={{ width: 100 }}
        />
      </label>

      {/* Stripe's hosted card field — we never see the raw card number. */}
      <div style={{ border: '1px solid #ccc', borderRadius: 6, padding: 10, marginBottom: 12 }}>
        <CardElement />
      </div>

      <button
        onClick={() => pay.mutate()}
        disabled={!stripe || pay.isPending}
        style={{ padding: '8px 16px', cursor: 'pointer' }}
      >
        {pay.isPending ? 'Processing…' : 'Pay'}
      </button>

      {pay.isError && <p style={{ color: 'crimson' }}>{(pay.error as Error).message}</p>}
      {pay.isSuccess && <p style={{ color: '#065f46' }}>Payment succeeded! The order will show as Paid.</p>}

      <p style={{ fontSize: 12, color: '#666', marginBottom: 0 }}>
        Test card: <code>4242 4242 4242 4242</code>, any future date, any CVC.
      </p>
    </section>
  )
}

export default function App() {
  const { data: orders, isPending, isError, error } = useQuery({
    queryKey: ['orders'],
    queryFn: listOrders,
  })

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 640, margin: '40px auto', padding: '0 16px' }}>
      <h1>PaymentSim</h1>

      <CheckoutForm />

      <h2>Orders</h2>
      {isPending && <p>Loading…</p>}
      {isError && <p style={{ color: 'crimson' }}>Error: {(error as Error).message}</p>}
      {orders && orders.length === 0 && <p>No orders yet.</p>}
      {orders && orders.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
              <th>Amount</th><th>Status</th><th>Created</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o: Order) => (
              <tr key={o.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                <td>{formatMoney(o.amountCents, o.currency)}</td>
                <td><StatusBadge status={o.status} /></td>
                <td>{new Date(o.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
