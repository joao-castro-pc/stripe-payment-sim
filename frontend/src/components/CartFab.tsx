import { ShoppingCart } from 'lucide-react'
import { useCart } from '@/cart/CartContext'

// A floating cart button for mobile, where the nav's cart sits in a hard-to-reach
// top corner. Only shows once there's something in the cart (no point, and no
// clutter, when it's empty) and opens the same drawer as the nav button.
export function CartFab() {
  const { count, setOpen } = useCart()

  if (count === 0) return null

  return (
    <button
      onClick={() => setOpen(true)}
      aria-label={`Open cart, ${count} ${count === 1 ? 'item' : 'items'}`}
      className="relative grid size-12 place-items-center rounded-full bg-foreground text-background shadow-lg transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:hidden"
    >
      <ShoppingCart className="size-5" />
      <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-gold px-1 text-[11px] font-semibold text-[#1a1712]">
        {count}
      </span>
    </button>
  )
}
