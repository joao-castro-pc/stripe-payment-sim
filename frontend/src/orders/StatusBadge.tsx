import type { OrderStatus } from './types'

// A coloured pill for an order's status. Shared by the admin list and the
// order-detail page so both stay visually in sync.
export function StatusBadge({ status }: { status: OrderStatus }) {
  const { label, classes } =
    status === 'Paid' ? { label: 'Paid', classes: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300' }
    : status === 'Failed' ? { label: 'Failed', classes: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300' }
    : status === 'Refunded' ? { label: 'Refunded', classes: 'bg-slate-200 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300' }
    : { label: 'Pending', classes: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' }
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${classes}`}>{label}</span>
  )
}
