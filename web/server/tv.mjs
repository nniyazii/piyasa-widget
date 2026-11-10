/**
 * TradingView grafik verisi (günlük/aylık çubuklar) — yalnızca sunucu tarafı.
 *
 * TradingView'un veri akışı (websocket) tarayıcıda yalnızca kendi alan adından açılır; sunucu
 * kaynak başlığını kendisi belirlediği için bağlanabilir. Tek bağlantı üzerinden birden çok sembol
 * paralel oturumlarla istenir. Formüller (spread: "OANDA:XAUUSD*FX:USDTRY/31.1034768") de çalışır.
 *
 *   const bars = await tvBars(['BIST:THYAO', 'NASDAQ:AAPL'], { resolution: '1D', count: 1500 })
 *   bars.get('BIST:THYAO') → [{ t, o, h, l, c }, …]   (t: epoch saniye)
 */
const URL = 'wss://data.tradingview.com/socket.io/websocket?type=chart'

async function openSocket() {
  // Ortamda vekil varsa (kurumsal ağ, bulut oturumu) undici ile ondan geç
  const undici = await import('undici').catch(() => null)
  const WS = undici?.WebSocket ?? globalThis.WebSocket
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy
  const dispatcher = proxy && undici ? new undici.ProxyAgent(proxy) : undefined
  return new WS(URL, { headers: { Origin: 'https://www.tradingview.com' }, ...(dispatcher ? { dispatcher } : {}) })
}

const frame = (m, p) => {
  const s = JSON.stringify({ m, p })
  return `~m~${s.length}~m~${s}`
}

/**
 * @param {string[]} symbols
 * @param {{ resolution?: string, count?: number, parallel?: number, timeoutMs?: number, batch?: number, onProgress?: (done: number, total: number) => void }} [opts]
 * @returns {Promise<Map<string, {t:number,o:number,h:number,l:number,c:number}[] | null>>}
 */
export async function tvBars(symbols, opts = {}) {
  const { batch = 100, onProgress } = opts
  const all = [...new Set(symbols)]
  const out = new Map()
  let done = 0
  // TradingView bir bağlantıda çok sayıda oturumdan sonra bağlantıyı kesebilir: 100'lük gruplar, her biri yeni bağlantı
  for (let i = 0; i < all.length; i += batch) {
    const part = all.slice(i, i + batch)
    let res = await tvBatch(part, opts).catch((e) => { if (i === 0) throw e; return new Map() })
    // Gelmeyenler bir kez daha (yeni bağlantıyla)
    const missing = part.filter((s) => !res.get(s))
    if (missing.length) {
      const again = await tvBatch(missing, opts).catch(() => new Map())
      for (const s of missing) if (again.get(s)) res.set(s, again.get(s))
    }
    for (const s of part) { out.set(s, res.get(s) ?? null); onProgress?.(++done, all.length) }
  }
  return out
}

async function tvBatch(symbols, opts) {
  const { resolution = '1D', count = 1500, parallel = 6, timeoutMs = 20000 } = opts
  const out = new Map()
  const queue = [...symbols]
  if (!queue.length) return out
  const ws = await openSocket()
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = (e) => rej(new Error('TradingView bağlantısı açılamadı: ' + (e?.error?.message ?? e?.message ?? '')))
    setTimeout(() => rej(new Error('TradingView bağlantısı zaman aşımına uğradı')), 10000)
  })
  let closed = false
  const send = (m, p) => { if (closed) return; try { ws.send(frame(m, p)) } catch { closed = true } }
  send('set_auth_token', ['unauthorized_user_token'])

  const pending = new Map() // oturum → { symbol, resolve, timer, bars }
  let seq = 0
  const finish = (cs, bars) => {
    const p = pending.get(cs)
    if (!p) return
    clearTimeout(p.timer)
    pending.delete(cs)
    send('chart_delete_session', [cs])
    out.set(p.symbol, bars)
    p.resolve()
  }
  ws.onclose = () => {
    closed = true
    for (const cs of [...pending.keys()]) finish(cs, pending.get(cs)?.bars ?? null)
  }
  ws.onerror = () => { closed = true }
  ws.onmessage = (e) => {
    for (const part of String(e.data).split(/~m~\d+~m~/)) {
      if (!part) continue
      if (part.startsWith('~h~')) { try { ws.send(`~m~${part.length}~m~${part}`) } catch { /* kapalı */ } continue }
      let j
      try { j = JSON.parse(part) } catch { continue }
      const cs = j.p?.[0]
      if (!pending.has(cs)) continue
      if (j.m === 'timescale_update') {
        const s = j.p[1]?.s1?.s ?? []
        pending.get(cs).bars = s.map((x) => ({ t: x.v[0], o: x.v[1], h: x.v[2], l: x.v[3], c: x.v[4] }))
      } else if (j.m === 'series_completed') {
        finish(cs, pending.get(cs).bars ?? null)
      } else if (j.m === 'symbol_error' || j.m === 'series_error' || j.m === 'critical_error') {
        finish(cs, null)
      }
    }
  }
  const one = (symbol) => new Promise((resolve) => {
    if (closed) { out.set(symbol, null); return resolve() }
    const cs = 'cs_' + (++seq)
    pending.set(cs, { symbol, resolve, bars: undefined, timer: setTimeout(() => finish(cs, pending.get(cs)?.bars ?? null), timeoutMs) })
    send('chart_create_session', [cs, ''])
    send('resolve_symbol', [cs, 'sym1', '=' + JSON.stringify({ symbol, adjustment: 'splits' })])
    send('create_series', [cs, 's1', 's1', 'sym1', resolution, count, ''])
  })
  await Promise.all(Array.from({ length: Math.min(parallel, queue.length) }, async () => {
    while (queue.length) await one(queue.shift())
  }))
  closed = true
  try { ws.close() } catch { /* kapalı */ }
  return out
}

const HALF_DAY = 12 * 3600

/** Günlük çubuklardan aylık çubuklar: [ay başı (UTC), en düşük, en yüksek, kapanış]. */
export function monthlyFromDaily(bars) {
  const m = new Map()
  for (const b of bars) {
    const d = new Date((b.t + HALF_DAY) * 1000)
    const key = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000
    const x = m.get(key)
    if (!x) m.set(key, [key, b.l, b.h, b.c])
    else { x[1] = Math.min(x[1], b.l); x[2] = Math.max(x[2], b.h); x[3] = b.c }
  }
  return [...m.values()].sort((a, b) => a[0] - b[0])
}

const sig = (v) => (v == null || !Number.isFinite(v) ? null : Number(v.toPrecision(6)))

/**
 * Günlük kapanışların sıkıştırılmış hali (tarayıcıya gönderim ve statik dosya):
 *   [ilk gün (epoch gün), [gün farkları…], [kapanışlar…]]
 */
export function packDaily(bars) {
  if (!bars?.length) return null
  const days = bars.map((b) => Math.floor((b.t + HALF_DAY) / 86400))
  return [days[0], days.slice(1).map((d, i) => d - days[i]), bars.map((b) => sig(b.c))]
}
