// Format an amount held in minor units (cents) as localized currency.
// Cache one Intl.NumberFormat per currency: constructing a formatter is costly
// and this runs once per order row on every render, so we build it once and reuse.
const fmtCache = new Map<string, Intl.NumberFormat>()

export function formatMoney(cents: number, currency: string): string {
  let fmt = fmtCache.get(currency)
  if (!fmt) {
    fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency })
    fmtCache.set(currency, fmt)
  }
  return fmt.format(cents / 100)
}
