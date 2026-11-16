/**
 * Hisse analizi: tarihsel teyitli dip ve tepe sinyalleri.
 *
 * Soru: "Bu hissede RSI şu eşiğin altına (üstüne) her indiğinde (çıktığında) sonra ne olmuş?"
 * Her zaman dilimi (haftalık, günlük, 4 saatlik, saatlik) ve eşik için geçmişteki sinyaller bulunur,
 * sonraki getiriler hissenin herhangi bir andaki olağan getirisiyle karşılaştırılır. Yalnızca olağandan
 * belirgin biçimde iyi ve yeterince tekrar etmiş sinyaller "teyitli" sayılır.
 *
 * Sinyal: RSI eşiği geçtiği ilk çubuk. Aynı düşüşün içinde tekrar saymamak için, RSI eşiğin 10 puan
 * ötesine dönmeden yeni sinyal sayılmaz.
 */
export type Timeframe = 'W' | 'D' | 'H4' | 'H1'
export type Side = 'dip' | 'top'
export interface Bars { t: number[]; c: number[]; /** Hacim (yalnızca günlük veride) */ v?: number[] }

export const TIMEFRAMES: { id: Timeframe; label: string; adj: string }[] = [
  { id: 'W', label: 'Haftalık', adj: 'haftalık' },
  { id: 'D', label: 'Günlük', adj: 'günlük' },
  { id: 'H4', label: '4 saatlik', adj: '4 saatlik' },
  { id: 'H1', label: 'Saatlik', adj: 'saatlik' },
]
/** Sonrası kaç çubuk ölçülür: kısa, orta (asıl ölçüt), uzun */
export const HORIZONS: Record<Timeframe, [number, number, number]> = { W: [4, 13, 26], D: [5, 21, 63], H4: [6, 20, 60], H1: [7, 35, 140] }

/**
 * Göstergeler (hepsi kapanıştan):
 *   rsi   RSI (14)
 *   bb    Bollinger: kapanışın 20 çubukluk ortalamadan kaç standart sapma uzakta olduğu (−2 = alt bant)
 *   d200  Fiyatın 200 çubukluk ortalamaya uzaklığı (oran; −0,1 = %10 altında)
 *   macd  MACD (12, 26, 9) histogramı ÷ fiyat; sıfırı kesmesi MACD'nin sinyal çizgisini kesmesidir
 *   dd    Son 250 çubuğun en yüksek kapanışına uzaklık (oran; −0,25 = zirvesinden %25 aşağıda)
 *   roc   Son 5 çubuğun getirisi, hissenin kendi oynaklığına göre (kaç standart sapma; −2 = olağandışı sert düşüş)
 */
export type Indicator = 'rsi' | 'bb' | 'd200' | 'macd' | 'dd' | 'roc'
export interface Trigger { id: string; ind: Indicator; side: Side; level: number; dir: 'below' | 'above'; rearm: number }
const trig = (ind: Indicator, side: Side, level: number, dir: Trigger['dir'], rearm: number): Trigger => ({ id: `${ind}:${side}:${level}`, ind, side, level, dir, rearm })
export const TRIGGERS: Trigger[] = [
  ...[20, 25, 30, 35, 40].map((l) => trig('rsi', 'dip', l, 'below', 10)),
  ...[-2, -2.5].map((l) => trig('bb', 'dip', l, 'below', 1)),
  ...[-0.1, -0.2, -0.3].map((l) => trig('d200', 'dip', l, 'below', 0.05)),
  trig('macd', 'dip', 0, 'above', 0), // MACD sıfırın altındayken sinyal çizgisini yukarı keser
  ...[-0.15, -0.25, -0.35].map((l) => trig('dd', 'dip', l, 'below', 0.07)),
  ...[-2, -3].map((l) => trig('roc', 'dip', l, 'below', 1.5)),
  ...[60, 65, 70, 75, 80].map((l) => trig('rsi', 'top', l, 'above', 10)),
  ...[2, 2.5].map((l) => trig('bb', 'top', l, 'above', 1)),
  ...[0.15, 0.3, 0.5].map((l) => trig('d200', 'top', l, 'above', 0.05)),
  trig('macd', 'top', 0, 'below', 0), // MACD sıfırın üstündeyken sinyal çizgisini aşağı keser
  ...[2, 3].map((l) => trig('roc', 'top', l, 'above', 1.5)),
]
/** Bağlam: sinyal yalnızca bu durumdayken sayılır; olağan sonuç da aynı durumdaki çubuklardan hesaplanır. */
export type FilterId = 'any' | 'above200' | 'below200' | 'up' | 'down'
export const FILTERS: FilterId[] = ['any', 'above200', 'below200', 'up', 'down']
export const FILTER_LABEL: Record<FilterId, string> = {
  any: '', above200: 'fiyat 200 ortalamanın üstündeyken', below200: 'fiyat 200 ortalamanın altındayken',
  up: '50 ortalama 200’ün üstündeyken', down: '50 ortalama 200’ün altındayken',
}
const num = (v: number, d: number) => v.toFixed(d).replace('.', ',').replace(/,0+$/, '').replace('-', '−')
export function triggerLabel(t: Trigger): string {
  if (t.ind === 'rsi') return `RSI ${t.dir === 'below' ? '≤' : '≥'} ${t.level}`
  if (t.ind === 'bb') return Math.abs(t.level) === 2 ? `Bollinger ${t.side === 'dip' ? 'alt' : 'üst'} bandı` : `Bollinger ${t.side === 'dip' ? 'alt' : 'üst'} bandının ötesi (${num(t.level, 1)}σ)`
  if (t.ind === 'd200') return `200 ortalamanın %${num(Math.abs(t.level) * 100, 0)} ${t.level < 0 ? 'altı' : 'üstü'}`
  if (t.ind === 'dd') return `Zirvesinden %${num(Math.abs(t.level) * 100, 0)} geriledi`
  if (t.ind === 'roc') return `Sert ${t.side === 'dip' ? 'düşüş' : 'yükseliş'} (5 çubukta ${num(Math.abs(t.level), 0)}σ)`
  return t.side === 'dip' ? 'MACD sıfırın altında yukarı kesti' : 'MACD sıfırın üstünde aşağı kesti'
}
export const INDICATOR_LABEL: Record<Indicator, string> = { rsi: 'RSI', bb: 'Bollinger', d200: '200 ortalamaya uzaklık', macd: 'MACD', dd: 'Zirveye uzaklık', roc: '5 çubukluk hareket' }
/** Kaç kural sınanıyor (her zaman diliminde) */
export const RULES_PER_FRAME = TRIGGERS.length * FILTERS.length - TRIGGERS.filter((t) => t.ind === 'd200').length * 2
const REARM = 10
const PERIOD = 14

/** Wilder RSI; ilk [period] çubukta NaN. Ortalama kazanç ve kayıp da döner (tetik fiyatı için). */
export function rsiSeries(c: number[], period = PERIOD): { rsi: number[]; gain: number; loss: number } {
  const rsi = new Array<number>(c.length).fill(NaN)
  if (c.length <= period) return { rsi, gain: NaN, loss: NaN }
  let g = 0, l = 0
  for (let i = 1; i <= period; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d }
  g /= period; l /= period
  rsi[period] = l === 0 ? 100 : 100 - 100 / (1 + g / l)
  for (let i = period + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1]
    g = (g * (period - 1) + Math.max(d, 0)) / period
    l = (l * (period - 1) + Math.max(-d, 0)) / period
    rsi[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l)
  }
  return { rsi, gain: g, loss: l }
}

/**
 * Bir sonraki çubukta RSI'ın [level]'e gelmesi için gereken kapanış. Dip için fiyatın inmesi, tepe için
 * çıkması gerekir; RSI zaten eşiğin ötesindeyse undefined.
 */
export function triggerPrice(close: number, gain: number, loss: number, level: number, side: Side, period = PERIOD): number | undefined {
  if (!Number.isFinite(gain) || !Number.isFinite(loss)) return undefined
  const k = level / (100 - level) // hedef kazanç/kayıp oranı
  const n = period - 1
  if (side === 'dip') {
    const drop = (period * (gain * n / period)) / k - n * loss // g' = g·n/p sabit; l' = g'/k
    return drop > 0 ? Math.max(0, close - drop) : undefined
  }
  const rise = n * (k * loss - gain) // l' = l·n/p sabit; g' = k·l'
  return rise > 0 ? close + rise : undefined
}

export interface SignalEvent { i: number; t: number; price: number; rsi: number; ret: (number | undefined)[]; worst?: number; best?: number }

export interface HorizonStat {
  bars: number
  /** Sonucu belli olan sinyal sayısı */
  n: number
  /** Beklenen yönde sonuçlananların oranı (dipte yükselen, tepede düşen) */
  hit?: number
  median?: number
  mean?: number
  /** Hissenin herhangi bir çubuktan sonraki olağan sonucu (aynı süre) */
  baseHit?: number
  baseMedian?: number
}

export type Verdict = 'confirmed' | 'promising' | 'none' | 'thin'
export const VERDICT_LABEL: Record<Verdict, string> = { confirmed: 'Teyitli', promising: 'Zayıf kanıt', none: 'Teyit yok', thin: 'Yetersiz örnek' }

export interface SignalStat {
  tf: Timeframe
  side: Side
  level: number
  trigger: Trigger
  filter: FilterId
  /** Bağlam koşulu şu an sağlanıyor mu */
  filterNow: boolean
  events: SignalEvent[]
  horizons: HorizonStat[]
  /** Asıl ölçüt: orta süre */
  main: HorizonStat
  verdict: Verdict
  /** Sıralama puanı: kanıtın gücü (p değerlerinden) */
  score: number
  /** Rastgele giriş testi: tüm geçmiş, keşif dönemi (ilk %60) ve doğrulama dönemi (son %40) */
  test: { all: Evidence; discovery: Evidence; confirm: Evidence; cutTime: number }
  /** Teyidin dört şartı */
  checks: { stock: boolean; periods: boolean; depth: boolean; universe: boolean }
  /** Sınanan geçmişin uzunluğu (yıl) */
  years: number
  universe?: UniverseRule
  /** Sinyalden sonra, sonuç ölçülene kadar fiyatın en çok ters ve lehe gittiği nokta (ortanca) */
  adverse?: number
  favorable?: number
  /** Keşif ve doğrulama dönemlerinin ikisinde de olağandan iyi mi */
  stable: boolean
  /** İlk ve son sinyal arasındaki takvim süresi (saniye) */
  span: number
  /** Şu an: RSI eşiğin ötesinde mi, son sinyalden beri kaç çubuk ve getiri */
  active: boolean
  sinceBars?: number
  sinceReturn?: number
}

const median = (v: number[]) => { if (!v.length) return undefined; const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined)

/** İsabet oranı için Wilson güven aralığının alt sınırı (z = 1,645 ≈ %95 tek yönlü): az örnekte temkinli. */
export function wilsonLower(hits: number, n: number, z = 1.645): number {
  if (!n) return 0
  const p = hits / n, z2 = z * z
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / (1 + z2 / n)
}

/** Eşiği geçiş anları: değer eşikten [rearm] kadar uzaklaşmadan aynı hareket yeniden sayılmaz. */
export function crossings(v: number[], level: number, dir: 'below' | 'above', rearm: number, ok?: (i: number) => boolean): number[] {
  const out: number[] = []
  let armed = true
  for (let i = 1; i < v.length; i++) {
    const r = v[i], p = v[i - 1]
    if (Number.isNaN(r) || Number.isNaN(p)) continue
    if (dir === 'below') {
      if (armed && r <= level && p > level) { if (!ok || ok(i)) out.push(i); armed = false } else if (r >= level + rearm) armed = true
    } else if (armed && r >= level && p < level) { if (!ok || ok(i)) out.push(i); armed = false } else if (r <= level - rearm) armed = true
  }
  return out
}
export const findEvents = (rsi: number[], level: number, side: Side) => crossings(rsi, level, side === 'dip' ? 'below' : 'above', REARM)

// ------------------------------------------------------------------ göstergeler

export interface Series {
  rsi: number[]; bb: number[]; d200: number[]; macd: number[]; dd: number[]; roc: number[]
  /** MACD çizgisi (işareti için) */
  macdLine: number[]
  sma50: number[]; sma200: number[]
  /** Bir sonraki çubuğun değerini hesaplamak için son durum */
  gain: number; loss: number; e12: number; e26: number; sig: number
}

function sma(c: number[], n: number): number[] {
  const out = new Array<number>(c.length).fill(NaN)
  let sum = 0
  for (let i = 0; i < c.length; i++) { sum += c[i]; if (i >= n) sum -= c[i - n]; if (i >= n - 1) out[i] = sum / n }
  return out
}
const zOf = (w: number[]) => { const m = w.reduce((a, b) => a + b, 0) / w.length; const sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / w.length); return sd > 0 ? (w[w.length - 1] - m) / sd : NaN }

export function indicators(c: number[]): Series {
  const { rsi, gain, loss } = rsiSeries(c)
  const n = c.length
  const bb = new Array<number>(n).fill(NaN)
  for (let i = 19; i < n; i++) bb[i] = zOf(c.slice(i - 19, i + 1))
  const sma50 = sma(c, 50), sma200 = sma(c, 200)
  const d200 = c.map((x, i) => x / sma200[i] - 1)
  const macd = new Array<number>(n).fill(NaN), macdLine = new Array<number>(n).fill(NaN)
  let e12 = c[0], e26 = c[0], sig = 0
  for (let i = 1; i < n; i++) {
    e12 += (c[i] - e12) * (2 / 13); e26 += (c[i] - e26) * (2 / 27)
    const m = e12 - e26
    sig += (m - sig) * (2 / 10)
    if (i >= 60) { macd[i] = (m - sig) / c[i]; macdLine[i] = m } // ortalamalar oturana kadar bekle
  }
  // Zirveye uzaklık: son 250 çubuğun en yüksek kapanışı (en az 60 çubuk geçmiş)
  const dd = new Array<number>(n).fill(NaN)
  for (let i = 60; i < n; i++) { let m = 0; for (let j = Math.max(0, i - DD_WINDOW + 1); j <= i; j++) if (c[j] > m) m = c[j]; dd[i] = c[i] / m - 1 }
  // 5 çubukluk hareket ÷ önceki 100 çubuğun oynaklığı
  const roc = new Array<number>(n).fill(NaN)
  for (let i = ROC_VOL + ROC_BARS; i < n; i++) roc[i] = Math.log(c[i] / c[i - ROC_BARS]) / (volBefore(c, i) * Math.sqrt(ROC_BARS))
  return { rsi, bb, d200, macd, dd, roc, macdLine, sma50, sma200, gain, loss, e12, e26, sig }
}
const DD_WINDOW = 250, ROC_BARS = 5, ROC_VOL = 100
/** [i] çubuğundan önceki 100 tek çubukluk getirinin standart sapması ([i] dahil değil) */
function volBefore(c: number[], i: number): number {
  let sum = 0, sq = 0
  for (let j = i - ROC_VOL; j < i; j++) { const r = Math.log(c[j] / c[j - 1]); sum += r; sq += r * r }
  const m = sum / ROC_VOL
  return Math.sqrt(Math.max(1e-12, sq / ROC_VOL - m * m))
}

/** Bir sonraki çubuk [x] kapanırsa göstergenin alacağı değer */
export function nextValue(c: number[], s: Series, ind: Indicator, x: number): number {
  const last = c[c.length - 1]
  if (ind === 'rsi') {
    const d = x - last
    const g = (s.gain * 13 + Math.max(d, 0)) / 14, l = (s.loss * 13 + Math.max(-d, 0)) / 14
    return l === 0 ? 100 : 100 - 100 / (1 + g / l)
  }
  if (ind === 'bb') return c.length < 19 ? NaN : zOf([...c.slice(-19), x])
  if (ind === 'd200') { if (c.length < 199) return NaN; let sum = x; for (let i = c.length - 199; i < c.length; i++) sum += c[i]; return x / (sum / 200) - 1 }
  if (ind === 'dd') { let m = x; for (let j = Math.max(0, c.length - DD_WINDOW + 1); j < c.length; j++) if (c[j] > m) m = c[j]; return x / m - 1 }
  if (ind === 'roc') return c.length < ROC_VOL + ROC_BARS ? NaN : Math.log(x / c[c.length - ROC_BARS]) / (volBefore(c, c.length) * Math.sqrt(ROC_BARS))
  const e12 = s.e12 + (x - s.e12) * (2 / 13), e26 = s.e26 + (x - s.e26) * (2 / 27)
  const m = e12 - e26
  return (m - (s.sig + (m - s.sig) * (2 / 10))) / x
}

/**
 * Sinyalin gelmesi için bir sonraki çubuğun kapanması gereken fiyat (ikiye bölerek arama; göstergelerin hepsi
 * kapanışla birlikte artar). Tek çubukta ulaşılamıyorsa ya da koşul zaten sağlanıyorsa undefined.
 */
export function triggerClose(c: number[], s: Series, t: Trigger): number | undefined {
  const last = c[c.length - 1]
  let lo = last * 0.2, hi = last * 5
  const f = (x: number) => nextValue(c, s, t.ind, x) - t.level
  if (!(f(lo) < 0 && f(hi) > 0)) return undefined
  for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (f(mid) < 0) lo = mid; else hi = mid }
  const x = (lo + hi) / 2
  if (t.dir === 'below' ? x >= last : x <= last) return undefined
  if (t.ind === 'macd') {
    // Kesişim ancak MACD doğru taraftayken sayılır
    const m = s.e12 + (x - s.e12) * (2 / 13) - (s.e26 + (x - s.e26) * (2 / 27))
    if (t.side === 'dip' ? m >= 0 : m <= 0) return undefined
  }
  return x
}

/** Bağlam koşulu [i] çubuğunda sağlanıyor mu (ortalama henüz yoksa hayır) */
export function filterHolds(f: FilterId, c: number[], s: Series, i: number): boolean {
  if (f === 'any') return true
  const m200 = s.sma200[i]
  if (Number.isNaN(m200)) return false
  if (f === 'above200') return c[i] > m200
  if (f === 'below200') return c[i] <= m200
  return f === 'up' ? s.sma50[i] > m200 : s.sma50[i] <= m200
}

// ------------------------------------------------------------------ teyit

/** Tekrarlanabilir rastgele sayı (aynı veri aynı sonucu versin) */
function rng(seed: number) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }; return h >>> 0 }

/**
 * Bağlam havuzu: bağlamı sağlayan ve sonucu belli olan her çubuk, [h] çubuk sonraki getirisi ve bu getirinin
 * havuz içindeki sırası (0 = en kötü, 1 = en iyi). Sinyaller bu havuzdan rastgele seçilmiş çubuklarla kıyaslanır.
 */
interface Pool { idx: number[]; ret: number[]; rank: number[]; up: number; median?: number; pos: Map<number, number> }
type PoolCache = Map<string, Pool>
function pool(c: number[], s: Series, f: FilterId, h: number, from: number, to: number, cache: PoolCache): Pool {
  const key = `${f}:${h}:${from}:${to}`
  let p = cache.get(key)
  if (!p) {
    const idx: number[] = [], ret: number[] = []
    for (let j = Math.max(PERIOD, from); j < to && j + h < c.length; j++) if (filterHolds(f, c, s, j)) { idx.push(j); ret.push(c[j + h] / c[j] - 1) }
    const order = ret.map((_, k) => k).sort((a, b) => ret[a] - ret[b])
    const rank = new Array<number>(ret.length)
    order.forEach((k, r) => { rank[k] = ret.length > 1 ? r / (ret.length - 1) : 0.5 })
    p = { idx, ret, rank, up: ret.filter((r) => r > 0).length, median: median(ret), pos: new Map(idx.map((j, k) => [j, k])) }
    cache.set(key, p)
  }
  return p
}

export interface Evidence {
  /** Sonucu belli sinyal sayısı */
  n: number
  hit?: number
  baseHit?: number
  /**
   * Rastgele giriş testi: aynı bağlamdan, aynı sayıda ve aynı aralıkla rastgele seçilmiş çubuklar bu sinyaller
   * kadar iyi sonuç verir miydi? p, verenlerin oranıdır (küçük = şansla açıklamak zor).
   */
  p?: number
}

/**
 * Rastgele giriş testi (sıra tabanlı permütasyon). İstatistik: sinyal çubuklarının getiri sırasının ortalaması
 * (uç değerlere dayanıklı). Rastgele örnekler de birbirine en az [gap] çubuk uzak seçilir; böylece art arda
 * günlerin birbirine benzemesi sonucu olduğundan iyi göstermez.
 */
function randomEntry(p: Pool, events: number[], sign: number, gap: number, seed: number): Evidence {
  const ks = events.map((i) => p.pos.get(i)).filter((k): k is number => k != null)
  const n = ks.length
  const baseHit = p.idx.length ? (sign > 0 ? p.up : p.idx.length - p.up) / p.idx.length : undefined
  if (!n) return { n, baseHit }
  const score = (k: number) => (sign > 0 ? p.rank[k] : 1 - p.rank[k])
  const obs = ks.reduce((a, k) => a + score(k), 0) / n
  const hit = ks.filter((k) => p.ret[k] * sign > 0).length / n
  if (n < 4 || p.idx.length < n * 4) return { n, hit, baseHit }
  const rand = rng(seed)
  const draw = () => {
    const chosen: number[] = []
    let sum = 0, tries = 0
    while (chosen.length < n && tries < n * 30) {
      tries++
      const k = Math.floor(rand() * p.idx.length)
      const j = p.idx[k]
      if (chosen.some((x) => Math.abs(x - j) < gap)) continue
      chosen.push(j); sum += score(k)
    }
    return sum / Math.max(1, chosen.length)
  }
  // Önce kaba tur; umut varsa p değerini inceltmek için uzun tur
  let ge = 0, sims = 0
  const run = (count: number) => { for (let i = 0; i < count; i++) { if (draw() >= obs - 1e-12) ge++; sims++ } }
  run(200)
  if (ge / sims <= 0.15) run(800)
  if (ge / sims <= 0.02) run(2000)
  return { n, hit, baseHit, p: (ge + 1) / (sims + 1) }
}

/** Keşif dönemi: geçmişin ilk %60'ı. Kalan %40 doğrulama dönemidir. */
export const DISCOVERY_SHARE = 0.6
/**
 * Teyit şartları (research/method.research.ts ile seçildi; sonuçlar README'de):
 *   hisse kanıtı   en az 8 bağımsız sinyal, %60 isabet, rastgele giriş testi p ≤ 0,05
 *   iki dönem      keşif ve doğrulama dönemlerinin ikisinde de olağandan iyi
 *   veri derinliği sınanan geçmiş en az 3 yıl (kısa geçmişteki sinyaller sonraki dönemde tutmadı)
 *   evren kanıtı   aynı kural, aynı pazardaki hisselerin toplamında da olağandan iyi: isabet en az 3 puan fazla,
 *                  z ≥ 4, en az 100 hisse. (Araştırma 170 hisselik örnekte z ≥ 2 ile yapıldı; tüm evrende örnek
 *                  yaklaşık 4 kat, z yaklaşık 2 kat büyür.)
 */
export const CONFIRM = { n: 8, p: 0.05, hit: 0.6, years: 3, z: 4, diff: 0.03, stocks: 100 }
export const PROMISING = { n: 6, p: 0.05 }

/** Bir kuralın pazardaki tüm hisselerde birleşik sonucu (rules.json) */
export interface UniverseRule { n: number; stocks: number; /** isabet − olağan isabet (oran) */ diff: number; z: number }
export type Universe = Record<string, UniverseRule>
export const ruleKey = (tf: Timeframe, trigger: Trigger, filter: FilterId) => `${tf}|${trigger.id}|${filter}`
/** Sembolün evreni: BIST hisseleri TR, ABD borsaları US; diğerlerinde (kur, endeks, maden) evren kanıtı yoktur */
export const marketOf = (symbol: string): 'TR' | 'US' | undefined => (/^BIST:/i.test(symbol) ? 'TR' : /^(NASDAQ|NYSE|AMEX):/i.test(symbol) ? 'US' : undefined)
export interface StatOptions { universe?: Universe; /** Rastgele giriş testlerini atla (evren hesabı için) */ light?: boolean }

export function signalStat(bars: Bars, s: Series, tf: Timeframe, trigger: Trigger, filter: FilterId = 'any', cache: PoolCache = new Map(), opts: StatOptions = {}): SignalStat {
  const { c, t } = bars
  const hs = HORIZONS[tf]
  const { side, level } = trigger
  const sign = side === 'dip' ? 1 : -1
  const v = s[trigger.ind]
  const ok = (i: number) => filterHolds(filter, c, s, i) && (trigger.ind !== 'macd' || (side === 'dip' ? s.macdLine[i] < 0 : s.macdLine[i] > 0))
  // Bağımsız sinyaller: bir sinyalin sonucu ölçülürken gelen yenisi sayılmaz (aynı hareketi iki kez saymamak için)
  const idx: number[] = []
  for (const i of crossings(v, level, trigger.dir, trigger.rearm, ok)) if (!idx.length || i - idx[idx.length - 1] >= hs[1]) idx.push(i)
  const events: SignalEvent[] = idx.map((i) => {
    const ret = hs.map((h) => (i + h < c.length ? c[i + h] / c[i] - 1 : undefined))
    // Orta süre içinde en kötü ve en iyi nokta (sinyalden sonra ne kadar daha gitti)
    let worst: number | undefined, best: number | undefined
    for (let j = i + 1; j <= Math.min(c.length - 1, i + hs[1]); j++) { const r = c[j] / c[i] - 1; worst = Math.min(worst ?? r, r); best = Math.max(best ?? r, r) }
    return { i, t: t[i], price: c[i], rsi: s.rsi[i], ret, worst, best }
  })
  const n = c.length - 1
  const horizons: HorizonStat[] = hs.map((h, k) => {
    const rets = events.map((e) => e.ret[k]).filter((x): x is number => x != null)
    const b = pool(c, s, filter, h, 0, c.length, cache)
    return {
      bars: h, n: rets.length,
      hit: rets.length ? rets.filter((r) => r * sign > 0).length / rets.length : undefined,
      median: median(rets), mean: mean(rets),
      baseHit: b.idx.length ? (sign > 0 ? b.up : b.idx.length - b.up) / b.idx.length : undefined,
      baseMedian: b.median,
    }
  })
  const main = horizons[1]
  const h = hs[1]
  const seed = hash(`${tf}:${trigger.id}:${filter}:${c.length}`)
  // Keşif ve doğrulama: kuralın bulunduğu dönem ile görmediği dönem ayrı ayrı sınanır; her dönemin olağanı kendi içinden
  const first = v.findIndex((x) => !Number.isNaN(x))
  const cut = Math.round((first < 0 ? 0 : first) + (c.length - Math.max(0, first)) * DISCOVERY_SHARE)
  const skip: Evidence = { n: 0 }
  const all = opts.light ? skip : randomEntry(pool(c, s, filter, h, 0, c.length, cache), idx, sign, h, seed)
  const discovery = opts.light ? skip : randomEntry(pool(c, s, filter, h, 0, cut, cache), idx.filter((i) => i < cut), sign, h, seed + 1)
  const confirm = opts.light ? skip : randomEntry(pool(c, s, filter, h, cut, c.length, cache), idx.filter((i) => i >= cut), sign, h, seed + 2)
  const excess = main.median != null && main.baseMedian != null ? (main.median - main.baseMedian) * sign : undefined
  const better = (e: Evidence) => e.hit != null && e.baseHit != null && e.hit > e.baseHit
  const good = (main.hit ?? 0) >= CONFIRM.hit && (excess ?? -1) > 0
  const years = first < 0 ? 0 : (t[n] - t[first]) / (365.25 * 86400)
  const universe = opts.universe?.[ruleKey(tf, trigger, filter)]
  // Dört ayrı kanıt; teyit için hepsi gerekir
  const checks = {
    stock: good && main.n >= CONFIRM.n && (all.p ?? 1) <= CONFIRM.p,
    periods: better(discovery) && better(confirm),
    depth: years >= CONFIRM.years,
    universe: !!universe && universe.z >= CONFIRM.z && universe.diff >= CONFIRM.diff && universe.stocks >= CONFIRM.stocks,
  }
  const verdict: Verdict = main.n < 4 ? 'thin'
    : checks.stock && checks.periods && checks.depth && checks.universe ? 'confirmed'
      : good && main.n >= PROMISING.n && (all.p ?? 1) <= PROMISING.p && better(discovery) && (confirm.n === 0 || better(confirm)) ? 'promising' : 'none'
  // Risk: sinyalden sonra en çok ne kadar ters, ne kadar lehe gitti (ortanca)
  const against = events.map((e) => (side === 'dip' ? e.worst : e.best)).filter((x): x is number => x != null)
  const favor = events.map((e) => (side === 'dip' ? e.best : e.worst)).filter((x): x is number => x != null)
  const now = v[n]
  const active = !Number.isNaN(now) && (trigger.dir === 'below' ? now <= level : now >= level) && ok(n)
  const last = events[events.length - 1]
  return {
    tf, side, level, trigger, filter, events, horizons, main, verdict,
    score: all.p != null ? -Math.log10(all.p) + (confirm.p != null ? -Math.log10(confirm.p) / 2 : 0) + Math.max(0, Math.min(6, universe?.z ?? 0)) / 2 : -1,
    test: { all, discovery, confirm, cutTime: t[Math.min(n, cut)] },
    checks, years, universe,
    adverse: median(against), favorable: median(favor),
    stable: better(discovery) && better(confirm),
    span: events.length > 1 ? events[events.length - 1].t - events[0].t : 0,
    active,
    filterNow: filterHolds(filter, c, s, n),
    sinceBars: last ? n - last.i : undefined,
    sinceReturn: last ? c[n] / last.price - 1 : undefined,
  }
}

export interface TimeframeAnalysis {
  tf: Timeframe
  bars: number
  from: number
  to: number
  /** Bir çubuğun ortalama süresi (saniye; tatil ve geceler dahil takvim süresi) */
  spacing: number
  rsi: number
  /** Geçmişte görülen en düşük ve en yüksek RSI */
  rsiMin: number
  rsiMax: number
  close: number
  /** Göstergelerin şu anki değeri ve geçmişte gördüğü aralık */
  values: Record<Indicator, { now: number; min: number; max: number }>
  /** Bir sonraki çubukta sinyalin gelmesi için gereken kapanış (kural kimliğine göre) */
  triggers: Record<string, number | undefined>
  /** Tüm kurallar: önce bağlamsız (her tetikleyici bir kez), sonra bağlamlı */
  dips: SignalStat[]
  tops: SignalStat[]
}

export interface Analysis {
  frames: TimeframeAnalysis[]
  /** Evren kanıtı kullanılabildi mi (yoksa hiçbir kural teyitli sayılmaz) */
  hasUniverse: boolean
  /** En iyi dip ve tepe sinyali (teyitli ya da umut verici); yoksa undefined */
  bestDip?: SignalStat
  bestTop?: SignalStat
}

const RANK: Record<Verdict, number> = { confirmed: 3, promising: 2, none: 1, thin: 0 }
export const better = (a: SignalStat, b: SignalStat) => RANK[b.verdict] - RANK[a.verdict] || b.score - a.score

export function analyze(data: Partial<Record<Timeframe, Bars>>, universe?: Universe): Analysis {
  const frames: TimeframeAnalysis[] = []
  for (const { id } of TIMEFRAMES) {
    const b = data[id]
    if (!b || b.c.length < PERIOD + 10) continue
    const s = indicators(b.c)
    const n = b.c.length
    const range = (v: number[]) => { let min = Infinity, max = -Infinity; for (const x of v) if (!Number.isNaN(x)) { if (x < min) min = x; if (x > max) max = x }; return { now: v[n - 1], min, max } }
    const cache: PoolCache = new Map()
    const all: SignalStat[] = []
    for (const f of FILTERS) for (const t of TRIGGERS) {
      if (t.ind === 'd200' && (f === 'above200' || f === 'below200')) continue // uzaklık zaten hangi tarafta olduğunu söyler
      all.push(signalStat(b, s, id, t, f, cache, { universe }))
    }
    frames.push({
      tf: id, bars: n, from: b.t[0], to: b.t[n - 1], spacing: (b.t[n - 1] - b.t[0]) / Math.max(1, n - 1),
      rsi: s.rsi[n - 1], rsiMin: range(s.rsi).min, rsiMax: range(s.rsi).max, close: b.c[n - 1],
      values: { rsi: range(s.rsi), bb: range(s.bb), d200: range(s.d200), macd: range(s.macd), dd: range(s.dd), roc: range(s.roc) },
      triggers: Object.fromEntries(TRIGGERS.map((t) => [t.id, triggerClose(b.c, s, t)])),
      dips: all.filter((x) => x.side === 'dip'),
      tops: all.filter((x) => x.side === 'top'),
    })
  }
  const pick = (side: Side) => frames.flatMap((f) => (side === 'dip' ? f.dips : f.tops)).filter((s) => s.verdict === 'confirmed' || s.verdict === 'promising').sort(better)[0]
  return { frames, hasUniverse: !!universe, bestDip: pick('dip'), bestTop: pick('top') }
}

/** Bir zaman dilimindeki en iyi eşik (özet tablosu için) */
export const bestOf = (stats: SignalStat[]) => [...stats].sort(better)[0]

/** [bars] çubuğun takvim süresi: "3 gün", "2 hafta", "6 ay" */
export function durationLabel(bars: number, spacing: number): string {
  const days = (bars * spacing) / 86400
  if (days < 0.9) return `${Math.max(1, Math.round(days * 24))} saat`
  if (days < 12) return `${Math.round(days)} gün`
  if (days < 50) return `${Math.round(days / 7)} hafta`
  if (days < 600) return `${Math.round(days / 30.44)} ay`
  return `${(days / 365.25).toFixed(1).replace('.', ',')} yıl`
}
