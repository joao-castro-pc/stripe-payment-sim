import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
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
    queryFn: () => listProducts(24),
    // The catalog is static fake data — no need to refetch aggressively.
    staleTime: 5 * 60_000,
  })

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold text-gray-900">Shop</h1>
      <p className="mb-6 text-sm text-gray-500">Fake products from DummyJSON — pay for real (in Stripe test mode) via our API.</p>

      {isPending && <p className="text-gray-500">Loading products…</p>}
      {isError && <p className="text-red-600">Error: {(error as Error).message}</p>}

      {products && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </main>
  )
}
