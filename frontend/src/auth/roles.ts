import type { components } from '@/api-types'
import type { AuthUser } from '../api'

// The role union straight from the API contract: "Admin" | "Customer".
export type UserRole = components['schemas']['UserRole']

// Runtime role values. A TypeScript type is erased at runtime, so you can't read a
// value off `UserRole` — you need a real object somewhere. `satisfies` ties this to
// the contract: every value must be a valid UserRole, so if the backend renames a
// role (changing the generated union), THIS stops compiling instead of drifting
// into a silent mismatch. So it's "from the type", just checked, not hand-guessed.
export const UserRole = {
  Admin: 'Admin',
  Customer: 'Customer',
} as const satisfies Record<UserRole, UserRole>

// UX-only role check: use it to show/hide bits of UI. Real authorization is enforced
// server-side (the cookie's role claim) — a client check is never a security boundary.
// Pure function: pass the user from useAuth(); never call hooks in here.
export const isAdmin = (user: AuthUser | null | undefined): boolean =>
  user?.role === UserRole.Admin
