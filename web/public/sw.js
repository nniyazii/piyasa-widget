/*
 * Piyasa hizmet çalışanı: uygulama kabuğunu önbelleğe alır (çevrimdışı açılış, ana ekrana ekleme).
 * Fiyat ve tarama istekleri (TradingView, /api, data/) önbelleğe alınmaz: hep ağdan.
 */
const CACHE = 'piyasa-shell-v1'
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './icon.svg'])).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin) return
  if (url.pathname.includes('/api/') || url.pathname.includes('/data/')) return
  // Sürümlü dosyalar (assets/…-hash.js): önce önbellek
  if (url.pathname.includes('/assets/')) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)) }
      return r
    })))
    return
  }
  // Sayfa ve diğerleri: önce ağ, çevrimdışıysa önbellek
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)) }
    return r
  }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('./index.html'))))
})
