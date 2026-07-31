// The product catalog comes from DummyJSON (dummyjson.com), a free fake-product
// API. Our own backend stays payment/orders only — this keeps the store's catalog
// concern cleanly separate from our payment domain (and teaches consuming an
// external API alongside our own).

export interface Product {
  id: number
  title: string
  description: string
  price: number // US dollars, decimal (e.g. 9.99) — NOT cents.
  thumbnail: string
  category: string
  stock: number
  rating: number
  // Extra fields the single-product endpoint returns (the list carries them too,
  // but we only rely on them on the detail page). Optional so the list type stays lean.
  images?: string[]
  brand?: string
  discountPercentage?: number
}

// DummyJSON wraps every list in this envelope; `total` drives pagination.
interface ProductsResponse {
  products: Product[]
  total: number
  skip: number
  limit: number
}

// One page of results plus the total count of the whole (server-side) result set.
export interface ProductPage {
  products: Product[]
  total: number
}

const BASE = 'https://dummyjson.com'

// Fetch one page of products, letting the SERVER do the search/category filtering
// and paging (skip/limit) — so we never have to hold the whole catalog in memory.
// The three modes are mutually exclusive (see StorePage): a search query, a single
// category, or the full catalog. Each DummyJSON endpoint returns the same envelope
// with a `total` we use to know when there are no more pages.
export async function fetchProducts(
  { q, category, limit = 24, skip = 0 }: { q?: string; category?: string; limit?: number; skip?: number },
): Promise<ProductPage> {
  const params = new URLSearchParams({ limit: String(limit), skip: String(skip) })
  let path: string
  if (q && q.trim()) {
    params.set('q', q.trim())
    path = `/products/search?${params}`
  } else if (category && category !== 'all') {
    path = `/products/category/${encodeURIComponent(category)}?${params}`
  } else {
    path = `/products?${params}`
  }

  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`DummyJSON products failed: ${res.status}`)
  const data: ProductsResponse = await res.json()
  return { products: data.products, total: data.total }
}

// The list of category slugs, for the filter dropdown.
export async function fetchCategories(): Promise<string[]> {
  const res = await fetch(`${BASE}/products/category-list`)
  if (!res.ok) throw new Error(`DummyJSON categories failed: ${res.status}`)
  return res.json() as Promise<string[]>
}

// One product in full (images gallery, brand, description) for the detail page.
export async function getProduct(id: number | string): Promise<Product> {
  const res = await fetch(`${BASE}/products/${id}`)
  if (!res.ok) throw new Error(`DummyJSON product ${id} failed: ${res.status}`)
  return res.json() as Promise<Product>
}
