import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Elements } from '@stripe/react-stripe-js'
import { Toaster } from 'sonner'
import { stripePromise } from './stripe.ts'
import { CartProvider } from './cart/CartContext.tsx'
import { CurrencyProvider } from './currency/CurrencyContext.tsx'
import { AuthProvider } from './auth/AuthContext.tsx'
import './index.css'
import App from './App.tsx'

// One QueryClient holds the cache and config for all queries in the app.
const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Makes the query client available to every component via hooks. */}
    <QueryClientProvider client={queryClient}>
      {/* AuthProvider tracks the signed-in user via /auth/me (uses the query client). */}
      <AuthProvider>
        {/* Elements loads Stripe.js and provides the card hooks/components below. */}
        <Elements stripe={stripePromise}>
          {/* BrowserRouter enables URL-based routing (uses the History API). */}
          <BrowserRouter>
            {/* CurrencyProvider holds the chosen currency + FX rates (uses the query
                client above); CartProvider shares the cart across store and nav badge. */}
            <CurrencyProvider>
              <CartProvider>
                <App />
              </CartProvider>
            </CurrencyProvider>
          </BrowserRouter>
        </Elements>
        {/* Toast notifications for actions (payment, delete). Bottom-center is the
            mobile-web convention (a Material-style snackbar): it never covers the
            sticky top nav, so the cart/controls stay tappable while a toast shows.
            Swipe to dismiss, or it auto-closes. */}
        <Toaster
          richColors
          position="bottom-center"
          offset={16}
          // On mobile the cart / back-to-top FABs sit bottom-right; lift the toast
          // above them (Material-snackbar style) so they never overlap.
          mobileOffset={{ bottom: '96px' }}
          visibleToasts={3}
        />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
