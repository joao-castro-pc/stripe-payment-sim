import { NavLink, Route, Routes } from 'react-router-dom'
import StorePage from './pages/StorePage'
import AdminPage from './pages/AdminPage'

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
          isActive ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
        }`
      }
    >
      {children}
    </NavLink>
  )
}

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <nav className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3">
          <span className="mr-2 font-bold text-gray-900">PaymentSim</span>
          <NavTab to="/">Store</NavTab>
          <NavTab to="/admin">Admin</NavTab>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<StorePage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </div>
  )
}
