import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'

// Route guard: renders children only when signed in. While the initial session
// check is in flight we render nothing meaningful (avoids flashing /login), and
// when signed out we redirect to /login, remembering where the user was headed so
// login can send them back.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <p className="mx-auto max-w-6xl px-4 py-16 text-center text-muted-foreground">Loading…</p>
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }
  return <>{children}</>
}

// Stricter guard for the admin dashboard: signed in AND an admin. A signed-in
// customer is sent back to the store (they're authenticated, just not allowed).
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, isAdmin, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <p className="mx-auto max-w-6xl px-4 py-16 text-center text-muted-foreground">Loading…</p>
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }
  if (!isAdmin) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
