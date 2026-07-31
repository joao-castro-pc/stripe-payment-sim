import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { getOrder } from '@/orders/api'
import { formatMoney } from '@/orders/format'
import { StatusBadge } from '@/orders/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Admin-only order detail (route /admin/orders/:id). Shows the total, customer,
// the Stripe PaymentIntent (deep-linked to the dashboard) and the line items.
export default function OrderDetailPage() {
  const { id = '' } = useParams()

  const { data: order, isPending, isError, error } = useQuery({
    queryKey: ['order', id],
    queryFn: () => getOrder(id),
  })

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Button asChild variant="outline" size="sm" className="mb-4">
        <Link to="/admin"><ArrowLeft className="size-4" /> Orders</Link>
      </Button>

      {isPending && <p className="text-muted-foreground">Loading…</p>}
      {isError && <p className="text-destructive">Error: {(error as Error).message}</p>}

      {order && (
        <div className="space-y-6">
          {/* Summary */}
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-2xl tabular-nums">{formatMoney(order.amountCents, order.currency)}</CardTitle>
                <p className="mt-1 font-mono text-xs text-muted-foreground">Order {order.id}</p>
              </div>
              <StatusBadge status={order.status} />
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <Detail label="Customer">{order.customerEmail ?? '—'}</Detail>
              <Detail label="Created">{new Date(order.createdAt).toLocaleString()}</Detail>
              <Detail label="Currency">{order.currency.toUpperCase()}</Detail>
              <Detail label="PaymentIntent">
                {order.stripePaymentIntentId ? (
                  <a
                    href={`https://dashboard.stripe.com/test/payments/${order.stripePaymentIntentId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    {order.stripePaymentIntentId} ↗
                  </a>
                ) : (
                  '—'
                )}
              </Detail>
            </CardContent>
          </Card>

          {/* Line items */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Items ({order.items.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {order.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No line items recorded for this order.</p>
              ) : (
                <div className="divide-y">
                  {order.items.map((item, i) => (
                    <div key={i} className="flex items-center gap-3 py-3">
                      {item.thumbnail ? (
                        <img src={item.thumbnail} alt="" className="size-12 rounded border bg-white object-contain p-1" />
                      ) : (
                        <div className="grid size-12 place-items-center rounded border bg-muted text-lg">🧾</div>
                      )}
                      <div className="flex flex-1 flex-col">
                        <span className="line-clamp-1 text-sm font-medium">{item.title}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {item.quantity} × {formatMoney(item.unitAmountCents, order.currency)}
                        </span>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">
                        {formatMoney(item.unitAmountCents * item.quantity, order.currency)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-3 font-medium">
                    <span>Total</span>
                    <span className="text-lg font-bold tabular-nums">{formatMoney(order.amountCents, order.currency)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  )
}

// A small labelled field used in the summary grid.
function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-all text-foreground">{children}</dd>
    </div>
  )
}
