import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: { outDir: 'dist' },
  server: { port: 5176, proxy: { '/api': { target: 'https://businessflow-api.marketmesh-api.workers.dev', changeOrigin: true } } }
})
