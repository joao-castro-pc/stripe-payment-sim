// One place that knows where the backend lives and how to talk to it. Every API
// call goes through here so credentials, timeouts and error handling are applied
// consistently — no per-call boilerplate that can drift.

// Where the backend lives. Both in the production monolith AND in dev (via the Vite
// proxy, see vite.config.ts) the API and SPA share one origin, so the base is ""
// (same-origin, relative fetches). Same-origin is what lets the auth cookie flow
// automatically. Override with VITE_API_BASE only if you split FE and BE onto
// separate hosts (then you also need CORS with credentials on the backend).
const configuredBase = import.meta.env.VITE_API_BASE as string | undefined
export const API_BASE = configuredBase ?? ''

// Abort a request that hangs too long instead of leaving the caller pending
// forever (a dead/slow server). TanStack Query owns retrying — we deliberately do
// NOT retry here, to avoid stacking retries on top of retries.
const DEFAULT_TIMEOUT_MS = 15_000

type JsonInit = RequestInit & {
  // Message to throw when the response isn't ok and carries no { error } body.
  fallbackError?: string
  // Per-call timeout override. Ignored if the caller passes its own `signal`.
  timeoutMs?: number
}

// Fetch JSON with cookies, a timeout, readable network errors, and { error }-body
// surfacing. Throws Error on any non-2xx or transport failure; returns the parsed
// body on success.
export async function fetchJson<T>(path: string, init: JsonInit = {}): Promise<T> {
  const { fallbackError, timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...rest } = init
  const method = rest.method ?? 'GET'

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      // Caller's signal wins; otherwise time the request out.
      signal: signal ?? AbortSignal.timeout(timeoutMs),
      ...rest,
    })
  } catch (err) {
    // fetch only rejects on transport-level failures (network down, DNS, CORS,
    // or our own timeout abort) — never on HTTP status. Turn the raw
    // TypeError/DOMException into something a human can read.
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error(`Request timed out: ${method} ${path}`)
    }
    throw new Error('Network error: could not reach the server.')
  }

  if (!res.ok) {
    // The backend sends { error: "..." } on handled failures (e.g. 400). Prefer
    // that; fall back to the caller's message, then a generic one.
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? fallbackError ?? `${method} ${path} failed: ${res.status}`)
  }

  return res.json() as Promise<T>
}

// Convenience for the common "POST a JSON body" call — sets the method, the
// Content-Type header and serializes the body, so callers don't repeat it.
export function postJson<T>(path: string, data: unknown, init: JsonInit = {}): Promise<T> {
  return fetchJson<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    ...init,
  })
}

// Same as postJson but for a partial update (PATCH) — e.g. editing one profile field.
export function patchJson<T>(path: string, data: unknown, init: JsonInit = {}): Promise<T> {
  return fetchJson<T>(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    ...init,
  })
}
