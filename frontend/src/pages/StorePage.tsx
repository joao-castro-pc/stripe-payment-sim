import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Search } from 'lucide-react'
import { listProducts, type Product } from '@/dummyjson'
import { useCart } from '@/cart/CartContext'
import { useCurrency } from '@/currency/CurrencyContext'
import { Stars } from '@/components/Stars'
import { Button } from '@/components/ui/button'

function ProductCard({ product }: { product: Product }) {
  const { add } = useCart()
  const { format } = useCurrency()

  const addToCart = () => {
    add(product)
    toast.success('Added to cart', { description: product.title })
  }

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition duration-300 hover:-translate-y-1 hover:border-gold/40 hover:shadow-xl">
      {/* Image + info link to the product detail. The Add button stays OUTSIDE the
          link so we don't nest a button inside an anchor. */}
      <Link to={`/product/${product.id}`} className="flex flex-1 flex-col">
        <div className="relative aspect-square overflow-hidden bg-linear-to-b from-muted/40 to-muted">
          <img
            src={product.thumbnail}
            alt={product.title}
            loading="lazy"
            className="h-full w-full object-contain p-6 transition-transform duration-500 group-hover:scale-105"
          />
          {/* Category as a quiet mono eyebrow on a legible chip. */}
          <span className="absolute left-3 top-3 rounded-full bg-background/70 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground backdrop-blur-sm">
            {product.category}
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-5 pb-0">
          <h3 className="line-clamp-2 font-serif text-lg leading-snug text-card-foreground">{product.title}</h3>
          <div className="flex items-center gap-1.5">
            <Stars rating={product.rating} />
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{product.rating.toFixed(1)}</span>
          </div>
          {/* Price in the serif + gold — the one indulgent note; stock stays mono/quiet. */}
          <div className="mt-auto flex items-baseline justify-between pt-2">
            <span className="font-serif text-2xl text-gold">{format(product.price)}</span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{product.stock} in stock</span>
          </div>
        </div>
      </Link>
      <div className="p-5 pt-4">
        <Button
          size="sm"
          variant="outline"
          className="w-full border-gold/30 hover:border-gold hover:bg-gold/5"
          onClick={addToCart}
        >
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
    queryFn: () => listProducts(0),
    staleTime: 5 * 60_000,
  })

  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')

  // Distinct categories, derived from the fetched products (no extra request).
  const categories = useMemo(() => {
    if (!products) return []
    return Array.from(new Set(products.map((p) => p.category))).sort()
  }, [products])

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
      {/* Hero: an editorial masthead. The couture serif wordmark carries the brand;
          the mono test-card line underneath is the quiet truth that it's a Stripe
          sandbox — that tension is the store's signature. */}
      <section className="relative mb-10 overflow-hidden rounded-3xl border border-gold/15 bg-[#0e0d0b] px-6 py-14 text-center sm:px-12 sm:py-20">
        <div className="pointer-events-none absolute -right-32 -top-32 size-96 rounded-full bg-gold/5 blur-3xl" />
        <div className="relative mx-auto max-w-3xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-gold/80">
            PaymentSim · Stripe test mode
          </p>
          <h1 className="mt-6 font-serif text-6xl font-light leading-[0.95] tracking-tight text-[#efe9dd] sm:text-8xl">
            Mélange
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-balance text-sm leading-relaxed text-[#b8b1a3] sm:text-base">
            A curated mix of everything — beauty, home, the unexpected. Add to cart and
            check out for real on Stripe, safely in test mode.
          </p>
          <div className="mx-auto mt-10 h-px w-24 bg-gold/40" />
        </div>
      </section>

      {isPending && <p className="font-mono text-sm text-muted-foreground">Loading the collection…</p>}
      {isError && <p className="text-destructive">Error: {(error as Error).message}</p>}

      {products && (
        <>
          {/* Search + category on one row (desktop). */}
          <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative sm:max-w-md sm:flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the collection…"
                className="w-full rounded-xl border border-input bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition focus-visible:border-gold/60 focus-visible:ring-2 focus-visible:ring-gold/20"
              />
            </div>

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Category"
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm capitalize text-foreground outline-none transition focus-visible:border-gold/60 focus-visible:ring-2 focus-visible:ring-gold/20 sm:w-56"
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c} className="capitalize">
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Piece count — boutique vernacular, in the quiet mono. */}
          <p className="mb-5 font-mono text-xs tabular-nums text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? 'piece' : 'pieces'}
          </p>

          {filtered.length === 0 ? (
            <p className="py-16 text-center font-serif text-lg text-muted-foreground">Nothing in the mix matches your search.</p>
          ) : (
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 lg:gap-6">
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
