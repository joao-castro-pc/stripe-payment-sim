import { describe, expect, it } from 'vitest'
import { convert, isZeroDecimal, toMinorUnits } from './money'

describe('toMinorUnits', () => {
  it('multiplies 2-decimal currencies by 100', () => {
    expect(toMinorUnits(19.99, 'eur')).toBe(1999)
    expect(toMinorUnits(10, 'usd')).toBe(1000)
  })

  it('keeps zero-decimal currencies (JPY) as whole units', () => {
    expect(toMinorUnits(1500, 'jpy')).toBe(1500)
    expect(isZeroDecimal('jpy')).toBe(true)
    expect(isZeroDecimal('eur')).toBe(false)
  })

  it('rounds to an integer', () => {
    expect(toMinorUnits(9.999, 'usd')).toBe(1000)
    expect(toMinorUnits(1500.6, 'jpy')).toBe(1501)
  })
})

describe('convert', () => {
  it('applies the target currency rate', () => {
    expect(convert(10, 'eur', { usd: 1, eur: 0.9, gbp: 0.8, jpy: 150 })).toBeCloseTo(9)
  })

  it('falls back to the static rate when one is missing', () => {
    // eur fallback is 0.92
    expect(convert(10, 'eur', { usd: 1 })).toBeCloseTo(9.2)
  })
})
