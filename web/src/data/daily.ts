/**
 * Günlük kapanışlar (geçmişte test için). Kaynak geçmiş verisiyle aynı mantıkla seçilir:
 *   sunucuda  → /api/tv/daily (TradingView, canlı)
 *   statikte  → data/daily/{misc,bist,us}.json (her iş günü üretilen kopya)
 */
import { historySource } from './history'

/** Bir sembolün günlük serisi: gün (epoch gün, UTC) ve kapanış. */
export interface DailySeries { days: Int32Array; close: Float64Array }

type Packed = [number, number[], (number | null)[]] | null

export function unpack(p: Packed): DailySeries | undefined {
  if (!p || !p[2]?.length) return undefined
  const n = p[2].length
  const days = new Int32Array(n)
  const close = new Float64Array(n)
  let d = p[0]
  let last = NaN
  for (let i = 0; i < n; i++) {
    if (i > 0) d += p[1][i - 1]
    days[i] = d
    const c = p[2][i]
    close[i] = c == null ? last : c
    if (c != null) last = c
  }
  return { days, close }
}

const fileFor = (s: string) => {
  const ex = s.split(':')[0].toUpperCase()
  if (ex === 'BIST' && !/^BIST:(XU|XBANK)/.test(s)) return 'bist'
  if (['NASDAQ', 'NYSE', 'AMEX', 'ARCA', 'BATS', 'CBOE', 'OTC'].includes(ex) && s !== 'NASDAQ:NDX') return 'us'
  return 'misc'
}

const files = new Map<string, Promise<Record<string, Packed>>>()
function loadFile(name: string) {
  let p = files.get(name)
  if (!p) {
    p = fetch(`data/daily/${name}.json`, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : { bars: {} }))
      .then((j: { bars: Record<string, Packed> }) => j.bars ?? {})
      .catch(() => ({}))
    files.set(name, p)
  }
  return p
}

const memory = new Map<string, DailySeries | null>()

/**
 * İstenen sembollerin günlük kapanışları. [onProgress] yüklenen sembol sayısını bildirir.
 * Bulunamayanlar sonuçta yer almaz.
 */
export async function dailyCloses(symbols: string[], onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<Map<string, DailySeries>> {
  const want = [...new Set(symbols.map((s) => s.toUpperCase()))]
  const out = new Map<string, DailySeries>()
  const need = want.filter((s) => {
    const m = memory.get(s)
    if (m) out.set(s, m)
    return m === undefined
  })
  let done = want.length - need.length
  onProgress?.(done, want.length)
  if (!need.length) return out
  const src = await historySource()
  if (src === 'proxy') {
    for (let i = 0; i < need.length; i += 100) {
      if (signal?.aborted) throw new DOMException('İptal', 'AbortError')
      const chunk = need.slice(i, i + 100)
      const r = await fetch(`api/tv/daily?count=1000&symbols=${chunk.map(encodeURIComponent).join(',')}`, { signal })
      const j = r.ok ? ((await r.json()) as { bars: Record<string, Packed> }) : { bars: {} }
      for (const s of chunk) {
        const d = unpack(j.bars[s] ?? null)
        memory.set(s, d ?? null)
        if (d) out.set(s, d)
      }
      done += chunk.length
      onProgress?.(done, want.length)
    }
  } else if (src === 'snapshot') {
    const groups = new Map<string, string[]>()
    for (const s of need) groups.set(fileFor(s), [...(groups.get(fileFor(s)) ?? []), s])
    for (const [name, list] of groups) {
      // Endeks ve kur gibi semboller her dosyada olabilir: önce kendi dosyası, yoksa diğer dosya
      const bars = await loadFile(name)
      const misc = name === 'misc' ? bars : await loadFile('misc')
      for (const s of list) {
        const d = unpack(bars[s] ?? misc[s] ?? null)
        memory.set(s, d ?? null)
        if (d) out.set(s, d)
      }
      done += list.length
      onProgress?.(done, want.length)
    }
  }
  return out
}

export async function dailyAvailable(): Promise<boolean> {
  const src = await historySource()
  if (src === 'proxy') return true
  if (src === 'snapshot') {
    try { return (await fetch('data/daily/misc.json', { method: 'HEAD', cache: 'no-cache' })).ok } catch { return false }
  }
  return false
}
