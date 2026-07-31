// Auth API calls. Types live in ./types; transport (cookies, timeout, errors) in
// @/lib/http.

import { postJson, patchJson, API_BASE } from '@/lib/http'
import type { AuthUser } from './types'

// Sign in. Throws the backend message on 401 (wrong credentials).
export function login(email: string, password: string): Promise<AuthUser> {
  return postJson<AuthUser>('/auth/login', { email, password }, { fallbackError: 'Invalid email or password.' })
}

// Register a new customer account (signs in on success). Throws the backend
// message on 400/409 (invalid input / email taken).
export function register(email: string, password: string, name: string): Promise<AuthUser> {
  return postJson<AuthUser>('/auth/register', { email, password, name }, { fallbackError: 'Registration failed.' })
}

// Update the signed-in user's display name. Returns the refreshed user. Throws the
// backend message on 400 (invalid name).
export function updateProfile(name: string): Promise<AuthUser> {
  return patchJson<AuthUser>('/auth/me', { name }, { fallbackError: 'Could not update your profile.' })
}

// Sign out. Clears the auth cookie server-side. Best-effort — ignore the result.
export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' })
}

// Current user, or null when signed out (the backend answers 401). Returning null
// instead of throwing lets the auth query model "logged out" as data, not error.
export async function getMe(): Promise<AuthUser | null> {
  const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`GET /auth/me failed: ${res.status}`)
  return res.json()
}
