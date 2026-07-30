import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Let imports use "@/..." for "src/..." (matches the tsconfig path alias and
    // what shadcn/ui components expect).
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
