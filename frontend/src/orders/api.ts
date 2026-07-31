// Order API calls. Types live in ./types; transport (cookies, timeout, errors) in
// @/lib/http.

import { fetchJson, postJson, API_BASE } from '@/lib/http'
import type { Order, CreateOrderResponse, RefundResponse } from './types'

export function listOrders(): Promise<Order[]> {
  return fetchJson<Order[]>('/orders')
}

export function createOrder(amountCents: number, currency: string): Promise<CreateOrderResponse> {
  return postJson<CreateOrderResponse>('/orders', { amountCents, currency })
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
