import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Search, Star } from 'lucide-react'
import { listProducts, type Product } from '../dummyjson'
import { useCart } from '../cart/CartContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// DummyJSON prices are in US dollars, so format as USD here (our order amounts,
// shown in the admin view, are a different concern in the store's own currency).
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

// Five stars, filled up to the (rounded) rating. Decorative, so aria-hidden.
function Stars({ rating }: { rating: number }) {
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

function ProductCard({ product }: { product: Product }) {
  const { add } = useCart()

  const addToCart = () => {
    add(product)
    toast.success('Added to cart', { description: product.title })
  }

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-square overflow-hidden bg-muted">
        <img
          src={product.thumbnail}
          alt={product.title}
          loading="lazy"
          className="h-full w-full object-contain p-3 transition-transform duration-300 group-hover:scale-105"
        />
        <Badge variant="secondary" className="absolute left-2 top-2 capitalize">
          {product.category}
        </Badge>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="mb-1 line-clamp-2 text-sm font-semibold text-card-foreground">{product.title}</h3>
        <div className="mb-3 flex items-center gap-1.5">
          <Stars rating={product.rating} />
          <span className="text-xs text-muted-foreground">{product.rating.toFixed(1)}</span>
        </div>
        <div className="mb-3 mt-auto flex items-center justify-between">
          <span className="text-lg font-bold text-card-foreground">{usd.format(product.price)}</span>
          <span className="text-xs text-muted-foreground">{product.stock} in stock</span>
        </div>
        <Button size="sm" className="w-full" onClick={addToCart}>
          Add to cart
        </Button>
      </div>
    </div>
  )
}

export default function StorePage() {
  const { data: products, isPending, isError, error } = useQuery({
    queryKey: ['products'],
    // Fetch a wide slice so category/search filtering has something to work with
    // (filtering 24 items would feel empty). The catalog is static fake data.
    queryFn: () => listProducts(100),
    staleTime: 5 * 60_000,
  })

  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')

  // Distinct categories, derived from the fetched products (no extra request).
  // useMemo: recompute only when `products` changes, not on every keystroke.
  const categories = useMemo(() => {
    if (!products) return []
    return Array.from(new Set(products.map((p) => p.category))).sort()
  }, [products])

  // Apply both filters. Also memoized so typing/clicking doesn't re-scan the
  // whole list on unrelated re-renders.
  const filtered = useMemo(() => {
    if (!products) return []
    const q = query.trim().toLowerCase()
    return products.filter(
      (p) =>
        (category === 'all' || p.category === category) &&
        (q === '' || p.title.toLowerCase().includes(q)),
    )
  }, [products, category, query])

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {/* Hero */}
      <div className="mb-8 overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 px-6 py-10 text-white sm:px-10 sm:py-14">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">The PaymentSim Store</h1>
        <p className="mt-2 max-w-xl text-sm text-indigo-100 sm:text-base">
          A fake shop over a real Stripe integration. Browse, add to cart, and check out with a
          test card — every order flows through our payment API and webhooks.
        </p>
      </div>

      {isPending && <p className="text-muted-foreground">Loading products…</p>}
      {isError && <p className="text-destructive">Error: {(error as Error).message}</p>}

      {products && (
        <>
          {/* Search box */}
          <div className="relative mb-4 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products…"
              className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </div>

          {/* Category chips */}
          <div className="mb-6 flex flex-wrap gap-2">
            <Button
              variant={category === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCategory('all')}
            >
              All
            </Button>
            {categories.map((c) => (
              <Button
                key={c}
                variant={category === c ? 'default' : 'outline'}
                size="sm"
                className="capitalize"
                onClick={() => setCategory(c)}
              >
                {c}
              </Button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No products match your filters.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  )
}
