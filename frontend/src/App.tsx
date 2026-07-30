import { Link, NavLink, Route, Routes } from 'react-router-dom'
import StorePage from './pages/StorePage'
import AdminPage from './pages/AdminPage'
import CheckoutPage from './pages/CheckoutPage'
import { CartSheet } from './components/CartSheet'
import { Logo } from './components/Logo'

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
        `rounded-md px-3 py-1.5 text-sm font-medium transition ${
          isActive ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
        }`
      }
    >
      {children}
    </NavLink>
  )
}

export default function App() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <nav className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3">
          <Link to="/" className="mr-2">
            <Logo />
          </Link>
          <NavTab to="/">Store</NavTab>
          <NavTab to="/admin">Admin</NavTab>
          {/* Cart trigger + drawer, available on every route. */}
          <div className="ml-auto">
            <CartSheet />
          </div>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<StorePage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </div>
  )
}
