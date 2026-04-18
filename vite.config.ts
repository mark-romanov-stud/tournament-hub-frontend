import path from 'node:path'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '~': path.resolve(fileURLToPath(new URL('.', import.meta.url)), './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'https://tournament-hub-backend.onrender.com',
        changeOrigin: true,
        secure: true,
      },
    },
  },
})
