import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import StorePage from './pages/StorePage'
import ProductDetailPage from './pages/ProductDetailPage'
import AdminPage from './pages/AdminPage'
import OrderDetailPage from './pages/OrderDetailPage'
import CheckoutPage from './pages/CheckoutPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import AccountPage from './pages/AccountPage'
import { CartSheet } from './components/CartSheet'
import { Logo } from './components/Logo'
import { ThemeToggle } from './components/ThemeToggle'
import { CurrencySelect } from './components/CurrencySelect'
import { AccountMenu } from './components/AccountMenu'
import { ScrollToTop } from './components/ScrollToTop'
import { CartFab } from './components/CartFab'
import { RequireAuth, RequireAdmin } from './components/RequireAuth'
import { useAuth } from './auth/AuthContext'

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
          isActive ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        }`
      }
    >
      {children}
    </NavLink>
  )
}

export default function App() {
  const { isAdmin } = useAuth()
  // Re-mounts the routed content on every navigation so it fades up into place.
  const location = useLocation()

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky so the nav stays reachable while scrolling the product grid.
          flex-wrap is a safety net: if the row can't fit a very narrow screen the
          action cluster wraps to a second line instead of clipping (the old bug). */}
      <header className="sticky top-0 z-40 border-b bg-card">
        <nav className="mx-auto flex max-w-6xl items-center gap-1 px-3 py-3 sm:gap-2 sm:px-4">
          <Link to="/" className="mr-1 shrink-0 sm:mr-2">
            <Logo />
          </Link>
          {/* Primary tabs are hidden on mobile to keep the nav a single clean row:
              the logo already goes to the store, and admins reach the dashboard from
              the account menu. (Admin tab is admins-only — UX only, the route is
              guarded server-side too.) */}
          <div className="hidden items-center gap-1 sm:flex sm:gap-2">
            <NavTab to="/">Store</NavTab>
            {isAdmin && <NavTab to="/admin">Admin</NavTab>}
          </div>
          {/* Currency + theme + cart + account, available on every route. */}
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <CurrencySelect />
            <ThemeToggle />
            <CartSheet />
            <AccountMenu />
          </div>
        </nav>
      </header>

      <div key={location.pathname} className="animate-rise">
        <Routes location={location}>
          <Route path="/" element={<StorePage />} />
          <Route path="/product/:id" element={<ProductDetailPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          {/* Buying requires any signed-in user; the admin dashboard requires an admin. */}
          <Route path="/checkout" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
          <Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
          <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
          <Route path="/admin/orders/:id" element={<RequireAdmin><OrderDetailPage /></RequireAdmin>} />
        </Routes>
      </div>

      {/* Floating action stack, bottom-right. flex-col-reverse puts the first child
          (the cart) closest to the thumb, with back-to-top above it. Each button
          hides itself when not needed, so the stack collapses cleanly. */}
      <div className="fixed bottom-5 right-5 z-40 flex flex-col-reverse items-end gap-3">
        <CartFab />
        <ScrollToTop />
      </div>
    </div>
  )
}
