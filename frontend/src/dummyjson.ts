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
}

// DummyJSON wraps the list in an envelope; we only care about `products`.
interface ProductsResponse {
  products: Product[]
  total: number
  skip: number
  limit: number
}

const BASE = 'https://dummyjson.com'

// limit=0 is a DummyJSON convention that returns the entire catalog.
export async function listProducts(limit = 24): Promise<Product[]> {
  const res = await fetch(`${BASE}/products?limit=${limit}`)
  if (!res.ok) throw new Error(`DummyJSON products failed: ${res.status}`)
  const data: ProductsResponse = await res.json()
  return data.products
}
