import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from './AuthContext'
import { RequireAuth } from '../components/RequireAuth'
import LoginPage from '../pages/LoginPage'
import * as api from './api'
import type { AuthUser } from './types'

// Control the backend calls the auth layer makes.
vi.mock('./api', () => ({
  getMe: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}))

const admin: AuthUser = { email: 'admin@test.local', role: 'Admin' }

function renderApp(initialPath: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/admin" element={<RequireAuth><div>SECRET ADMIN</div></RequireAuth>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  )
}

describe('auth gating', () => {
  beforeEach(() => {
    vi.mocked(api.getMe).mockReset()
    vi.mocked(api.login).mockReset()
  })

  it('redirects to /login when signed out', async () => {
    vi.mocked(api.getMe).mockResolvedValue(null)
    renderApp('/admin')

    // The guard bounces to /login, which shows the sign-in form.
    expect(await screen.findByRole('button', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.queryByText('SECRET ADMIN')).not.toBeInTheDocument()
  })

  it('renders the protected route when signed in', async () => {
    vi.mocked(api.getMe).mockResolvedValue(admin)
    renderApp('/admin')

    expect(await screen.findByText('SECRET ADMIN')).toBeInTheDocument()
  })

  it('logs in with the entered credentials', async () => {
    vi.mocked(api.getMe).mockResolvedValue(null)
    vi.mocked(api.login).mockResolvedValue(admin)
    renderApp('/login')

    await userEvent.type(screen.getByLabelText(/email/i), 'admin@test.local')
    await userEvent.type(screen.getByLabelText(/password/i), 'secret')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(api.login).toHaveBeenCalledWith('admin@test.local', 'secret')
  })
})
