import { useQuery } from '@tanstack/react-query'
import { listOrders, OrderStatus, type Order } from './api'

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

export default function App() {
  // useQuery: fetch + cache + loading/error state, keyed by ['orders'].
  const { data: orders, isPending, isError, error } = useQuery({
    queryKey: ['orders'],
    queryFn: listOrders,
  })

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 640, margin: '40px auto', padding: '0 16px' }}>
      <h1>PaymentSim</h1>

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
