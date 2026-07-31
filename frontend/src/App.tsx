import { Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import StorePage from './pages/StorePage'
import AdminPage from './pages/AdminPage'
import CheckoutPage from './pages/CheckoutPage'
import LoginPage from './pages/LoginPage'
import { CartSheet } from './components/CartSheet'
import { Logo } from './components/Logo'
import { ThemeToggle } from './components/ThemeToggle'
import { CurrencySelect } from './components/CurrencySelect'
import { RequireAuth } from './components/RequireAuth'
import { useAuth } from './auth/AuthContext'
import { Button } from '@/components/ui/button'

// Two faces of the same system, split by route:
//   /       -> the customer storefront (fake products, cart, pay via our API)
//   /admin  -> the PaymentSim dashboard (raw checkout + orders/refunds)
// React Router matches the URL to a <Route> and renders its element in <Routes>.
function NavTab({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      // `end` so "/" only matches exactly, not every route that starts with "/".
      end={to === '/'}
      // NavLink passes { isActive } so we can highlight the current tab.
      className={({ isActive }) =>
        `rounded-md px-2 py-1.5 text-sm font-medium transition sm:px-3 ${
          isActive ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        }`
      }
    >
      {children}
    </NavLink>
  )
}

// Sign-in state in the nav: the user's email + a logout button when signed in,
// otherwise a link to the login page.
function AuthControls() {
  const { user, logout, isLoading } = useAuth()
  const navigate = useNavigate()

  if (isLoading) return null
  if (!user) {
    return <NavTab to="/login">Sign in</NavTab>
  }
  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <span className="hidden max-w-[12ch] truncate text-sm text-muted-foreground md:inline" title={user.email}>
        {user.email}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={async () => { await logout(); navigate('/') }}
      >
        Sign out
      </Button>
    </div>
  )
}

export default function App() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <nav className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-3 sm:gap-2">
          <Link to="/" className="mr-1 shrink-0 sm:mr-2">
            <Logo />
          </Link>
          <NavTab to="/">Store</NavTab>
          <NavTab to="/admin">Admin</NavTab>
          {/* Currency + theme + cart + auth, available on every route. */}
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <CurrencySelect />
            <ThemeToggle />
            <CartSheet />
            <AuthControls />
          </div>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<StorePage />} />
        <Route path="/login" element={<LoginPage />} />
        {/* Buying requires a signed-in user; so does the admin dashboard. */}
        <Route path="/checkout" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth><AdminPage /></RequireAuth>} />
      </Routes>
    </div>
  )
}
