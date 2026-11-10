/**
 * Aylık fiyat geçmişi (5 yıllık dip/zirve, 5 yıllık ortalama F/K).
 *
 * Yahoo Finance tarayıcıya kapalı (CORS), bu yüzden iki yol:
 *  1. Sunucuyla çalışırken (npm start / Docker): aynı adresteki /api/yahoo vekili, canlı.
 *  2. Statik yayında (GitHub Pages): her gün GitHub Actions ile üretilen data/history/*.json.
 */
import type { Bar } from '../core/screener'

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

export function historySource(): Promise<HistorySource> {
  sourcePromise ??= (async () => {
    // Derleme ayarı: VITE_HISTORY=snapshot (GitHub Pages) ya da proxy (kendi sunucunuz); yoksa sırayla denenir
    const forced = import.meta.env?.VITE_HISTORY as HistorySource | undefined
    if (forced === 'snapshot' || forced === 'none') return forced
    try {
      const r = await fetch('api/health', { cache: 'no-store' })
      if (r.ok && (await r.json())?.yahoo) return 'proxy'
    } catch { /* statik yayın */ }
    try {
      const r = await fetch('data/history/meta.json', { cache: 'no-cache' })
      if (r.ok) return 'snapshot'
    } catch { /* yok */ }
    return 'none'
  })()
  return sourcePromise
}

export async function snapshotMeta(): Promise<{ generated: number; counts: Record<string, number> } | undefined> {
  try {
    const r = await fetch('data/history/meta.json', { cache: 'no-cache' })
    return r.ok ? await r.json() : undefined
  } catch {
    return undefined
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
    p = fetch(`data/history/${name}.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? (r.json() as Promise<SnapshotFile>) : undefined))
      .catch(() => undefined)
    files.set(name, p)
  }
  return p
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
        const y = yahooSymbol(key)
        if (!y) return undefined
        const r = await fetch(`api/yahoo/chart/${encodeURIComponent(y)}?range=6y&interval=1mo`)
        if (!r.ok) return undefined
        const bars = parseChart(await r.json())
        return bars.length ? bars : undefined
      }
      if (src === 'snapshot') {
        const file = await loadFile(snapshotFileFor(key))
        const raw = file?.bars[key]
        return raw?.map(([time, low, high, close]) => ({ time, low: low ?? undefined, high: high ?? undefined, close: close ?? undefined }))
      }
      return undefined
    })().catch(() => undefined)
    memory.set(key, p)
    // başarısız sonuçlar bir sonraki denemede yeniden istensin
    p.then((v) => { if (!v) memory.delete(key) })
  }
  return p
}
