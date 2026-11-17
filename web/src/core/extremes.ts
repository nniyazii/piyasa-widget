/**
 * Abartılı satış (ve yükseliş) incelemesi.
 *   Aşırılık puanı: son 5 gün, 1 ay ve 3 ayın hareketi, 200 günlük ortalamaya uzaklık (varlığın kendi oynaklığına göre)
 *   ve RSI'ın ortalaması. Negatif: sert düşüş. Eşikler pazardaki bütün hisselerin 2021 öncesi günlerinden seçilir.
 *   Pazar geneli satış (genişlik): aynı gün aşırı satılmış hisselerin payı.
 *   Kurallar: güçlü = hisse en sert %1'lik dilimde ve pazar genelinde satış; yakın = en sert %2; tek başına = pazar sakinken.
 * Sınama research/extremes.research.ts ile yapılır, sonuç data/extremes.json içindedir.
 */
import type { OHLCV } from './study'

const cl = (x: number) => Math.max(-6, Math.min(6, x))
/** Aşırılık puanı (gün gün); ilk 250 gün NaN. Yalnızca o güne kadarki veri kullanılır. */
export function extremeScore(b: OHLCV): Float64Array {
  const n = b.t.length, c = b.c, S = new Float64Array(n).fill(NaN)
  let s1 = 0, s2 = 0, ma = 0, g = 0, l = 0
  for (let i = 1; i < n; i++) {
    const r = Math.log(c[i] / c[i - 1]); s1 += r; s2 += r * r
    if (i > 250) { const o = Math.log(c[i - 250] / c[i - 251]); s1 -= o; s2 -= o * o }
    ma += c[i]; if (i >= 200) ma -= c[i - 200]
    const d = c[i] - c[i - 1]
    if (i <= 14) { g += Math.max(0, d) / 14; l += Math.max(0, -d) / 14 } else { g = (g * 13 + Math.max(0, d)) / 14; l = (l * 13 + Math.max(0, -d)) / 14 }
    if (i < 250) continue
    const k = Math.min(i, 250), m = s1 / k, v = Math.sqrt(Math.max(1e-12, s2 / k - m * m))
    S[i] = scoreAt(c, i, c[i], v, ma / 200, l === 0 ? 100 : 100 - 100 / (1 + g / l))
  }
  return S
}
function scoreAt(c: ArrayLike<number>, i: number, price: number, v: number, ma200: number, rsi: number): number {
  return (cl(Math.log(price / c[i - 5]) / (v * Math.sqrt(5))) + cl(Math.log(price / c[i - 21]) / (v * Math.sqrt(21))) + cl(Math.log(price / c[i - 63]) / (v * Math.sqrt(63)))
    + cl(Math.log(price / ma200) / (v * 10)) + cl((rsi - 50) / 15)) / 5
}
/** Son mum verilen fiyattan kapansaydı aşırılık puanı */
export function scoreIfClose(b: OHLCV, price: number): number {
  const c = [...b.c.slice(0, -1), price]
  const S = extremeScore({ ...b, c })
  return S[S.length - 1]
}
/** Puanın hedefe ulaşacağı kapanış fiyatı (bugün); bulunamazsa undefined */
export function priceForScore(b: OHLCV, target: number, side: 'low' | 'high' = 'low'): number | undefined {
  const c0 = b.c[b.c.length - 1]
  const now = scoreIfClose(b, c0)
  if (side === 'low' ? now <= target : now >= target) return c0
  let lo = side === 'low' ? c0 * 0.2 : c0, hi = side === 'low' ? c0 : c0 * 5
  if (side === 'low' ? scoreIfClose(b, lo) > target : scoreIfClose(b, hi) < target) return undefined
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2, s = scoreIfClose(b, mid)
    if (side === 'low') { if (s <= target) lo = mid; else hi = mid } else { if (s >= target) hi = mid; else lo = mid }
  }
  return side === 'low' ? lo : hi
}

// ------------------------------------------------------------------ dosya biçimi

export const HORIZONS = [5, 21, 63]
export const HORIZON_LABEL = ['1 hafta', '1 ay', '3 ay']
/** Bir grubun sonucu: n, her vade için [doğru yönde oranı, ortanca getiri], sonrasında ortanca ve kötü çeyrek ters hareket */
export interface Block { n: number; h: [number, number][]; adv: number; adv25: number }
export interface RuleStats {
  /** Eşiklerin seçildiği dönem (2021 öncesi) ve hiç görülmemiş dönem (2021 sonrası); her biri sinyal ve her zamanki */
  pre: { sig: Block; base: Block }; post: { sig: Block; base: Block }
  /** Yıl, sinyal sayısı, 1 ay sonra doğru yönde oranı (sinyal), aynı yılın her zamanki oranı */
  years: [number, number, number, number][]
}
export interface Episode { from: number; to: number; stocks: number; h: number[]; adv: number }
export type RuleId = 'strong' | 'near' | 'alone' | 'top'
export interface MarketExtremes {
  label: string; stocks: number
  /** Aşırılık puanı eşikleri (2021 öncesi bütün günlerden) */
  th: { q005: number; q01: number; q02: number; q05: number; q99: number }
  /** Genişlik: gün numarası (t/86400) başlangıcı ve her gün aşırı satılmış hisse payı (binde; −1 veri yok) */
  breadth?: { d0: number; v: number[]; q90: number; q95: number }
  rules: Partial<Record<RuleId, RuleStats>>
  /** Güçlü sinyalin geçmiş dönemleri (pazar genelinde) */
  episodes: Episode[]
  /** Kurala göre işlem yapılsaydı (yalnızca pazar genişliği olan gruplarda) */
  strategy?: Strategy
}
/** Strateji sınamasının bir dönemi: toplam getiri, yıllık bileşik getiri, en kötü düşüş (zirveden), piyasada kalınan gün payı */
export interface Metrics { total: number; cagr: number; mdd: number; invested: number }
export interface TradeStats { n: number; win: number; med: number; avg: number; worst: number; best: number }
export interface Strategy {
  hold: number; cost: number; start: number
  /** Her dönem için strateji, endeksi baştan sona tutmak ve aynı günlerde hisse yerine endeksi tutmak */
  /** mixed: normalde endekste, sinyalde sermayenin bir kısmı hisselere; strat: yalnızca sinyaller (kalan nakit); rand*: aynı günlerde rastgele hisseler; bh: yalnız endeks */
  all: { mixed: Metrics; strat: Metrics; bh: Metrics; randMixed: Metrics; randStrat: Metrics }; pre: Strategy['all']; post: Strategy['all']
  /** Yıl, endeks + sinyal, yalnız endeks, yalnız sinyal (yıllık getiri) */
  years: [number, number, number, number][]
  /** Gün numarası, endeks + sinyal ve yalnız endeks birikimi (1 = başlangıç) */
  curve: [number, number, number][]
  trades: TradeStats; tradesPost: TradeStats
  variants: { hold: number; all: Metrics; post: Metrics }[]
}
export interface ExtremesFile { generated: number; split: number; markets: Record<string, MarketExtremes> }

export type Status = 'strong' | 'near' | 'alone' | 'stretched' | 'none'
export const breadthAt = (m: MarketExtremes, t: number): number | undefined => {
  const b = m.breadth; if (!b) return undefined
  const k = Math.floor(t / 86400) - b.d0
  for (let j = Math.min(k, b.v.length - 1); j >= Math.max(0, k - 5); j--) if (b.v[j] >= 0) return b.v[j] / 1000
  return undefined
}
/** Bir günün durumu: puan ve pazar genişliğine göre */
export function statusOf(m: MarketExtremes, s: number, br: number | undefined): Status {
  if (Number.isNaN(s)) return 'none'
  const panic = br != null && m.breadth && br >= m.breadth.q95, calm = br != null && m.breadth && br < m.breadth.q90
  if (!m.breadth) return s <= m.th.q02 ? 'near' : s <= m.th.q05 ? 'stretched' : 'none'
  if (s <= m.th.q01 && panic) return 'strong'
  if (s <= m.th.q02 && panic) return 'near'
  if (s <= m.th.q02 && calm) return 'alone'
  if (s <= m.th.q05) return 'stretched'
  return 'none'
}
/** Puanın pazar dağılımındaki yeri (yaklaşık yüzdelik): eşikler arasında doğrusal */
export function percentileOf(m: MarketExtremes, s: number): number {
  const pts: [number, number][] = [[m.th.q005, 0.005], [m.th.q01, 0.01], [m.th.q02, 0.02], [m.th.q05, 0.05]]
  if (s <= pts[0][0]) return 0.005
  for (let k = 1; k < pts.length; k++) if (s <= pts[k][0]) { const [a, pa] = pts[k - 1], [b, pb] = pts[k]; return pa + ((s - a) / (b - a)) * (pb - pa) }
  return 1
}
