/**
 * Tepe ve taban (dönüş) incelemesi.
 *   1. Tarihsel tepe ve tabanlar farklı hassasiyetlerde bulunur: aylık, 3 aylık, 6 aylık, 1 yıllık, 5 yıllık, tüm zamanlar.
 *      Taban: o günün en düşüğü, geriye doğru pencerenin ve ileriye doğru teyit süresinin en düşüğüdür.
 *   2. Her gün için göstergeler ve makro durum ölçülür (özellikler); tepe/taban bölgesindeki günlerin diğer günlerden
 *      neyle ayrıştığı pazar genelinde öğrenilir (lojistik model; research/pivots.research.ts → data/pivots.json).
 *   3. Model bugüne uygulanır: bugünün taban ya da tepe bölgesinde olma olasılığı ve hangi fiyatta eşiğin aşılacağı.
 * Hesap yalnızca o güne kadarki veriyi kullanır; tepe/taban etiketi ise sonradan (teyit süresi dolunca) belli olur.
 */
import type { OHLCV } from './study'

export type ScaleId = 'M' | 'Q' | 'H' | 'Y' | 'Y5' | 'ALL'
export type Side = 'low' | 'high'
export interface Scale { id: ScaleId; label: string; /** Geriye bakılan gün */ back: number; /** Teyit için ileride beklenen gün */ fwd: number; /** Bölge: dönüş gününün çevresindeki gün sayısı */ tol: number; /** En az geçmiş */ min: number }
export const SCALES: Scale[] = [
  { id: 'M', label: 'Aylık', back: 21, fwd: 21, tol: 2, min: 260 },
  { id: 'Q', label: '3 aylık', back: 63, fwd: 63, tol: 4, min: 260 },
  { id: 'H', label: '6 aylık', back: 126, fwd: 126, tol: 6, min: 260 },
  { id: 'Y', label: '1 yıllık', back: 252, fwd: 126, tol: 8, min: 300 },
  { id: 'Y5', label: '5 yıllık', back: 1260, fwd: 252, tol: 10, min: 1260 },
  { id: 'ALL', label: 'Tüm zamanlar', back: Infinity, fwd: 252, tol: 10, min: 1260 },
]
export const scaleOf = (id: string) => SCALES.find((s) => s.id === id) ?? SCALES[1]
export const SIDE_LABEL: Record<Side, string> = { low: 'taban', high: 'tepe' }

// ------------------------------------------------------------------ kayan pencere yardımcıları

/** [i−w+1 … i] aralığının en küçüğü (w sonsuzsa baştan beri) */
export function rollMin(a: ArrayLike<number>, w: number): Float64Array {
  const n = a.length, out = new Float64Array(n)
  if (!Number.isFinite(w)) { let m = Infinity; for (let i = 0; i < n; i++) { if (a[i] < m) m = a[i]; out[i] = m }; return out }
  const q = new Int32Array(n); let h = 0, t = 0
  for (let i = 0; i < n; i++) {
    while (t > h && a[q[t - 1]] >= a[i]) t--
    q[t++] = i
    if (q[h] <= i - w) h++
    out[i] = a[q[h]]
  }
  return out
}
export function rollMax(a: ArrayLike<number>, w: number): Float64Array {
  const n = a.length, neg = new Float64Array(n)
  for (let i = 0; i < n; i++) neg[i] = -a[i]
  const r = rollMin(neg, w)
  for (let i = 0; i < n; i++) r[i] = -r[i]
  return r
}
/** [i … i+w] aralığının en küçüğü */
function fwdMin(a: ArrayLike<number>, w: number): Float64Array {
  const n = a.length, rev = new Float64Array(n)
  for (let i = 0; i < n; i++) rev[i] = a[n - 1 - i]
  const r = rollMin(rev, w + 1), out = new Float64Array(n)
  for (let i = 0; i < n; i++) out[i] = r[n - 1 - i]
  return out
}
function sma(a: ArrayLike<number>, w: number): Float64Array {
  const n = a.length, out = new Float64Array(n).fill(NaN)
  let s = 0
  for (let i = 0; i < n; i++) { s += a[i]; if (i >= w) s -= a[i - w]; if (i >= w - 1) out[i] = s / w }
  return out
}
function rollSd(a: ArrayLike<number>, w: number, minW = w): Float64Array {
  const n = a.length, out = new Float64Array(n).fill(NaN)
  let s = 0, s2 = 0
  for (let i = 0; i < n; i++) {
    s += a[i]; s2 += a[i] * a[i]
    if (i >= w) { s -= a[i - w]; s2 -= a[i - w] * a[i - w] }
    const k = Math.min(i + 1, w)
    if (k >= minW) { const m = s / k; out[i] = Math.sqrt(Math.max(0, s2 / k - m * m)) }
  }
  return out
}
function rsi(c: ArrayLike<number>, p: number): Float64Array {
  const n = c.length, out = new Float64Array(n).fill(NaN)
  let g = 0, l = 0
  for (let i = 1; i < n; i++) {
    const d = c[i] - c[i - 1], up = d > 0 ? d : 0, dn = d < 0 ? -d : 0
    if (i <= p) { g += up / p; l += dn / p } else { g = (g * (p - 1) + up) / p; l = (l * (p - 1) + dn) / p }
    if (i >= p) out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l)
  }
  return out
}
function ema(a: ArrayLike<number>, p: number): Float64Array {
  const n = a.length, out = new Float64Array(n), k = 2 / (p + 1)
  for (let i = 0; i < n; i++) out[i] = i ? out[i - 1] + k * (a[i] - out[i - 1]) : a[0]
  return out
}

// ------------------------------------------------------------------ tepe ve tabanlar

export interface Pivots { /** Teyit süresi dolmuş dönüşler */ confirmed: number[]; /** Henüz teyit süresi dolmamış, şimdilik geçerli adaylar */ pending: number[] }
/** Verilen hassasiyette tepe (high) ya da taban (low) günleri */
export function pivots(b: OHLCV, sc: Scale, side: Side): Pivots {
  const n = b.t.length
  const ext = side === 'low' ? b.l : b.h.map((x) => -x)
  const prev = rollMin(ext, sc.back + 1), next = fwdMin(ext, sc.fwd)
  const confirmed: number[] = [], pending: number[] = []
  let last = -1e9
  for (let i = Math.min(sc.min, n); i < n; i++) {
    if (ext[i] > prev[i] || ext[i] > next[i]) continue
    if (i - last <= sc.tol) continue
    last = i
    if (i + sc.fwd < n) confirmed.push(i); else pending.push(i)
  }
  return { confirmed, pending }
}

// ------------------------------------------------------------------ özellikler

/** Makro ortam: pazar endeksi, VIX, dolar endeksi, ABD 10 yıllık faizi, (BIST için) Dolar/TL: günlük seriler */
/** lagIdx: endeks başka bir pazarınsa (kapanışı daha geç) bir gün gecikmeli kullanılır. VIX, dolar endeksi ve faiz hep bir gün gecikmelidir. */
export interface MacroSeries { idx?: OHLCV; vix?: OHLCV; dxy?: OHLCV; us10y?: OHLCV; fx?: OHLCV; lagIdx?: boolean }
export interface FeatureDef { id: string; label: string; group: 'fiyat' | 'gösterge' | 'hacim' | 'makro'; /** Değerin gösterimi */ fmt: (v: number) => string; /** Hassasiyete bağlı (pencereye göre hesaplanır) */ scaled?: boolean; /** Fiyat değişince değişir (tetik fiyatı aramasında) */ price?: boolean }
const num = (v: number, d = 0) => v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d })
const pctF = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + '%' + num(Math.abs(v) * 100, 0)
const sig = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + num(Math.abs(v), 1) + 'σ'
export const FEATURES: FeatureDef[] = [
  { id: 'rsi', label: 'RSI (14 gün)', group: 'gösterge', fmt: (v) => num(v), price: true },
  { id: 'rsiL', label: 'Uzun RSI (70 gün, haftalık RSI’a yakın)', group: 'gösterge', fmt: (v) => num(v), price: true },
  { id: 'bbz', label: 'Bollinger konumu (20 günlük ortalamadan sapma)', group: 'gösterge', fmt: sig, price: true },
  { id: 'd50', label: '50 günlük ortalamaya uzaklık', group: 'fiyat', fmt: pctF, price: true },
  { id: 'd200', label: '200 günlük ortalamaya uzaklık', group: 'fiyat', fmt: pctF, price: true },
  { id: 'r5', label: 'Son 5 günün hareketi (oynaklığa göre)', group: 'fiyat', fmt: sig, price: true },
  { id: 'r21', label: 'Son 1 ayın hareketi (oynaklığa göre)', group: 'fiyat', fmt: sig, price: true },
  { id: 'r63', label: 'Son 3 ayın hareketi (oynaklığa göre)', group: 'fiyat', fmt: sig, price: true },
  { id: 'nearLow', label: 'Pencerenin en düşüğüne uzaklık', group: 'fiyat', fmt: pctF, scaled: true, price: true },
  { id: 'nearHigh', label: 'Pencerenin en yükseğine uzaklık', group: 'fiyat', fmt: pctF, scaled: true, price: true },
  { id: 'volx', label: 'Oynaklık artışı (20 gün ÷ 250 gün)', group: 'gösterge', fmt: (v) => num(v, 1) + ' kat' },
  { id: 'rsiUp', label: 'RSI, son 40 günün en düşüğünden ne kadar yukarıda (pozitif uyumsuzluk)', group: 'gösterge', fmt: (v) => num(v) + ' puan', price: true },
  { id: 'rsiDn', label: 'RSI, son 40 günün en yükseğinden ne kadar aşağıda (negatif uyumsuzluk)', group: 'gösterge', fmt: (v) => num(v) + ' puan', price: true },
  { id: 'macd', label: 'MACD farkı (oynaklığa göre)', group: 'gösterge', fmt: sig, price: true },
  { id: 'macdT', label: 'MACD farkının 5 günlük değişimi', group: 'gösterge', fmt: sig, price: true },
  { id: 'wick', label: 'Son 3 günde alt fitil − üst fitil (dönüş mumu)', group: 'fiyat', fmt: (v) => num(v * 100) + ' puan' },
  { id: 'streak', label: 'Art arda düşüş (−) ya da yükseliş (+) günleri', group: 'fiyat', fmt: (v) => num(v) + ' gün', price: true },
  { id: 'rvol', label: 'Son 5 günün hacmi (olağan hacme göre)', group: 'hacim', fmt: (v) => num(Math.exp(v), 1) + ' kat' },
  { id: 'rvolMax', label: 'Son 5 günün en yüksek hacmi (olağan hacme göre)', group: 'hacim', fmt: (v) => num(Math.exp(v), 1) + ' kat' },
  { id: 'vix', label: 'VIX (korku endeksi)', group: 'makro', fmt: (v) => num(v) },
  { id: 'vixC', label: 'VIX’in 1 aylık değişimi', group: 'makro', fmt: pctF },
  { id: 'idx200', label: 'Pazar endeksinin 200 günlük ortalamasına uzaklığı', group: 'makro', fmt: pctF },
  { id: 'idxDd', label: 'Pazar endeksinin 1 yıllık zirvesine uzaklığı', group: 'makro', fmt: pctF },
  { id: 'idx21', label: 'Pazar endeksinin son 1 aylık hareketi', group: 'makro', fmt: pctF },
  { id: 'rel63', label: 'Son 3 ayda endekse göre fark', group: 'makro', fmt: pctF, price: true },
  { id: 'dxy63', label: 'Dolar endeksinin 3 aylık değişimi', group: 'makro', fmt: pctF },
  { id: 'y63', label: 'ABD 10 yıllık faizinin 3 aylık değişimi', group: 'makro', fmt: (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + num(Math.abs(v), 2) + ' puan' },
  { id: 'fx21', label: 'Dolar/TL’nin 1 aylık değişimi', group: 'makro', fmt: pctF },
]
export const FEATURE_INDEX = Object.fromEntries(FEATURES.map((f, i) => [f.id, i]))

/** Başka bir serinin (endeks, VIX…) değerlerini bu serinin günlerine hizalar: o güne kadarki son değer */
function align(t: number[], s: OHLCV | undefined, lag = 0): { c: Float64Array; ok: boolean } {
  const n = t.length, out = new Float64Array(n).fill(NaN)
  if (!s || !s.t.length) return { c: out, ok: false }
  let j = 0
  for (let i = 0; i < n; i++) {
    const day = Math.floor(t[i] / 86400) - lag
    while (j + 1 < s.t.length && Math.floor(s.t[j + 1] / 86400) <= day) j++
    if (Math.floor(s.t[j] / 86400) <= day) out[i] = j
  }
  return { c: out, ok: true }
}

export interface Base {
  b: OHLCV; n: number
  /** Günlük oynaklık (250 günlük log getiri sapması) */
  sd: Float64Array
  /** Hassasiyetten bağımsız özellikler: f[özellik][gün] (NaN: hesaplanamıyor) */
  f: Float64Array[]
}
/** Hassasiyetten bağımsız bütün özellikler; yalnızca o güne kadarki veri kullanılır */
export function baseFeatures(b: OHLCV, m: MacroSeries = {}): Base {
  const n = b.t.length, c = b.c
  const f = FEATURES.map(() => new Float64Array(n).fill(NaN))
  const set = (id: string) => f[FEATURE_INDEX[id]]
  const lr = new Float64Array(n)
  for (let i = 1; i < n; i++) lr[i] = Math.log(c[i] / c[i - 1])
  const sd = rollSd(lr, 250, 60), sd20 = rollSd(lr, 20)
  const r14 = rsi(c, 14), r70 = rsi(c, 70)
  const ma20 = sma(c, 20), ma50 = sma(c, 50), ma200 = sma(c, 200), dev20 = rollSd(c, 20)
  const e12 = ema(c, 12), e26 = ema(c, 26), line = new Float64Array(n)
  for (let i = 0; i < n; i++) line[i] = e12[i] - e26[i]
  const sigl = ema(line, 9)
  const rsiMin = rollMin(r14.map((x) => (Number.isNaN(x) ? 100 : x)), 40), rsiMax = rollMax(r14.map((x) => (Number.isNaN(x) ? 0 : x)), 40)
  const v = b.v, vavg = v ? sma(v, 50) : undefined, v5 = v ? sma(v, 5) : undefined, vmax5 = v ? rollMax(v, 5) : undefined
  const idx = align(b.t, m.idx, m.lagIdx ? 1 : 0), vix = align(b.t, m.vix, 1), dxy = align(b.t, m.dxy, 1), y10 = align(b.t, m.us10y, 1), fx = align(b.t, m.fx)
  const idxMa = m.idx ? sma(m.idx.c, 200) : undefined, idxHi = m.idx ? rollMax(m.idx.h, 252) : undefined
  const back = (s: OHLCV, j: number, k: number) => (j - k >= 0 ? s.c[j - k] : NaN)
  let streak = 0
  for (let i = 1; i < n; i++) {
    streak = c[i] > c[i - 1] ? (streak > 0 ? streak + 1 : 1) : c[i] < c[i - 1] ? (streak < 0 ? streak - 1 : -1) : 0
    const s = sd[i]
    if (!(s > 0)) continue
    set('rsi')[i] = r14[i]; set('rsiL')[i] = r70[i]
    set('bbz')[i] = dev20[i] > 0 ? (c[i] - ma20[i]) / dev20[i] : NaN
    set('d50')[i] = c[i] / ma50[i] - 1; set('d200')[i] = c[i] / ma200[i] - 1
    if (i >= 5) set('r5')[i] = Math.log(c[i] / c[i - 5]) / (s * Math.sqrt(5))
    if (i >= 21) set('r21')[i] = Math.log(c[i] / c[i - 21]) / (s * Math.sqrt(21))
    if (i >= 63) set('r63')[i] = Math.log(c[i] / c[i - 63]) / (s * Math.sqrt(63))
    set('volx')[i] = sd20[i] / s
    set('rsiUp')[i] = r14[i] - rsiMin[i]; set('rsiDn')[i] = rsiMax[i] - r14[i]
    const hist = line[i] - sigl[i]
    set('macd')[i] = hist / (c[i] * s); if (i >= 5) set('macdT')[i] = (hist - (line[i - 5] - sigl[i - 5])) / (c[i] * s)
    let w = 0
    for (let k = 0; k < 3 && i - k >= 0; k++) { const j = i - k, rng = b.h[j] - b.l[j]; if (rng > 0) w += ((Math.min(b.o[j], c[j]) - b.l[j]) - (b.h[j] - Math.max(b.o[j], c[j]))) / rng / 3 }
    set('wick')[i] = w
    set('streak')[i] = Math.max(-8, Math.min(8, streak))
    if (v && vavg && v5 && vmax5 && vavg[i] > 0) { set('rvol')[i] = Math.log(Math.max(0.05, v5[i] / vavg[i])); set('rvolMax')[i] = Math.log(Math.max(0.05, vmax5[i] / vavg[i])) }
    if (vix.ok && !Number.isNaN(vix.c[i])) { const j = vix.c[i]; set('vix')[i] = m.vix!.c[j]; set('vixC')[i] = m.vix!.c[j] / back(m.vix!, j, 21) - 1 }
    if (idx.ok && !Number.isNaN(idx.c[i]) && idxMa && idxHi) {
      const j = idx.c[i], x = m.idx!
      set('idx200')[i] = x.c[j] / idxMa[j] - 1; set('idxDd')[i] = x.c[j] / idxHi[j] - 1; set('idx21')[i] = x.c[j] / back(x, j, 21) - 1
      if (i >= 63) set('rel63')[i] = c[i] / c[i - 63] - x.c[j] / back(x, j, 63)
    }
    if (dxy.ok && !Number.isNaN(dxy.c[i])) set('dxy63')[i] = m.dxy!.c[dxy.c[i]] / back(m.dxy!, dxy.c[i], 63) - 1
    if (y10.ok && !Number.isNaN(y10.c[i])) set('y63')[i] = m.us10y!.c[y10.c[i]] - back(m.us10y!, y10.c[i], 63)
    if (fx.ok && !Number.isNaN(fx.c[i])) set('fx21')[i] = m.fx!.c[fx.c[i]] / back(m.fx!, fx.c[i], 21) - 1
  }
  return { b, n, sd, f }
}
/** Hassasiyete bağlı iki özellik: kapanışın pencere en düşüğüne ve en yükseğine uzaklığı (oran) */
export function scaledFeatures(x: Base, sc: Scale): { nearLow: Float64Array; nearHigh: Float64Array } {
  const lo = rollMin(x.b.l, sc.back + 1), hi = rollMax(x.b.h, sc.back + 1)
  const nearLow = new Float64Array(x.n), nearHigh = new Float64Array(x.n)
  for (let i = 0; i < x.n; i++) { nearLow[i] = x.b.c[i] / lo[i] - 1; nearHigh[i] = x.b.c[i] / hi[i] - 1 }
  return { nearLow, nearHigh }
}

// ------------------------------------------------------------------ bölge etiketi (öğrenme ve sınama için)

/**
 * Dönüş bölgesi: teyitli bir dönüş gününün ±tol günü içinde ve kapanışı dönüş fiyatına yakın (oynaklığa göre) günler.
 * Dönen dizi: 1 bölgede, 0 değil, −1 etiketlenemez (geçmiş yetersiz ya da teyit süresi henüz dolmadı).
 */
export function zoneLabels(x: Base, sc: Scale, side: Side, piv: Pivots = pivots(x.b, sc, side)): Int8Array {
  const n = x.n, y = new Int8Array(n)
  const lastOk = n - 1 - sc.fwd - sc.tol
  for (let i = 0; i < n; i++) if (i < sc.min || i > lastOk || !(x.sd[i] > 0)) y[i] = -1
  for (const p of piv.confirmed) {
    const ref = side === 'low' ? x.b.l[p] : x.b.h[p]
    const band = Math.max(0.02, x.sd[p] * Math.sqrt(sc.tol) * 1.5)
    for (let i = Math.max(0, p - sc.tol); i <= Math.min(n - 1, p + sc.tol); i++) {
      if (y[i] < 0) continue
      const d = side === 'low' ? x.b.c[i] / ref - 1 : 1 - x.b.c[i] / ref
      if (d <= band) y[i] = 1
    }
  }
  return y
}

// ------------------------------------------------------------------ model

/** Lojistik model: standartlaştırılmış özellikler (ortalama, sapma), ağırlıklar ve sabit */
export interface PivotModel {
  /** Kullanılan özellik kimlikleri (FEATURES sırasıyla aynı olmak zorunda değil) */
  ids: string[]; mu: number[]; sd: number[]; w: number[]; b: number
  /** Rastgele bir günün bölgede olma oranı (öğrenme dönemi) */
  base: number
}
const CLIP = 4
/** Bir günün özellik vektörü (model sırasıyla); eksik değer ortalama sayılır */
export function vectorOf(m: PivotModel, x: Base, near: { nearLow: Float64Array; nearHigh: Float64Array }, i: number, out = new Float64Array(m.ids.length)): Float64Array {
  for (let k = 0; k < m.ids.length; k++) {
    const id = m.ids[k]
    const raw = id === 'nearLow' ? near.nearLow[i] : id === 'nearHigh' ? near.nearHigh[i] : x.f[FEATURE_INDEX[id]][i]
    out[k] = Number.isNaN(raw) ? 0 : Math.max(-CLIP, Math.min(CLIP, (raw - m.mu[k]) / m.sd[k]))
  }
  return out
}
export const rawOf = (x: Base, near: { nearLow: Float64Array; nearHigh: Float64Array }, id: string, i: number) => (id === 'nearLow' ? near.nearLow[i] : id === 'nearHigh' ? near.nearHigh[i] : x.f[FEATURE_INDEX[id]][i])
export function probability(m: PivotModel, z: ArrayLike<number>): number {
  let s = m.b
  for (let k = 0; k < z.length; k++) s += m.w[k] * z[k]
  return 1 / (1 + Math.exp(-s))
}

// ------------------------------------------------------------------ bugüne uygulama

/** pivots.json içinde bir hassasiyet ve yön için saklananlar */
export interface TestMult { m: number; n: number; prec: number; recall: number; ret: number; up: number }
export interface PivotTest { days: number; base: number; pivots: number; mult: TestMult[]; ret: number; up: number }
export interface PivotEntry {
  model: PivotModel
  /** Pazardaki toplam dönüş sayısı ve iki dönüş arasındaki gün sayısı (çeyrekler) */
  pivots: number; gap: [number, number, number]
  /** Özellik → bölgedeki günlerde [alt çeyrek, ortanca, üst çeyrek] ve tüm günlerde ortanca */
  feats: Record<string, [number, number, number, number]>
  /** Geriye dönük sınama (modelin görmediği dönem); örnek yetmediyse yok */
  test?: PivotTest
}
/** Aday sayılma eşikleri: olasılığın rastgele bir günün kaç katı olduğu */
export const LEVELS = { candidate: 5, hint: 2 }
export type Level = 'candidate' | 'hint' | 'none'
export interface Factor { id: string; label: string; group: FeatureDef['group']; now: string; typical: string; usual: string; /** Olasılığa katkı (log-odds); pozitif: lehine */ contrib: number }
export interface Assessment {
  side: Side; p: number; base: number; ratio: number; level: Level
  /** Sınama sonucu güvenilir mi (yeterli örnek ve rastgeleden belirgin iyi) */
  tested: boolean
  factors: Factor[]
  /** Aday düzeyine ulaşılacak fiyat (bugün o fiyattan kapansaydı) ve bugüne göre değişim; zaten adaysa ya da bulunamadıysa yok */
  trigger?: { price: number; change: number }
  /** Bu varlığın kendi geçmişi: teyitli dönüş sayısı, son dönüşün günü, bugüne kadar geçen gün, bekleyen (teyitsiz) aday */
  own: { count: number; last?: number; since?: number; pending?: number; gap?: number }
}
const levelOf = (ratio: number): Level => (ratio >= LEVELS.candidate ? 'candidate' : ratio >= LEVELS.hint ? 'hint' : 'none')
/** Sınama anlamlı mı: aday eşiğinde en az 200 gün ve isabet rastgelenin en az 2 katı */
export const testedOk = (t?: PivotTest) => { const m = t?.mult.find((x) => x.m === LEVELS.candidate); return !!t && !!m && m.n >= 200 && m.prec >= 2 * t.base }

function probAt(e: PivotEntry, b: OHLCV, macro: MacroSeries, sc: Scale): { p: number; x: Base; near: ReturnType<typeof scaledFeatures>; z: Float64Array } {
  const x = baseFeatures(b, macro), near = scaledFeatures(x, sc)
  const z = vectorOf(e.model, x, near, x.n - 1)
  return { p: probability(e.model, z), x, near, z }
}
/** Bugünün (son mumun) verilen hassasiyette taban ya da tepe bölgesinde olma olasılığı ve gerekçesi */
export function assess(b: OHLCV, macro: MacroSeries, sc: Scale, side: Side, e: PivotEntry): Assessment {
  const { p, x, near, z } = probAt(e, b, macro, sc)
  const m = e.model, i = x.n - 1, ratio = p / m.base, level = levelOf(ratio)
  const factors: Factor[] = m.ids.map((id, k) => {
    const def = FEATURES[FEATURE_INDEX[id]], raw = rawOf(x, near, id, i), q = e.feats[id]
    return { id, label: def.label, group: def.group, now: Number.isNaN(raw) ? 'veri yok' : def.fmt(raw), typical: q && !Number.isNaN(q[0]) ? `${def.fmt(q[0])} … ${def.fmt(q[2])}` : '—', usual: q && !Number.isNaN(q[3]) ? def.fmt(q[3]) : '—', contrib: m.w[k] * z[k] }
  }).sort((a, c) => Math.abs(c.contrib) - Math.abs(a.contrib))
  // Tetik fiyatı: bugün hangi fiyattan kapansaydı aday düzeyine ulaşılırdı (makro girdiler aynı)
  let trigger: Assessment['trigger']
  if (level !== 'candidate') {
    const c0 = b.c[i]
    for (let step = 1; step <= 60; step++) {
      const P = side === 'low' ? c0 * Math.exp(-0.01 * step * 1.5) : c0 * Math.exp(0.01 * step * 1.5)
      const bb: OHLCV = { ...b, c: [...b.c.slice(0, i), P], l: [...b.l.slice(0, i), Math.min(b.l[i], P)], h: [...b.h.slice(0, i), Math.max(b.h[i], P)] }
      if (probAt(e, bb, macro, sc).p / m.base >= LEVELS.candidate) { trigger = { price: P, change: P / c0 - 1 }; break }
    }
  }
  const piv = pivots(b, sc, side)
  const all = [...piv.confirmed, ...piv.pending]
  const gaps = piv.confirmed.slice(1).map((v, k) => v - piv.confirmed[k]).sort((a, c) => a - c)
  return {
    side, p, base: m.base, ratio, level, tested: testedOk(e.test), factors, trigger,
    own: { count: piv.confirmed.length, last: all.length ? all[all.length - 1] : undefined, since: all.length ? i - all[all.length - 1] : undefined, pending: piv.pending.length ? piv.pending[piv.pending.length - 1] : undefined, gap: gaps.length ? gaps[gaps.length >> 1] : undefined },
  }
}
