import { useCurrency } from '@/currency/CurrencyContext'
import type { Currency } from '@/lib/money'

// Symbol + code shown for each currency in the nav selector.
const LABEL: Record<Currency, string> = {
  usd: '$ USD',
  eur: '€ EUR',
  gbp: '£ GBP',
  jpy: '¥ JPY',
}

export function CurrencySelect() {
  const { currency, setCurrency, currencies } = useCurrency()

  return (
    <select
      value={currency}
      onChange={(e) => setCurrency(e.target.value as Currency)}
      aria-label="Currency"
      className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      {currencies.map((c) => (
        <option key={c} value={c}>
          {LABEL[c]}
        </option>
      ))}
    </select>
  )
}
