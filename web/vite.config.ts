import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
// @ts-expect-error: düz JS modülü (sunucuyla ortak)
import { handleApi } from './server/api.mjs'

/** Geliştirmede de /api (Yahoo vekili) çalışsın: üretim sunucusuyla aynı kod. */
const api = (): Plugin => ({
  name: 'piyasa-api',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/api/')) return next()
      void handleApi(req, res)
    })
  },
  configurePreviewServer(server) {
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/api/')) return next()
      void handleApi(req, res)
    })
  },
})

export default defineConfig({
  // Göreli taban: GitHub Pages alt dizini, kendi sunucunuz ya da herhangi bir statik barındırma
  base: './',
  plugins: [react(), api()],
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 600 },
  test: { environment: 'node' },
})
