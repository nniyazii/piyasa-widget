/**
 * /api uçları (Node 18+; TradingView için undici):
 *   GET /api/health                     → { ok, yahoo }
 *   GET /api/yahoo/chart/:symbol?range=6y&interval=1mo  → Yahoo Finance chart yanıtı (önbellekli)
 *   GET /api/tv/daily?symbols=BIST:THYAO,NASDAQ:AAPL     → günlük kapanışlar (geçmişte test)
 *   GET /api/tv/monthly?symbols=…                         → aylık çubuklar (5 yıllık dip/zirve, ortalama F/K)
 *   GET /api/ratios                                       → uzun dönem aylık seriler (konut endeksi, altın, gümüş, dolar)
 *
 * TradingView geçmişi diskte saklanır (DATA_DIR, varsayılan web/.data): sunucu yeniden başlasa da
 * yeniden çekilmez; 6 saatten eski kayıtlara yalnızca son günler eklenir.
 *
 * Yahoo tarayıcıdan doğrudan çağrılamadığı (CORS) için sunucu aracılık eder. Yalnızca chart uç noktası,
 * yalnızca izin verilen aralıklar; yanıtlar bellekte 6 saat tutulur.
 */
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
const HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com']
const RANGES = new Set(['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '6y', '10y', 'max'])
const INTERVALS = new Set(['15m', '1h', '1d', '1wk', '1mo'])
const TTL = 6 * 3600 * 1000
const cache = new Map()
let store = null
async function getStore() {
  if (!store) {
    const { DiskStore } = await import('./store.mjs')
    const { fileURLToPath } = await import('node:url')
    const dir = process.env.DATA_DIR ?? fileURLToPath(new URL('../.data', import.meta.url))
    store = new DiskStore(dir)
  }
  return store
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

export async function handleApi(req, res) {
  try {
    const url = new URL(req.url, 'http://local')
    if (url.pathname === '/api/health') return send(res, 200, { ok: true, yahoo: true, daily: true, monthly: true })
    if (url.pathname === '/api/ratios') {
      const hit = cache.get('ratios')
      if (hit && Date.now() - hit.time < TTL) return send(res, 200, hit.body)
      const { longRatios } = await import('./ratios.mjs')
      const body = await longRatios()
      cache.set('ratios', { time: Date.now(), body })
      return send(res, 200, body)
    }
    if (url.pathname === '/api/tv/daily') return history(url, res, 'daily')
    if (url.pathname === '/api/tv/monthly') return history(url, res, 'monthly')
    const m = url.pathname.match(/^\/api\/yahoo\/chart\/([^/]+)$/)
    if (!m || req.method !== 'GET') return send(res, 404, { error: 'Bulunamadı' })
    const symbol = decodeURIComponent(m[1])
    if (!/^[A-Za-z0-9.\-=^_]{1,24}$/.test(symbol)) return send(res, 400, { error: 'Geçersiz sembol' })
    const range = url.searchParams.get('range') ?? '6y'
    const interval = url.searchParams.get('interval') ?? '1mo'
    if (!RANGES.has(range) || !INTERVALS.has(interval)) return send(res, 400, { error: 'Geçersiz aralık' })
    const key = `${symbol}|${range}|${interval}`
    const hit = cache.get(key)
    if (hit && Date.now() - hit.time < TTL) return send(res, 200, hit.body, { 'Cache-Control': 'public, max-age=3600' })
    let last = 'Yahoo erişilemedi'
    for (const host of HOSTS) {
      try {
        const r = await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`, {
          headers: { 'User-Agent': UA, Accept: 'application/json' },
          signal: AbortSignal.timeout(10_000),
        })
        if (r.status === 404) return send(res, 404, { error: 'Sembol bulunamadı' })
        if (!r.ok) { last = `Yahoo ${r.status}`; continue }
        const body = await r.text()
        cache.set(key, { time: Date.now(), body })
        if (cache.size > 5000) cache.delete(cache.keys().next().value)
        return send(res, 200, body, { 'Cache-Control': 'public, max-age=3600' })
      } catch (e) {
        last = e?.message ?? last
      }
    }
    return send(res, 502, { error: last })
  } catch (e) {
    return send(res, 500, { error: e?.message ?? 'Hata' })
  }
}

/** Geçmiş: { bars: { "BIST:THYAO": günlük paket | aylık çubuklar | null } } */
async function history(url, res, kind) {
  const symbols = (url.searchParams.get('symbols') ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
  if (!symbols.length || symbols.length > 200 || symbols.some((s) => !/^[A-Z0-9_.!:*/+\-()]{3,80}$/.test(s))) {
    return send(res, 400, { error: 'symbols: en fazla 200 TradingView sembolü' })
  }
  try {
    const recs = await (await getStore()).get(symbols)
    const bars = {}
    for (const s of symbols) bars[s] = recs[s]?.[kind] ?? null
    return send(res, 200, { bars }, { 'Cache-Control': 'public, max-age=1800' })
  } catch (e) {
    return send(res, 502, { error: e?.message ?? 'TradingView erişilemedi' })
  }
}
