import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // In dev: serve index.html for all routes so React Router-style deep links work
    historyApiFallback: true,
  },
  preview: {
    // Same for `vite preview`
    historyApiFallback: true,
  },
})
