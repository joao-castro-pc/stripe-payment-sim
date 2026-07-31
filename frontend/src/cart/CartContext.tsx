import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Product } from '@/dummyjson'

// One line in the cart: a product plus how many of it.
export interface CartItem {
  product: Product
  qty: number
}

interface CartValue {
  items: CartItem[]
  count: number // total quantity across all lines (for the nav badge)
  total: number // sum of price * qty, in US dollars
  add: (product: Product) => void
  setQty: (id: number, qty: number) => void
  remove: (id: number) => void
  clear: () => void
  // Whether the cart drawer is open. Lifted here so more than one control (the nav
  // button and the mobile floating button) can open the same single drawer.
  open: boolean
  setOpen: (open: boolean) => void
}

// React Context lets any component read the cart without passing props down
// through every level. Components call useCart() to get this value.
const CartContext = createContext<CartValue | null>(null)

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [open, setOpen] = useState(false)

  // Add one unit: bump qty if the product is already in the cart, else append it.
  const add = (product: Product) =>
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id)
      if (existing) {
        return prev.map((i) => (i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i))
      }
      return [...prev, { product, qty: 1 }]
    })

  // Set an explicit quantity; dropping to 0 (or below) removes the line.
  const setQty = (id: number, qty: number) =>
    setItems((prev) =>
      qty <= 0
        ? prev.filter((i) => i.product.id !== id)
        : prev.map((i) => (i.product.id === id ? { ...i, qty } : i)),
    )

  const remove = (id: number) => setItems((prev) => prev.filter((i) => i.product.id !== id))
  const clear = () => setItems([])

  // Derived totals. Cheap reduces over a short list — computed inline each render
  // (no useMemo: the provider only re-renders when `items` changes anyway).
  const count = items.reduce((n, i) => n + i.qty, 0)
  const total = items.reduce((sum, i) => sum + i.product.price * i.qty, 0)

  const value: CartValue = { items, count, total, add, setQty, remove, clear, open, setOpen }
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within a CartProvider')
  return ctx
}
