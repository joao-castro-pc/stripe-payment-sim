// App brand: a small payment-card mark + the "PaymentSim" wordmark.
// The mark is inline SVG (no asset request; scales crisply, themeable via
// currentColor-free fixed brand colors that match the indigo nav accent).
export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#4f46e5" />
        <rect x="6" y="9" width="20" height="14" rx="2.5" fill="#ffffff" />
        <rect x="6" y="12" width="20" height="3" fill="#4f46e5" />
        <rect x="9" y="18.5" width="6" height="2" rx="1" fill="#c7d2fe" />
        <rect x="19.5" y="18" width="3.5" height="3" rx="0.8" fill="#facc15" />
      </svg>
      <span className="text-lg font-bold tracking-tight text-foreground">
        Payment<span className="text-indigo-600">Sim</span>
      </span>
    </span>
  )
}
