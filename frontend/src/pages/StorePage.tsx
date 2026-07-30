import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Search } from 'lucide-react'
import { listProducts, type Product } from '../dummyjson'
import { useCart } from '../cart/CartContext'
import { Button } from '@/components/ui/button'

// DummyJSON prices are in US dollars, so format as USD here (our order amounts,
// shown in the admin view, are a different concern in the store's own currency).
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function ProductCard({ product }: { product: Product }) {
  const { add } = useCart()

  const addToCart = () => {
    add(product)
    toast.success('Added to cart', { description: product.title })
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="aspect-square overflow-hidden bg-gray-50">
        <img
          src={product.thumbnail}
          alt={product.title}
          loading="lazy"
          className="h-full w-full object-contain p-3"
        />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <span className="mb-1 text-xs uppercase tracking-wide text-gray-400">{product.category}</span>
        <h3 className="mb-2 line-clamp-2 text-sm font-semibold text-gray-900">{product.title}</h3>
        <div className="mb-3 mt-auto flex items-center justify-between">
          <span className="text-lg font-bold text-gray-900">{usd.format(product.price)}</span>
          <span className="text-xs text-gray-400">{product.stock} in stock</span>
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
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Shop</h1>
      <p className="mb-6 text-sm text-gray-500">Fake products from DummyJSON — pay for real (in Stripe test mode) via our API.</p>

      {isPending && <p className="text-gray-500">Loading products…</p>}
      {isError && <p className="text-red-600">Error: {(error as Error).message}</p>}

      {products && (
        <>
          {/* Search box */}
          <div className="relative mb-4 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products…"
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
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
            <p className="py-12 text-center text-sm text-gray-500">No products match your filters.</p>
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
