// Order API calls. Types live in ./types; transport (cookies, timeout, errors) in
// @/lib/http.

import { fetchJson, postJson, API_BASE } from '@/lib/http'
import type { CreateOrderResponse, Order, OrderDetail, OrderItemInput, RefundResponse } from './types'

export function listOrders(): Promise<Order[]> {
  return fetchJson<Order[]>('/orders')
}

// One order in full, with its line items (admin order-detail view).
export function getOrder(id: string): Promise<OrderDetail> {
  return fetchJson<OrderDetail>(`/orders/${id}`)
}

// Start a checkout. The backend sums the total from the items, so we send the
// line items (currency + products), not a pre-computed amount.
export function createOrder(currency: string, items: OrderItemInput[]): Promise<CreateOrderResponse> {
  return postJson<CreateOrderResponse>('/orders', { currency, items })
}

export function refundOrder(id: string): Promise<RefundResponse> {
  return fetchJson<RefundResponse>(`/orders/${id}/refund`, { method: 'POST' })
}

// Delete one order. The backend requires ?confirm=true (guarded dev endpoint).
// Returns no body, so it doesn't go through fetchJson.
export async function deleteOrder(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/orders/${id}?confirm=true`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`DELETE /orders/${id} failed: ${res.status}`)
}
