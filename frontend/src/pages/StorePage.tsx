import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Search, Star } from 'lucide-react'
import { listProducts, type Product } from '@/dummyjson'
import { useCart } from '@/cart/CartContext'
import { useCurrency } from '@/currency/CurrencyContext'
import { Button } from '@/components/ui/button'

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

// The gold EMV chip from the brand mark — reused here so the hero reads as a card.
function Chip({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 24" className={className} aria-hidden="true">
      <rect width="32" height="24" rx="4" fill="#facc15" />
      <path d="M0 8h32M0 16h32M11 0v24M21 0v24" stroke="#a16207" strokeWidth="1" opacity="0.45" />
    </svg>
  )
}

function ProductCard({ product }: { product: Product }) {
  const { add } = useCart()
  const { format } = useCurrency()

  const addToCart = () => {
    add(product)
    toast.success('Added to cart', { description: product.title })
  }

  return (
    <div className="group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg hover:ring-1 hover:ring-indigo-500/30">
      <div className="relative aspect-square overflow-hidden bg-linear-to-b from-muted/50 to-muted">
        <img
          src={product.thumbnail}
          alt={product.title}
          loading="lazy"
          className="h-full w-full object-contain p-4 transition-transform duration-300 group-hover:scale-105"
        />
        {/* Category as a quiet mono eyebrow, floated on the image. */}
        <span className="absolute left-3 top-3 rounded-full bg-background/80 px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
          {product.category}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="mb-1.5 line-clamp-2 text-sm font-medium text-card-foreground">{product.title}</h3>
        <div className="flex items-center gap-1.5">
          <Stars rating={product.rating} />
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{product.rating.toFixed(1)}</span>
        </div>
        {/* Money + stock in monospace tabular figures — the "receipt" motif. */}
        <div className="mb-3 mt-auto flex items-end justify-between pt-3">
          <span className="font-mono text-lg font-semibold tabular-nums text-card-foreground">{format(product.price)}</span>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{product.stock} left</span>
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
    // Fetch the WHOLE catalog (DummyJSON: limit=0 returns all ~200 products) so
    // search and the category list cover everything, not just the first page.
    // The catalog is static fake data, so cache it for a while.
    queryFn: () => listProducts(0),
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
      {/* Hero, styled as a payment card: chip + network mark up top, embossed name
          in the middle, and the Stripe test-card number along the foot — the exact
          card you use to check out. */}
      <section className="relative mb-8 overflow-hidden rounded-3xl bg-linear-to-br from-indigo-600 via-indigo-600 to-violet-700 px-6 py-8 text-white shadow-lg sm:px-10 sm:py-10">
        <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex min-h-45 flex-col gap-7 sm:min-h-50">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Chip className="h-7 w-10 drop-shadow-sm" />
              <span className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-indigo-200">
                Fake store · Real Stripe
              </span>
            </div>
            <span className="hidden font-mono text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200/90 sm:block">
              PaymentSim
            </span>
          </div>

          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">The PaymentSim Store</h1>
            <p className="mt-2 max-w-xl text-sm text-indigo-100 sm:text-base">
              Browse, add to cart, and check out with a test card — every order runs through a real
              Stripe payment and webhook.
            </p>
          </div>

          <div className="mt-auto flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <span className="font-mono text-lg tracking-[0.18em] tabular-nums sm:text-xl">4242 4242 4242 4242</span>
            <div className="font-mono text-[10px] uppercase leading-4 tracking-[0.15em] text-indigo-200">
              <div className="text-indigo-300/70">Valid thru</div>
              <div>any date · any CVC</div>
            </div>
          </div>
        </div>
      </section>

      {isPending && <p className="font-mono text-sm text-muted-foreground">Loading products…</p>}
      {isError && <p className="text-destructive">Error: {(error as Error).message}</p>}

      {products && (
        <>
          {/* Search + category. ~24 categories as chips ate three rows, so the
              category filter is a compact dropdown that sits beside the search. */}
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative sm:max-w-md sm:flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products…"
                className="w-full rounded-xl border border-input bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </div>

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Category"
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm capitalize text-foreground outline-none transition focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 sm:w-56"
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c} className="capitalize">
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Result count in mono — small "data" detail. */}
          <p className="mb-4 font-mono text-xs tabular-nums text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? 'product' : 'products'}
          </p>

          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No products match your filters.</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 lg:gap-5">
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
