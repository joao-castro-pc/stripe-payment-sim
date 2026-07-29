import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Elements } from '@stripe/react-stripe-js'
import { stripePromise } from './stripe.ts'
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
        <App />
      </Elements>
    </QueryClientProvider>
  </StrictMode>,
)
