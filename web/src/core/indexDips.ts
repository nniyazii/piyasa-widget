/**
 * Endeks dipleri ve alım zamanlaması (S&P 500, Nasdaq 100): ortak hesaplar.
 * Hesap research/index-dips.research.ts ile yapılır, sonuç data/index-dips.json içindedir.
 */
/** Zirveden düşüş dizisi ve o güne kadarki zirve */
export function drawdowns(c: ArrayLike<number>): { dd: number[]; peak: number[] } {
  const dd: number[] = [], peak: number[] = []
  let p = 0
  for (let i = 0; i < c.length; i++) { p = Math.max(p, c[i]); peak.push(p); dd.push(c[i] / p - 1) }
  return { dd, peak }
}
export interface Span { peak: number; trough: number; recover?: number; depth: number }
/** Zirveden en az min kadar düşülen dönemler: zirve, dip ve zirveye dönüş (dizin) */
export function episodes(c: ArrayLike<number>, min = 0.1): Span[] {
  const { dd } = drawdowns(c), out: Span[] = []
  let start = -1
  const close = (end: number | undefined) => {
    let t = start
    for (let i = start; i < (end ?? dd.length); i++) if (dd[i] < dd[t]) t = i
    if (dd[t] <= -min) out.push({ peak: start - 1, trough: t, ...(end != null ? { recover: end } : {}), depth: dd[t] })
  }
  for (let i = 0; i < dd.length; i++) {
    if (dd[i] === 0) { if (start >= 0) close(i); start = -1 } else if (start < 0) start = i
  }
  if (start > 0) close(undefined)
  return out
}
/**
 * Her ay 1 birim birikim. reserve: her ay nakitte tutulan pay; ok(i): o ay nakit endekse geçer mi; maxWait: en çok kaç ay beklenir.
 * idxR(i): endeksin o ayki getirisi (temettü dahil), cashR(i): nakdin getirisi. Sonda toplam değer.
 */
export function accumulate(a: number, b: number, reserve: number, ok: (i: number) => boolean, idxR: (i: number) => number, cashR: (i: number) => number, maxWait?: number): number {
  let units = 0, cash = 0, wait = 0
  for (let i = a; i <= b; i++) {
    if (i > a) { units *= 1 + idxR(i); cash *= 1 + cashR(i) }
    units += 1 - reserve; cash += reserve; wait++
    if (cash > 0 && (ok(i) || (maxWait != null && wait >= maxWait))) { units += cash; cash = 0; wait = 0 }
  }
  return units + cash
}

export interface Episode { peak: string; trough: string; recover?: string; depth: number; down: number; up?: number; vix?: number; rsi?: number; ur12?: number; fed12?: number; hy?: number }
export interface RuleResult { id: string; label: string; n: number; h: [number, number][]; adv: number; adv25: number }
export interface Windows { n: number; beat: number; med: number; worst: number; best: number }
export interface StrategyResult { id: string; label: string; w10: Windows; w20?: Windows }
export interface LumpResult { id: string; label: string; n: number; beat: number; med: number; worst: number }
export interface IndexNow {
  date: string; close: number; peak: number; dd: number; vix?: number; rsi?: number; ur12?: number
  levels: { dd: number; price: number }[]
  /** Bugünkü düşüş aralığındaki aylardan 12 ay sonra: n, yukarıda olma oranı, ortanca getiri */
  bucket: { label: string; n: number; up: number; med: number }
  /** Bugünkü düzeyden sonraki 12 ve 24 ayda en az %10 ve %20 daha düşüş görülme oranı (aynı aralıktaki aylardan) */
  further: { n: number; p10_12: number; p10_24: number; p20_24: number }
  active: string[]
}
export interface IndexDips {
  name: string; etf: string; from: string; to: string; months: number
  episodes: Episode[]
  /** Dipte ve her zaman (ortanca): VIX, RSI, işsizlik değişimi, kredi farkı */
  pattern: { id: string; label: string; trough: number; all: number }[]
  rules: RuleResult[]
  strategies: StrategyResult[]
  lump: LumpResult[]
  now: IndexNow
}
export interface IndexDipsFile { generated: number; indices: Record<string, IndexDips> }
