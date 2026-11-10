/**
 * Piyasa web sunucusu: derlenmiş uygulamayı (dist/) sunar ve /api vekilini çalıştırır.
 *   npm run build && npm start        → http://localhost:8080
 *   PORT=3000 HOST=0.0.0.0 npm start
 */
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createGzip } from 'node:zlib'
import { handleApi } from './server/api.mjs'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), 'dist')
const port = Number(process.env.PORT ?? 8080)
const host = process.env.HOST ?? '0.0.0.0'

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
}
const COMPRESS = new Set(['.html', '.js', '.css', '.json', '.svg', '.webmanifest'])

if (!existsSync(join(root, 'index.html'))) {
  console.error('dist/ bulunamadı. Önce derleyin: npm run build')
  process.exit(1)
}

createServer((req, res) => {
  if (req.url?.startsWith('/api/')) return void handleApi(req, res)
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname)
  let file = normalize(join(root, path))
  if (!file.startsWith(root)) { res.writeHead(403); return res.end() }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html')
  const ext = extname(file)
  const headers = {
    'Content-Type': TYPES[ext] ?? 'application/octet-stream',
    'Cache-Control': file.includes(`${join(root, 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  }
  if (COMPRESS.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
    res.writeHead(200, { ...headers, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' })
    createReadStream(file).pipe(createGzip()).pipe(res)
  } else {
    res.writeHead(200, headers)
    createReadStream(file).pipe(res)
  }
}).listen(port, host, () => console.log(`Piyasa: http://localhost:${port}`))
