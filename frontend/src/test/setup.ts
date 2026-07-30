// Test bootstrap, loaded once by Vitest (see vite.config.ts `setupFiles`).
// Adds jest-dom matchers (toBeInTheDocument, toHaveTextContent, …) and clears
// the rendered DOM between tests so they stay isolated.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => cleanup())
