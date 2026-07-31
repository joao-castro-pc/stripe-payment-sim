import { Star } from 'lucide-react'

// Five stars, filled up to the (rounded) rating. Decorative, so aria-hidden.
// Shared by the product grid and the product-detail page.
export function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating)
  return (
    <span className="flex items-center gap-0.5" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`size-3.5 ${i < full ? 'fill-amber-400 text-amber-400' : 'fill-muted text-muted'}`}
        />
      ))}
    </span>
  )
}
