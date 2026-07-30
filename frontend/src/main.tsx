import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Elements } from '@stripe/react-stripe-js'
import { Toaster } from 'sonner'
import { stripePromise } from './stripe.ts'
import { CartProvider } from './cart/CartContext.tsx'
import './index.css'
import App from './App.tsx'

// One QueryClient holds the cache and config for all queries in the app.
const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Makes the query client available to every component via hooks. */}
    <QueryClientProvider client={queryClient}>
      {/* Elements loads Stripe.js and provides the card hooks/components below. */}
      <Elements stripe={stripePromise}>
        {/* BrowserRouter enables URL-based routing (uses the History API). */}
        <BrowserRouter>
          {/* CartProvider shares the cart across the store and the nav badge. */}
          <CartProvider>
            <App />
          </CartProvider>
        </BrowserRouter>
        {/* Toast notifications for actions (payment, delete). */}
        <Toaster richColors position="top-right" />
      </Elements>
    </QueryClientProvider>
  </StrictMode>,
)
