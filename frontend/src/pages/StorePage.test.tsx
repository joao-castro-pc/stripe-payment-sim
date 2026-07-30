import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StorePage from './StorePage'
import { CartProvider } from '../cart/CartContext'
import * as dummy from '../dummyjson'
import type { Product } from '../dummyjson'

// Replace the real DummyJSON fetch with a controllable mock.
vi.mock('../dummyjson', () => ({ listProducts: vi.fn() }))

const p = (id: number, title: string, category: string): Product => ({
  id, title, description: '', price: 9.99, thumbnail: 'https://example.com/x.png', category, stock: 5, rating: 4,
})

const catalog = [
  p(1, 'Red Lipstick', 'beauty'),
  p(2, 'Black Mascara', 'beauty'),
  p(3, 'Office Chair', 'furniture'),
]

function renderStore() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <CartProvider>
        <StorePage />
      </CartProvider>
    </QueryClientProvider>,
  )
}

describe('StorePage filtering', () => {
  beforeEach(() => {
    vi.mocked(dummy.listProducts).mockResolvedValue(catalog)
  })

  it('renders the whole catalog once loaded', async () => {
    renderStore()
    expect(await screen.findByText('Red Lipstick')).toBeInTheDocument()
    expect(screen.getByText('Black Mascara')).toBeInTheDocument()
    expect(screen.getByText('Office Chair')).toBeInTheDocument()
  })

  it('filters by the search box (title, case-insensitive)', async () => {
    renderStore()
    await screen.findByText('Red Lipstick')

    await userEvent.type(screen.getByPlaceholderText(/search/i), 'chair')

    expect(screen.queryByText('Red Lipstick')).not.toBeInTheDocument()
    expect(screen.getByText('Office Chair')).toBeInTheDocument()
  })

  it('filters by clicking a category chip', async () => {
    renderStore()
    await screen.findByText('Red Lipstick')

    await userEvent.click(screen.getByRole('button', { name: 'furniture' }))

    expect(screen.getByText('Office Chair')).toBeInTheDocument()
    expect(screen.queryByText('Red Lipstick')).not.toBeInTheDocument()
    expect(screen.queryByText('Black Mascara')).not.toBeInTheDocument()
  })

  it('shows an empty-state when nothing matches', async () => {
    renderStore()
    await screen.findByText('Red Lipstick')

    await userEvent.type(screen.getByPlaceholderText(/search/i), 'zzznope')

    expect(screen.getByText(/no products match/i)).toBeInTheDocument()
  })
})
