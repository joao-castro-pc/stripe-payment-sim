// Currency helpers. All product prices in this app are in USD (DummyJSON's base);
// everything below converts/formats FROM that USD base INTO a chosen currency.

// The currencies the store offers. USD is the base (rate 1).
export const CURRENCIES = ['usd', 'eur', 'gbp', 'jpy'] as const
export type Currency = (typeof CURRENCIES)[number]

// Currencies with NO minor unit (¥100 is 100, not 10000). Stripe expects the
// amount already in the currency's smallest unit, so these must NOT be ×100.
// See https://stripe.com/docs/currencies#zero-decimal
const ZERO_DECIMAL = new Set<string>(['jpy'])

export function isZeroDecimal(currency: string): boolean {
  return ZERO_DECIMAL.has(currency.toLowerCase())
}

// Fallback FX rates (base USD) used when the live rate API is unavailable.
// Approximate — fine for a demo; the live API refines them when reachable.
export const FALLBACK_RATES: Record<Currency, number> = {
  usd: 1,
  eur: 0.92,
  gbp: 0.79,
  jpy: 155,
}

// Convert a USD amount into `currency` using a rate table (base USD).
export function convert(usdAmount: number, currency: Currency, rates: Record<string, number>): number {
  const rate = rates[currency] ?? FALLBACK_RATES[currency] ?? 1
  return usdAmount * rate
}

// Turn an already-converted amount into Stripe's smallest unit (integer):
// ×100 for normal currencies, as-is (rounded) for zero-decimal ones like JPY.
export function toMinorUnits(amount: number, currency: string): number {
  return isZeroDecimal(currency) ? Math.round(amount) : Math.round(amount * 100)
}
