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
