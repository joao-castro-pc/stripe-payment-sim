import type { ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CartProvider, useCart } from './CartContext'
import type { Product } from '@/dummyjson'

// Minimal product factory — only the fields the cart touches matter here.
const product = (id: number, price: number): Product => ({
  id,
  title: `Product ${id}`,
  description: '',
  price,
  thumbnail: '',
  category: 'test',
  stock: 10,
  rating: 5,
})

const wrapper = ({ children }: { children: ReactNode }) => <CartProvider>{children}</CartProvider>

describe('useCart', () => {
  it('adds a product and increments quantity on re-add', () => {
    const { result } = renderHook(() => useCart(), { wrapper })

    act(() => result.current.add(product(1, 10)))
    act(() => result.current.add(product(1, 10)))

    expect(result.current.items).toHaveLength(1)
    expect(result.current.count).toBe(2)
    expect(result.current.total).toBe(20)
  })

  it('sums count and total across different products', () => {
    const { result } = renderHook(() => useCart(), { wrapper })

    act(() => result.current.add(product(1, 10)))
    act(() => result.current.add(product(2, 2.5)))

    expect(result.current.count).toBe(2)
    expect(result.current.total).toBe(12.5)
  })

  it('setQty updates quantity, and 0 removes the line', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => result.current.add(product(1, 10)))

    act(() => result.current.setQty(1, 3))
    expect(result.current.count).toBe(3)

    act(() => result.current.setQty(1, 0))
    expect(result.current.items).toHaveLength(0)
  })

  it('remove and clear empty the cart', () => {
    const { result } = renderHook(() => useCart(), { wrapper })
    act(() => result.current.add(product(1, 10)))
    act(() => result.current.add(product(2, 5)))

    act(() => result.current.remove(1))
    expect(result.current.items).toHaveLength(1)

    act(() => result.current.clear())
    expect(result.current.items).toHaveLength(0)
    expect(result.current.total).toBe(0)
  })
})
