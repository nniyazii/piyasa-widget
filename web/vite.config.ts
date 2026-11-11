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

/** Yapı kimliği: uygulamaya gömülür ve version.json olarak yayımlanır; açık sekme yeni sürümü böyle fark eder. */
const BUILD = String(Date.now())
const version = (): Plugin => ({
  name: 'piyasa-version',
  generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) }) },
})

export default defineConfig({
  // Göreli taban: GitHub Pages alt dizini, kendi sunucunuz ya da herhangi bir statik barındırma
  base: './',
  plugins: [react(), api(), version()],
  define: { __BUILD__: JSON.stringify(BUILD) },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 600 },
  test: { environment: 'node' },
})
