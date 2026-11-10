/**
 * Aylık fiyat geçmişi (5 yıllık dip/zirve, 5 yıllık ortalama F/K).
 *
 * Yahoo Finance tarayıcıya kapalı (CORS), bu yüzden iki yol:
 *  1. Sunucuyla çalışırken (npm start / Docker): aynı adresteki /api/yahoo vekili, canlı.
 *  2. Statik yayında (GitHub Pages): her gün GitHub Actions ile üretilen data/history/*.json.
 */
import type { Bar } from '../core/screener'
import { dayStamp, idbGet, idbSet } from './idb'

export type HistorySource = 'proxy' | 'snapshot' | 'none'

/** TradingView → Yahoo: BIST:THYAO → THYAO.IS, NYSE:BRK.B → BRK-B, FX:USDTRY → USDTRY=X */
export function yahooSymbol(tv: string): string | undefined {
  const i = tv.indexOf(':')
  const ex = i < 0 ? '' : tv.slice(0, i).toUpperCase()
  const t = tv.slice(i + 1).toUpperCase()
  switch (ex) {
    case 'BIST': return `${t}.IS`
    case 'NASDAQ': case 'NYSE': case 'AMEX': case 'ARCA': case 'BATS': case 'CBOE': case 'OTC': return t.replace(/\./g, '-')
    case 'FX': case 'FX_IDC': case 'OANDA': return /^[A-Z]{6}$/.test(t) ? `${t}=X` : undefined
    default: return undefined
  }
}

const HALF_DAY = 12 * 3600

/**
 * Yahoo chart yanıtından aylık çubuklar. Zaman, ayın başına (UTC) çekilir: Yahoo aylık çubukları
 * borsanın yerel gece yarısında damgalar (BIST: önceki gün 21:00 UTC); UTC'ye göre ay bulmak bir ay kaydırır.
 */
export function parseChart(body: unknown): Bar[] {
  const r = (body as { chart?: { result?: unknown[] } })?.chart?.result?.[0] as
    | { timestamp?: number[]; indicators?: { quote?: { low?: (number | null)[]; high?: (number | null)[]; close?: (number | null)[] }[] } }
    | undefined
  if (!r?.timestamp) return []
  const q = r.indicators?.quote?.[0]
  return r.timestamp.map((t, i) => {
    const d = new Date((t + HALF_DAY) * 1000)
    return {
      time: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000,
      low: q?.low?.[i] ?? undefined,
      high: q?.high?.[i] ?? undefined,
      close: q?.close?.[i] ?? undefined,
    }
  })
}

/** Anlık görüntü dosyası: { generated, bars: { "BIST:THYAO": [[t, low, high, close], …] } } */
interface SnapshotFile { generated: number; bars: Record<string, [number, number | null, number | null, number | null][]> }

let sourcePromise: Promise<HistorySource> | null = null
/** Sunucu TradingView geçmiş deposunu sunuyor mu (/api/tv/monthly) */
let serverMonthly = false

export function historySource(): Promise<HistorySource> {
  sourcePromise ??= (async () => {
    // Derleme ayarı: VITE_HISTORY=snapshot (GitHub Pages) ya da proxy (kendi sunucunuz); yoksa sırayla denenir
    const forced = import.meta.env?.VITE_HISTORY as HistorySource | undefined
    if (forced === 'snapshot' || forced === 'none') return forced
    try {
      const r = await fetch('api/health', { cache: 'no-store' })
      const j = r.ok ? await r.json() : null
      if (j?.yahoo) { serverMonthly = !!j.monthly; return 'proxy' }
    } catch { /* statik yayın */ }
    try {
      const r = await fetch('data/history/meta.json', { cache: 'no-cache' })
      if (r.ok) return 'snapshot'
    } catch { /* yok */ }
    return 'none'
  })()
  return sourcePromise
}

let metaPromise: Promise<{ generated: number; counts: Record<string, number> } | undefined> | null = null
export function snapshotMeta(): Promise<{ generated: number; counts: Record<string, number> } | undefined> {
  metaPromise ??= fetch('data/history/meta.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : undefined))
    .catch(() => undefined)
  return metaPromise
}

/**
 * Statik kopya dosyası: tarayıcıda (IndexedDB) saklanır; yalnızca merkezdeki kopya yenilendiyse
 * (meta.json'daki üretim zamanı değiştiyse) yeniden indirilir.
 */
export async function cachedSnapshotFile<T>(path: string): Promise<T | undefined> {
  const meta = await snapshotMeta()
  const key = 'f:' + path
  const hit = await idbGet<{ generated: number; data: T }>(key)
  if (hit && meta && hit.generated === meta.generated) return hit.data
  try {
    const r = await fetch(path, { cache: 'no-cache' })
    if (!r.ok) return hit?.data
    const data = (await r.json()) as T
    if (meta) void idbSet(key, { generated: meta.generated, data })
    return data
  } catch {
    return hit?.data // çevrimdışı: eldeki kopya
  }
}

const files = new Map<string, Promise<SnapshotFile | undefined>>()

function snapshotFileFor(tv: string): string {
  const ex = tv.split(':')[0].toUpperCase()
  if (ex === 'BIST') return 'bist'
  if (['NASDAQ', 'NYSE', 'AMEX', 'ARCA', 'BATS', 'CBOE', 'OTC'].includes(ex)) return 'us'
  return 'misc'
}

function loadFile(name: string) {
  let p = files.get(name)
  if (!p) {
    p = cachedSnapshotFile<SnapshotFile>(`data/history/${name}.json`)
    files.set(name, p)
  }
  return p
}

const toBars = (raw: [number, number | null, number | null, number | null][]) =>
  raw.map(([time, low, high, close]) => ({ time, low: low ?? undefined, high: high ?? undefined, close: close ?? undefined }))

// Sunucu deposundan toplu istek: aynı anda istenen semboller tek istekte (en fazla 100)
let batch: { symbols: Set<string>; promise: Promise<Record<string, [number, number | null, number | null, number | null][] | null>> } | null = null
function serverMonthlyBatch(sym: string) {
  if (!batch || batch.symbols.size >= 100) {
    const symbols = new Set<string>()
    const promise = new Promise<Record<string, [number, number | null, number | null, number | null][] | null>>((resolve) => {
      setTimeout(async () => {
        if (batch?.symbols === symbols) batch = null
        try {
          const r = await fetch(`api/tv/monthly?symbols=${[...symbols].map(encodeURIComponent).join(',')}`)
          resolve(r.ok ? (await r.json()).bars ?? {} : {})
        } catch {
          resolve({})
        }
      }, 30)
    })
    batch = { symbols, promise }
  }
  batch.symbols.add(sym)
  return batch.promise
}

const memory = new Map<string, Promise<Bar[] | undefined>>()

/** TradingView sembolünün aylık çubukları (6 yıl). Bulunamazsa undefined. */
export function monthlyBars(tv: string): Promise<Bar[] | undefined> {
  const key = tv.toUpperCase()
  let p = memory.get(key)
  if (!p) {
    p = (async () => {
      const src = await historySource()
      if (src === 'proxy') {
        // Tarayıcıda bugün alınmışsa yeniden isteme
        const cached = await idbGet<{ day: string; bars: Bar[] }>('m:' + key)
        if (cached?.day === dayStamp() && cached.bars.length) return cached.bars
        let bars: Bar[] | undefined
        if (serverMonthly) {
          const raw = (await serverMonthlyBatch(key))[key]
          if (raw?.length) bars = toBars(raw)
        }
        if (!bars) {
          const y = yahooSymbol(key)
          if (y) {
            const r = await fetch(`api/yahoo/chart/${encodeURIComponent(y)}?range=6y&interval=1mo`)
            if (r.ok) { const b = parseChart(await r.json()); if (b.length) bars = b }
          }
        }
        if (bars) void idbSet('m:' + key, { day: dayStamp(), bars })
        return bars ?? cached?.bars
      }
      if (src === 'snapshot') {
        const raw = (await loadFile(snapshotFileFor(key)))?.bars[key]
        return raw ? toBars(raw) : undefined
      }
      return undefined
    })().catch(() => undefined)
    memory.set(key, p)
    // başarısız sonuçlar bir sonraki denemede yeniden istensin
    p.then((v) => { if (!v) memory.delete(key) })
  }
  return p
}
