/**
 * İncelenen varlığın mumları (aylık, haftalık, günlük): makro varlıklar data/candles/{KOD}.json dosyasından,
 * hisseler günlük kopyadaki parçalardan. Gram altın ve dolar bazlı seriler Dolar/TL ile türetilir.
 */
import { assetInfo, convertFrames, framesFromFile, GRAM, IN_USD, isStock, marketOfSubject, toMonthly, withLive, type CandleFile, type Frames } from '../core/subject'
import { loadBars } from './bars'
import { scan } from './tv'

export interface Subject {
  id: string; label: string; short: string
  kind: 'macro' | 'stock'
  group: 'global' | 'tr'
  market?: 'TR' | 'US'
  frames: Frames
  /** Fiyatlar dolara çevrildi mi (BIST hisseleri) */
  usd: boolean
  generated?: number
}

const raw = new Map<string, Promise<Frames | undefined>>()
export function candles(id: string): Promise<Frames | undefined> {
  if (!raw.has(id)) raw.set(id, fetch(`data/candles/${id}.json`, { cache: 'no-cache' }).then((r) => (r.ok ? (r.json() as Promise<CandleFile>) : undefined)).then((f) => (f ? framesFromFile(f) : undefined)).catch(() => undefined))
  return raw.get(id)!
}
const quote = (symbol: string) => scan('global', { symbols: { tickers: [symbol] }, columns: ['close'] }).then((r) => (typeof r[0]?.d[0] === 'number' ? (r[0].d[0] as number) : undefined)).catch(() => undefined)

/** Makro varlık (GOLD…) ya da hisse (BIST:THYAO). [usd]: BIST hisselerini dolar bazında getir. */
export async function loadSubject(id: string, usd = false): Promise<Subject | undefined> {
  if (!isStock(id)) {
    const a = assetInfo(id)
    if (!a) return undefined
    const src = await candles(a.source ?? a.id)
    if (!src) return undefined
    let frames = src
    if (a.via) { const fx = await candles('USDTRY'); if (!fx) return undefined; frames = convertFrames(src, fx, a.via === 'gram' ? GRAM : IN_USD) }
    return { id: a.id, label: a.label, short: a.short, kind: 'macro', group: a.group, frames, usd: a.via === 'usd' }
  }
  const sym = id.toUpperCase()
  const market = marketOfSubject(sym)
  const [bars, live, fx] = await Promise.all([loadBars(sym), quote(sym), usd && market === 'TR' ? candles('USDTRY') : undefined])
  if (!bars) return undefined
  let frames: Frames = { W: bars.W, D: bars.D }
  // Kopya saatler önce alınmış olabilir: son mum canlı fiyatla güncellenir
  if (bars.source === 'snapshot') frames = withLive(frames, live)
  frames.M = toMonthly(frames.W)
  const converted = !!fx
  if (fx) frames = convertFrames(frames, fx, IN_USD)
  const code = sym.split(':').pop()!
  return { id: sym, label: code + (converted ? ' (dolar bazında)' : ''), short: code, kind: 'stock', group: market === 'TR' ? 'tr' : 'global', market, frames, usd: converted, generated: bars.generated }
}
