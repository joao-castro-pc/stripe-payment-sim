import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Vitest reads the `test` block below at runtime. We keep vite's own defineConfig
// (its plugin types match the installed vite 8) and cast past `test` — vitest 3's
// bundled config types lag vite 8, so importing defineConfig from vitest/config
// would wrongly reject the plugins. The cast is compile-time only.
const config = {
  plugins: [react(), tailwindcss()],
  resolve: {
    // Let imports use "@/..." for "src/..." (matches the tsconfig path alias and
    // what shadcn/ui components expect).
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // jsdom gives us a browser-like DOM so React components can render in Node.
    environment: 'jsdom',
    // Use describe/it/expect without importing them in every file.
    globals: true,
    // Registers @testing-library/jest-dom matchers + cleanup after each test.
    setupFiles: './src/test/setup.ts',
  },
}

// https://vite.dev/config/
export default defineConfig(config as UserConfig)
