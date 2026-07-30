import { CURRENCIES, FALLBACK_RATES, type Currency } from './money'

// Live FX rates from a free, no-key endpoint (base USD). We only keep the
// currencies the store offers, and start from FALLBACK_RATES so any currency the
// API doesn't return still has a value. Throwing on failure lets React Query fall
// back (the CurrencyProvider uses FALLBACK_RATES until/unless this resolves).
export async function fetchRates(): Promise<Record<Currency, number>> {
  const res = await fetch('https://open.er-api.com/v6/latest/USD')
  if (!res.ok) throw new Error(`FX rates failed: ${res.status}`)
  const data = await res.json()
  if (data.result !== 'success' || !data.rates) throw new Error('FX rates unavailable')

  const rates = { ...FALLBACK_RATES }
  for (const c of CURRENCIES) {
    const r = data.rates[c.toUpperCase()]
    if (typeof r === 'number') rates[c] = r
  }
  return rates
}
