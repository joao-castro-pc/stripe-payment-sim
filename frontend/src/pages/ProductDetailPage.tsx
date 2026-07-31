import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { getProduct } from '@/dummyjson'
import { useCurrency } from '@/currency/CurrencyContext'
import { Stars } from '@/components/Stars'
import { Button } from '@/components/ui/button'
import { AddToCartButton } from '@/components/AddToCartButton'

// Public product-detail page (route /product/:id). Fetches the single product
// from DummyJSON for the full gallery + description the list doesn't carry.
export default function ProductDetailPage() {
  const { id = '' } = useParams()
  const { format } = useCurrency()
  const navigate = useNavigate()

  // Go back the way the browser's back button would — so the store's active filter
  // (in the URL) and its cached, scrolled-in pages are restored, instead of jumping
  // to a fresh unfiltered store. Fall back to the store root when there's no history
  // to pop (e.g. the product was opened via a direct link or a reload).
  const backToStore = () => {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/')
  }

  const { data: product, isPending, isError, error } = useQuery({
    queryKey: ['product', id],
    queryFn: () => getProduct(id),
    staleTime: 5 * 60_000,
  })

  // Which gallery image is shown. Reset implicitly per product (component
  // remounts on route change because App keys routed content on pathname).
  const [active, setActive] = useState(0)

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Button variant="outline" size="sm" className="mb-4" onClick={backToStore}>
        <ArrowLeft className="size-4" /> Store
      </Button>

      {isPending && <p className="font-mono text-sm text-muted-foreground">Loading product…</p>}
      {isError && <p className="text-destructive">Error: {(error as Error).message}</p>}

      {product && (
        <div className="grid gap-8 md:grid-cols-2">
          {/* Gallery */}
          <div>
            <div className="aspect-square overflow-hidden rounded-2xl border bg-linear-to-b from-muted/50 to-muted">
              <img
                src={(product.images?.length ? product.images : [product.thumbnail])[active] ?? product.thumbnail}
                alt={product.title}
                className="h-full w-full object-contain p-6"
              />
            </div>
            {product.images && product.images.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {product.images.map((src, i) => (
                  <button
                    key={i}
                    onClick={() => setActive(i)}
                    className={`size-16 overflow-hidden rounded-lg border bg-white transition ${
                      i === active ? 'ring-2 ring-indigo-500' : 'hover:opacity-80'
                    }`}
                  >
                    <img src={src} alt="" className="h-full w-full object-contain p-1" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex flex-col">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              {product.category}
            </span>
            <h1 className="mt-1 font-serif text-3xl leading-tight tracking-tight text-foreground">{product.title}</h1>
            {product.brand && <p className="mt-0.5 text-sm text-muted-foreground">by {product.brand}</p>}

            <div className="mt-3 flex items-center gap-2">
              <Stars rating={product.rating} />
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{product.rating.toFixed(1)}</span>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{product.description}</p>

            <div className="mt-6 flex items-end justify-between">
              <span className="font-serif text-4xl text-gold">{format(product.price)}</span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
              </span>
            </div>

            <AddToCartButton
              product={product}
              variant="default"
              size="default"
              className="mt-5 w-full"
              disabled={product.stock <= 0}
            />
          </div>
        </div>
      )}
    </main>
  )
}
