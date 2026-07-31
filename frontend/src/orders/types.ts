// Order domain types, derived from the backend's OpenAPI contract via Unwrap.

import type { Schemas, Unwrap } from '@/lib/contract'

// The order status union comes straight from the backend enum:
// "Pending" | "Paid" | "Failed" | "Refunded".
export type OrderStatus = Schemas['OrderStatus']

// The admin order list (GET /orders) returns OrderResponse: the order fields plus
// the customer's email. customerEmail stays nullable (it's null for orders placed
// before accounts existed); the rest are always present on a listed order.
export type Order =
  Omit<Unwrap<Schemas['OrderResponse']>, 'customerEmail'>
  & { customerEmail: string | null }

// What POST /orders returns (clientSecret is what Stripe.js needs to confirm).
export type CreateOrderResponse = Unwrap<Schemas['CreateOrderResponse']>

// What POST /orders/{id}/refund returns (202): accepted but still pending — it
// flips to Refunded only on the charge.refunded webhook.
export type RefundResponse = Unwrap<Schemas['RefundResponse']>
