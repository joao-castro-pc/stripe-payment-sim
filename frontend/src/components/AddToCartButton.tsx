import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { useCart } from '@/cart/CartContext'
import { Button } from '@/components/ui/button'
import type { Product } from '@/dummyjson'

// Adds a product to the cart with in-place feedback instead of a toast: the button
// briefly flips to "Added ✓". Adding is routine and reversible, and the cart badge
// already reflects it — so a toast per add is just noise. Toasts stay for things
// the user can't otherwise see (payment, refunds, errors).
export function AddToCartButton({
  product,
  label = 'Add to cart',
  disabled,
  className,
  variant = 'outline',
  size = 'sm',
}: {
  product: Product
  label?: string
  disabled?: boolean
  className?: string
  variant?: React.ComponentProps<typeof Button>['variant']
  size?: React.ComponentProps<typeof Button>['size']
}) {
  const { add } = useCart()
  const [added, setAdded] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const onClick = () => {
    add(product)
    setAdded(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setAdded(false), 1300)
  }

  return (
    <Button
      size={size}
      variant={variant}
      className={className}
      disabled={disabled}
      onClick={onClick}
      aria-label={`Add ${product.title} to cart`}
    >
      {added ? (
        <span className="inline-flex items-center gap-1.5 text-gold">
          <Check className="size-4" /> Added
        </span>
      ) : (
        label
      )}
    </Button>
  )
}
