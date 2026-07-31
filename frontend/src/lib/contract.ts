// The bridge between the generated OpenAPI contract (api-types.ts) and the clean
// domain types the app uses. Everything that mirrors a backend DTO derives from
// here, so there's one consistent way to reference the contract.

import type { components } from '@/api-types'

// All the response/request schemas from the backend's OpenAPI document.
export type Schemas = components['schemas']

// The backend's OpenAPI marks every field optional/nullable, but a real response
// always carries its core fields. `Unwrap` strips the "?" and the null so callers
// get clean, non-null access — one helper for every DTO instead of repeating this
// mapped type per type. Override individual fields afterwards when a field really
// is nullable (e.g. Order.customerEmail).
export type Unwrap<T> = { [K in keyof T]-?: NonNullable<T[K]> }
