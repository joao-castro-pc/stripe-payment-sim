// Single place that knows where the backend lives and what its data looks like.

export const API_BASE = "http://localhost:5144";

// Mirrors the backend Order. status is a number: 0 = Pending, 1 = Paid
// (that's how the enum serializes to JSON — see Step 3 notes).
export interface Order {
  id: string;
  amountCents: number;
  currency: string;
  status: number;
  stripePaymentIntentId: string | null;
  createdAt: string;
}

export const OrderStatus = { Pending: 0, Paid: 1 } as const;

export async function listOrders(): Promise<Order[]> {
  const res = await fetch(`${API_BASE}/orders`);
  if (!res.ok) throw new Error(`GET /orders failed: ${res.status}`);
  return res.json();
}

// What POST /orders returns: the clientSecret is what Stripe.js needs to confirm.
export interface CreateOrderResponse {
  orderId: string;
  clientSecret: string;
  amountCents: number;
  currency: string;
}

export async function createOrder(
  amountCents: number,
  currency: string,
): Promise<CreateOrderResponse> {
  const res = await fetch(`${API_BASE}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amountCents, currency }),
  });
  if (!res.ok) {
    // Backend sends { error: "..." } on 400 — surface it.
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `POST /orders failed: ${res.status}`);
  }
  return res.json();
}
