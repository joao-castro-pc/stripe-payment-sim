import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { fetchProducts, fetchCategories, type Product } from '@/dummyjson'
import { useCurrency } from '@/currency/CurrencyContext'
import { Stars } from '@/components/Stars'
import { AddToCartButton } from '@/components/AddToCartButton'

const PAGE_SIZE = 24

function ProductCard({ product }: { product: Product }) {
  const { format } = useCurrency()

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
        <AddToCartButton
          product={product}
          className="w-full border-gold/30 hover:border-gold hover:bg-gold/5"
        />
      </div>
    </div>
  )
}

export default function StorePage() {
  // The active filter lives in the URL (?category=… / ?q=…), not local state, so it
  // survives navigating to a product and back — the browser restores the query
  // string, and react-query still has the loaded pages cached under the same key.
  const [searchParams, setSearchParams] = useSearchParams()
  const category = searchParams.get('category') ?? 'all'
  const activeQuery = searchParams.get('q') ?? ''

  // Local input text for immediate typing; seeded from the URL and kept in sync when
  // the URL changes from outside (back/forward navigation).
  const [query, setQuery] = useState(activeQuery)
  useEffect(() => {
    setQuery(activeQuery)
  }, [activeQuery])

  // Debounce: after the user pauses, push the search into the URL (replace, so each
  // keystroke doesn't add a back-history entry). Writing only `q` drops any category
  // — search and category stay mutually exclusive (single-mode server query).
  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = query.trim()
      if (trimmed === activeQuery) return
      setSearchParams(trimmed ? { q: trimmed } : {}, { replace: true })
    }, 300)
    return () => clearTimeout(t)
  }, [query, activeQuery, setSearchParams])

  const onSearch = (v: string) => setQuery(v)
  const onCategory = (c: string) => {
    setQuery('')
    setSearchParams(c === 'all' ? {} : { category: c })
  }

  // Category slugs for the dropdown (static catalog → cache forever).
  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    staleTime: Infinity,
  })

  // Server-side paged fetch. Each page carries `total`; we ask for the next page
  // until we've loaded them all. The query key includes the active filter so
  // switching search/category starts a fresh paged list.
  const { data, isPending, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['products', { q: activeQuery, category }],
      queryFn: ({ pageParam }) =>
        fetchProducts({ q: activeQuery, category, limit: PAGE_SIZE, skip: pageParam }),
      initialPageParam: 0,
      getNextPageParam: (lastPage, allPages) => {
        const loaded = allPages.reduce((n, p) => n + p.products.length, 0)
        return loaded < lastPage.total ? loaded : undefined
      },
      staleTime: 5 * 60_000,
    })

  const products = data?.pages.flatMap((p) => p.products) ?? []
  const total = data?.pages[0]?.total ?? 0

  // Infinite scroll: load the next page when a sentinel near the bottom scrolls
  // into view. rootMargin pre-loads before it's actually visible.
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasNextPage) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isFetchingNextPage) fetchNextPage()
      },
      { rootMargin: '600px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

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

      {/* Search + category on one row (desktop). Always visible, even while a
          filter's first page loads. */}
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-md sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search the collection…"
            className="w-full rounded-xl border border-input bg-background py-2.5 pl-9 pr-3 text-sm outline-none transition focus-visible:border-gold/60 focus-visible:ring-2 focus-visible:ring-gold/20"
          />
        </div>

        <select
          value={category}
          onChange={(e) => onCategory(e.target.value)}
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

      {isError ? (
        <p className="text-destructive">Error: {(error as Error).message}</p>
      ) : isPending ? (
        <p className="font-mono text-sm text-muted-foreground">Loading the collection…</p>
      ) : products.length === 0 ? (
        <p className="py-16 text-center font-serif text-lg text-muted-foreground">Nothing in the mix matches your search.</p>
      ) : (
        <>
          {/* Piece count — the full server-side total, not just what's loaded. */}
          <p className="mb-5 font-mono text-xs tabular-nums text-muted-foreground">
            {total} {total === 1 ? 'piece' : 'pieces'}
          </p>

          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4 lg:gap-6">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>

          {/* Sentinel: scrolling near it loads the next page. */}
          <div ref={sentinel} aria-hidden="true" className="h-10" />
          {isFetchingNextPage && (
            <p className="pb-4 text-center font-mono text-xs text-muted-foreground">Loading more…</p>
          )}
        </>
      )}
    </main>
  )
}
