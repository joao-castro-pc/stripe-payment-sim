import { createContext, useContext, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getMe, login as apiLogin, logout as apiLogout, register as apiRegister, updateProfile as apiUpdateProfile } from './api'
import { isAdmin as computeIsAdmin, type AuthUser } from './types'

// Shared auth state for the whole app. `user` is null when signed out.
type AuthValue = {
  user: AuthUser | null
  // True only during the very first "who am I?" check, so guards can wait instead
  // of flashing the login page before we know if there's a session.
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  updateProfile: (name: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()

  // The session lives in an HttpOnly cookie the JS can't read, so we ask the
  // backend who we are. getMe() returns null (not an error) when signed out.
  const { data: user, isPending } = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    staleTime: 5 * 60_000,
  })

  const loginM = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => apiLogin(email, password),
    onSuccess: (u) => {
      // Cache the user and refetch anything that was gated on auth (e.g. orders).
      qc.setQueryData(['me'], u)
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  const registerM = useMutation({
    mutationFn: ({ email, password, name }: { email: string; password: string; name: string }) => apiRegister(email, password, name),
    onSuccess: (u) => {
      // Registration signs the user in, so cache them just like login.
      qc.setQueryData(['me'], u)
      qc.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  const updateProfileM = useMutation({
    mutationFn: (name: string) => apiUpdateProfile(name),
    onSuccess: (u) => {
      // The backend re-issued the cookie; mirror the fresh user into the cache so
      // the nav/account update without a refetch.
      qc.setQueryData(['me'], u)
    },
  })

  const logoutM = useMutation({
    mutationFn: apiLogout,
    onSuccess: () => {
      qc.setQueryData(['me'], null)
      // Drop cached admin data so it can't linger after signing out.
      qc.removeQueries({ queryKey: ['orders'] })
    },
  })

  const value: AuthValue = {
    user: user ?? null,
    isLoading: isPending,
    login: async (email, password) => { await loginM.mutateAsync({ email, password }) },
    register: async (email, password, name) => { await registerM.mutateAsync({ email, password, name }) },
    updateProfile: async (name) => { await updateProfileM.mutateAsync(name) },
    logout: async () => { await logoutM.mutateAsync() },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')

  return { ...ctx, isAdmin: computeIsAdmin(ctx.user) }
}