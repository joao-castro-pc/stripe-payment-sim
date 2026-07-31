import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CURRENCIES, FALLBACK_RATES, convert, toMinorUnits, type Currency } from '@/lib/money'
import { fetchRates } from '@/lib/fx'

// Shares the shopper's chosen currency + the conversion helpers across the app.
// All amounts passed to format()/toMinor() are in USD (the catalog's base);
// these convert into the chosen currency using live rates (with a static fallback).
interface CurrencyValue {
  currency: Currency
  setCurrency: (c: Currency) => void
  currencies: readonly Currency[]
  format: (usdAmount: number) => string // -> localized "€12.99"
  toMinor: (usdAmount: number) => number // -> Stripe minor units in the chosen currency
  live: boolean // true once live rates loaded (false while on the fallback table)
}

const CurrencyContext = createContext<CurrencyValue | null>(null)

function readStored(): Currency {
  const s = localStorage.getItem('currency')
  return (CURRENCIES as readonly string[]).includes(s ?? '') ? (s as Currency) : 'eur'
}

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>(readStored)

  // Rates barely move, so cache for an hour; retry once then fall back.
  const { data: rates } = useQuery({
    queryKey: ['fx-rates'],
    queryFn: fetchRates,
    staleTime: 60 * 60_000,
    retry: 1,
  })

  const effectiveRates = rates ?? FALLBACK_RATES
  const live = rates !== undefined

  const setCurrency = (c: Currency) => {
    localStorage.setItem('currency', c)
    setCurrencyState(c)
  }

  const value = useMemo<CurrencyValue>(() => {
    // One cached formatter for the active currency.
    const fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() })
    return {
      currency,
      setCurrency,
      currencies: CURRENCIES,
      format: (usd) => fmt.format(convert(usd, currency, effectiveRates)),
      toMinor: (usd) => toMinorUnits(convert(usd, currency, effectiveRates), currency),
      live,
    }
    // setCurrency is stable (wraps a state setter); safe to omit from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, effectiveRates, live])

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext)
  if (!ctx) throw new Error('useCurrency must be used within a CurrencyProvider')
  return ctx
}
