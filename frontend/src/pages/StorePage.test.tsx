import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import StorePage from './StorePage'
import { CartProvider } from '@/cart/CartContext'
import { CurrencyProvider } from '@/currency/CurrencyContext'
import * as dummy from '@/dummyjson'
import type { Product } from '@/dummyjson'

// The store now pages/filters server-side, so we mock the data functions.
vi.mock('../dummyjson', () => ({ fetchProducts: vi.fn(), fetchCategories: vi.fn() }))
// Avoid a real FX network call — the provider falls back to static rates anyway.
vi.mock('../lib/fx', () => ({ fetchRates: vi.fn().mockResolvedValue({ usd: 1, eur: 0.92, gbp: 0.79, jpy: 155 }) }))

// jsdom has no IntersectionObserver (the infinite-scroll sentinel needs one).
beforeAll(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

const p = (id: number, title: string, category: string): Product => ({
  id, title, description: '', price: 9.99, thumbnail: 'https://example.com/x.png', category, stock: 5, rating: 4,
})

const catalog = [
  p(1, 'Red Lipstick', 'beauty'),
  p(2, 'Black Mascara', 'beauty'),
  p(3, 'Office Chair', 'furniture'),
]

// Mock the server: filter the catalog by whichever mode is active and echo a total.
function mockServer() {
  vi.mocked(dummy.fetchCategories).mockResolvedValue(['beauty', 'furniture'])
  vi.mocked(dummy.fetchProducts).mockImplementation(({ q, category }) => {
    let items = catalog
    if (q) items = catalog.filter((x) => x.title.toLowerCase().includes(q.toLowerCase()))
    else if (category && category !== 'all') items = catalog.filter((x) => x.category === category)
    return Promise.resolve({ products: items, total: items.length })
  })
}

function renderStore() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <CurrencyProvider>
        <CartProvider>
          <MemoryRouter>
            <StorePage />
          </MemoryRouter>
        </CartProvider>
      </CurrencyProvider>
    </QueryClientProvider>,
  )
}

describe('StorePage filtering', () => {
  beforeEach(() => {
    mockServer()
  })

  it('renders the first page once loaded', async () => {
    renderStore()
    expect(await screen.findByText('Red Lipstick')).toBeInTheDocument()
    expect(screen.getByText('Black Mascara')).toBeInTheDocument()
    expect(screen.getByText('Office Chair')).toBeInTheDocument()
  })

  it('filters by the search box (server-side, title match)', async () => {
    renderStore()
    await screen.findByText('Red Lipstick')

    await userEvent.type(screen.getByPlaceholderText(/search/i), 'chair')

    expect(await screen.findByText('Office Chair')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Red Lipstick')).not.toBeInTheDocument())
  })

  it('filters by picking a category from the dropdown', async () => {
    renderStore()
    await screen.findByText('Red Lipstick')

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /category/i }), 'furniture')

    expect(await screen.findByText('Office Chair')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Red Lipstick')).not.toBeInTheDocument())
    expect(screen.queryByText('Black Mascara')).not.toBeInTheDocument()
  })

  it('shows an empty-state when nothing matches', async () => {
    renderStore()
    await screen.findByText('Red Lipstick')

    await userEvent.type(screen.getByPlaceholderText(/search/i), 'zzznope')

    expect(await screen.findByText(/nothing in the mix/i)).toBeInTheDocument()
  })
})
