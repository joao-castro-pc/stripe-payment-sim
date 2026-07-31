import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { toast } from 'sonner'
import { listOrders, createOrder, deleteOrder, refundOrder } from '../orders/api'
import type { OrderStatus, Order } from '../orders/types'
import { API_BASE } from '../lib/http'

// Cache one Intl.NumberFormat per currency. Constructing a formatter is costly,
// and formatMoney runs once per order row on every table render — so we build it
// once per currency and reuse it instead of allocating a new one each call.
const fmtCache = new Map<string, Intl.NumberFormat>()
function formatMoney(cents: number, currency: string) {
  let fmt = fmtCache.get(currency)
  if (!fmt) {
    fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency })
    fmtCache.set(currency, fmt)
  }
  return fmt.format(cents / 100)
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const { label, classes } =
    status === 'Paid' ? { label: 'Paid', classes: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' }
    : status === 'Failed' ? { label: 'Failed', classes: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300' }
    : status === 'Refunded' ? { label: 'Refunded', classes: 'bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300' }
    : { label: 'Pending', classes: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' }
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${classes}`}>{label}</span>
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
  // Track the card field's state so we don't create an order for an incomplete card.
  const [cardComplete, setCardComplete] = useState(false)
  const [cardError, setCardError] = useState<string | null>(null)

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      toast.success('Payment succeeded', { description: 'The order will show as Paid.' })
    },
    onError: (e) => toast.error('Payment failed', { description: (e as Error).message }),
  })

  return (
    <div className="mb-8 rounded-xl border bg-card p-6 shadow-sm">
      <h2 className="mb-4 text-center text-lg font-semibold text-foreground">Checkout</h2>

      <label className="mb-4 block">
        <span className="mb-1.5 block text-sm font-medium text-muted-foreground">Amount (EUR)</span>
        <input
          type="number" step="0.01" min="0.50" value={euros}
          onChange={(e) => setEuros(e.target.value)}
          className="w-36 rounded-lg border border-input bg-background px-3 py-2 text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
        />
      </label>

      <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Card details</label>
      {/* Fixed white background so the Stripe card iframe (dark text, styled via
          cardStyle, not CSS) stays legible in dark mode too. */}
      <div className={`rounded-lg border bg-white px-3.5 py-3 transition ${
        focused ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-gray-300'
      }`}>
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
      {cardError && <p className="mt-2 text-sm text-destructive">{cardError}</p>}

      <button
        onClick={() => pay.mutate()}
        // Only enabled once the card is complete: no order is created for an
        // incomplete/invalid card (the order+PaymentIntent are created before
        // the card is confirmed, so we gate on completeness here).
        disabled={!stripe || pay.isPending || !cardComplete}
        className="mt-4 w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pay.isPending ? 'Processing…' : 'Pay'}
      </button>

      <p className="mt-3 text-xs text-muted-foreground">
        Test card <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">4242 4242 4242 4242</code>, any future date, any CVC.
      </p>
    </div>
  )
}

export default function AdminPage() {
  const queryClient = useQueryClient()
  // Deleting an order is a dev-only tool (the backend endpoint only exists in
  // Development). Vite sets DEV=true for `npm run dev`, false for a prod build,
  // so the button never ships in a production bundle.
  const isDev = import.meta.env.DEV

  // Initial load (and manual invalidations). No polling anymore.
  const { data: orders, isPending, isError, error } = useQuery({
    queryKey: ['orders'],
    queryFn: listOrders,
    // The SSE stream pushes updates and invalidates this query on every change,
    // so treat the cache as fresh for 30s: skip the redundant automatic refetches
    // (window refocus, reconnect) that would otherwise duplicate the SSE refresh.
    staleTime: 30_000,
    // ...but ALWAYS refetch when the page mounts. SSE only delivers changes that
    // happen while you're viewing /admin; an order paid elsewhere (e.g. the store
    // checkout) before you navigate here would otherwise show stale cached data
    // until a manual refresh. This guarantees a fresh list on arrival.
    refetchOnMount: 'always',
  })

  const del = useMutation({
    mutationFn: deleteOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      toast.success('Order deleted')
    },
    onError: (e) => toast.error('Delete failed', { description: (e as Error).message }),
  })

  const refund = useMutation({
    mutationFn: refundOrder,
    onSuccess: (res) => {
      // The order flips to Refunded via the webhook (SSE will refresh it). Show
      // the backend's own pending-refund message so client and server agree.
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      toast.success('Refund requested', { description: res.message })
    },
    onError: (e) => toast.error('Refund failed', { description: (e as Error).message }),
  })

  // Server push (leg B): open one SSE connection. When the backend pushes a
  // message (an order became Paid), invalidate the query so it refetches once.
  useEffect(() => {
    const source = new EventSource(`${API_BASE}/orders/stream`)
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['orders'] })
    // On every (re)connect, refetch — catches up on any change we missed while
    // the connection was down (e.g. a backend restart). EventSource auto-reconnects.
    source.onopen = refresh
    source.onmessage = refresh
    // Close the connection when the component unmounts (avoids leaks).
    return () => source.close()
  }, [queryClient])

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="mb-8 text-center text-3xl font-bold text-foreground">PaymentSim</h1>

      <CheckoutForm />

      <h2 className="mb-3 text-lg font-semibold text-foreground">Orders</h2>
      {isPending && <p className="text-muted-foreground">Loading…</p>}
      {isError && <p className="text-destructive">Error: {(error as Error).message}</p>}
      {orders && orders.length === 0 && <p className="text-muted-foreground">No orders yet.</p>}
      {orders && orders.length > 0 && (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full min-w-md">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o: Order) => (
                <tr key={o.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{formatMoney(o.amountCents, o.currency)}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{o.customerEmail ?? '—'}</td>
                  <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{new Date(o.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-3">
                      {/* Refund is a real business action — shown for any Paid order. */}
                      {o.status === 'Paid' && (
                        <button
                          onClick={() => refund.mutate(o.id)}
                          disabled={refund.isPending}
                          className="text-sm font-medium text-indigo-600 transition hover:text-indigo-800 disabled:opacity-50 dark:text-indigo-400 dark:hover:text-indigo-300"
                        >
                          Refund
                        </button>
                      )}
                      {/* Delete is a dev-only tool (backend endpoint is Development-only). */}
                      {isDev && (
                        <button
                          onClick={() => del.mutate(o.id)}
                          disabled={del.isPending}
                          className="text-sm text-muted-foreground transition hover:text-destructive disabled:opacity-50"
                          title="Delete order"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
