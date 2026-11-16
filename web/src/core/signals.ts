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
export interface Bars { t: number[]; c: number[] }

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
 */
export type Indicator = 'rsi' | 'bb' | 'd200' | 'macd'
export interface Trigger { id: string; ind: Indicator; side: Side; level: number; dir: 'below' | 'above'; rearm: number }
const trig = (ind: Indicator, side: Side, level: number, dir: Trigger['dir'], rearm: number): Trigger => ({ id: `${ind}:${side}:${level}`, ind, side, level, dir, rearm })
export const TRIGGERS: Trigger[] = [
  ...[20, 25, 30, 35, 40].map((l) => trig('rsi', 'dip', l, 'below', 10)),
  ...[-2, -2.5].map((l) => trig('bb', 'dip', l, 'below', 1)),
  ...[-0.1, -0.2, -0.3].map((l) => trig('d200', 'dip', l, 'below', 0.05)),
  trig('macd', 'dip', 0, 'above', 0), // MACD sıfırın altındayken sinyal çizgisini yukarı keser
  ...[60, 65, 70, 75, 80].map((l) => trig('rsi', 'top', l, 'above', 10)),
  ...[2, 2.5].map((l) => trig('bb', 'top', l, 'above', 1)),
  ...[0.15, 0.3, 0.5].map((l) => trig('d200', 'top', l, 'above', 0.05)),
  trig('macd', 'top', 0, 'below', 0), // MACD sıfırın üstündeyken sinyal çizgisini aşağı keser
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
  return t.side === 'dip' ? 'MACD sıfırın altında yukarı kesti' : 'MACD sıfırın üstünde aşağı kesti'
}
export const INDICATOR_LABEL: Record<Indicator, string> = { rsi: 'RSI', bb: 'Bollinger', d200: '200 ortalamaya uzaklık', macd: 'MACD' }
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
export const VERDICT_LABEL: Record<Verdict, string> = { confirmed: 'Teyitli', promising: 'Umut verici', none: 'Teyit yok', thin: 'Yetersiz örnek' }

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
  /** Sıralama puanı: isabet oranının güven alt sınırı − olağan isabet */
  score: number
  /** Sinyaller tarih sırasıyla ikiye bölündüğünde iki yarıda da olağandan iyi mi (tek bir döneme bağlı değil) */
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
  rsi: number[]; bb: number[]; d200: number[]; macd: number[]
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
  return { rsi, bb, d200, macd, macdLine, sma50, sma200, gain, loss, e12, e26, sig }
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

/** Olağan sonuç: bağlamı sağlayan her çubuktan [h] çubuk sonraki getiri */
type BaseCache = Map<string, { up: number; n: number; median?: number }>
function baseline(c: number[], s: Series, f: FilterId, h: number, cache: BaseCache) {
  const key = f + ':' + h
  let b = cache.get(key)
  if (!b) {
    const rets: number[] = []
    for (let j = PERIOD; j + h < c.length; j++) if (filterHolds(f, c, s, j)) rets.push(c[j + h] / c[j] - 1)
    b = { up: rets.filter((r) => r > 0).length, n: rets.length, median: median(rets) }
    cache.set(key, b)
  }
  return b
}

export function signalStat(bars: Bars, s: Series, tf: Timeframe, trigger: Trigger, filter: FilterId = 'any', cache: BaseCache = new Map()): SignalStat {
  const { c, t } = bars
  const hs = HORIZONS[tf]
  const { side, level } = trigger
  const sign = side === 'dip' ? 1 : -1
  const v = s[trigger.ind]
  const ok = (i: number) => filterHolds(filter, c, s, i) && (trigger.ind !== 'macd' || (side === 'dip' ? s.macdLine[i] < 0 : s.macdLine[i] > 0))
  const idx = crossings(v, level, trigger.dir, trigger.rearm, ok)
  const events: SignalEvent[] = idx.map((i) => {
    const ret = hs.map((h) => (i + h < c.length ? c[i + h] / c[i] - 1 : undefined))
    // Orta süre içinde en kötü ve en iyi nokta (sinyalden sonra ne kadar daha gitti)
    let worst: number | undefined, best: number | undefined
    for (let j = i + 1; j <= Math.min(c.length - 1, i + hs[1]); j++) { const r = c[j] / c[i] - 1; worst = Math.min(worst ?? r, r); best = Math.max(best ?? r, r) }
    return { i, t: t[i], price: c[i], rsi: s.rsi[i], ret, worst, best }
  })
  const horizons: HorizonStat[] = hs.map((h, k) => {
    const rets = events.map((e) => e.ret[k]).filter((x): x is number => x != null)
    const b = baseline(c, s, filter, h, cache)
    return {
      bars: h, n: rets.length,
      hit: rets.length ? rets.filter((r) => r * sign > 0).length / rets.length : undefined,
      median: median(rets), mean: mean(rets),
      baseHit: b.n ? (sign > 0 ? b.up : b.n - b.up) / b.n : undefined,
      baseMedian: b.median,
    }
  })
  const main = horizons[1]
  const hits = main.hit != null ? Math.round(main.hit * main.n) : 0
  // Bağlamlı kurallar çok daha fazla deneme demektir: daha çok örnek ve daha sıkı güven sınırı istenir
  const combo = filter !== 'any'
  const lower = wilsonLower(hits, main.n, combo ? 2 : 1.645)
  const excess = main.median != null && main.baseMedian != null ? (main.median - main.baseMedian) * sign : undefined
  // İki yarı sınaması: sonucu belli sinyaller tarih sırasıyla ikiye bölünür, iki yarıda da isabet olağanın üstünde olmalı
  const done = events.filter((e) => e.ret[1] != null)
  const halfHit = (list: SignalEvent[]) => (list.length ? list.filter((e) => e.ret[1]! * sign > 0).length / list.length : 0)
  const mid = done.length >> 1
  const stable = done.length >= 8 && halfHit(done.slice(0, mid)) > (main.baseHit ?? 1) && halfHit(done.slice(mid)) > (main.baseHit ?? 1)
  // Teyit: yeterince tekrar, yüksek isabet, olağandan belirgin biçimde iyi (güven alt sınırıyla), ortanca getiri de iyi
  // ve sonuç tek bir döneme bağlı değil
  const verdict: Verdict = main.n < 4 ? 'thin'
    : main.n >= (combo ? 10 : 8) && (main.hit ?? 0) >= 0.65 && lower > (main.baseHit ?? 1) && (excess ?? -1) > 0 && stable ? 'confirmed'
      : (main.hit ?? 0) >= 0.6 && (main.hit ?? 0) > (main.baseHit ?? 1) && (excess ?? -1) > 0 ? 'promising' : 'none'
  const n = c.length - 1
  const now = v[n]
  const active = !Number.isNaN(now) && (trigger.dir === 'below' ? now <= level : now >= level) && ok(n)
  const last = events[events.length - 1]
  return {
    tf, side, level, trigger, filter, events, horizons, main, verdict,
    score: main.n ? lower - (main.baseHit ?? 0.5) : -1,
    stable,
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
  /** En iyi dip ve tepe sinyali (teyitli ya da umut verici); yoksa undefined */
  bestDip?: SignalStat
  bestTop?: SignalStat
}

const RANK: Record<Verdict, number> = { confirmed: 3, promising: 2, none: 1, thin: 0 }
export const better = (a: SignalStat, b: SignalStat) => RANK[b.verdict] - RANK[a.verdict] || b.score - a.score

export function analyze(data: Partial<Record<Timeframe, Bars>>): Analysis {
  const frames: TimeframeAnalysis[] = []
  for (const { id } of TIMEFRAMES) {
    const b = data[id]
    if (!b || b.c.length < PERIOD + 10) continue
    const s = indicators(b.c)
    const n = b.c.length
    const range = (v: number[]) => { let min = Infinity, max = -Infinity; for (const x of v) if (!Number.isNaN(x)) { if (x < min) min = x; if (x > max) max = x }; return { now: v[n - 1], min, max } }
    const cache: BaseCache = new Map()
    const all: SignalStat[] = []
    for (const f of FILTERS) for (const t of TRIGGERS) {
      if (t.ind === 'd200' && (f === 'above200' || f === 'below200')) continue // uzaklık zaten hangi tarafta olduğunu söyler
      all.push(signalStat(b, s, id, t, f, cache))
    }
    frames.push({
      tf: id, bars: n, from: b.t[0], to: b.t[n - 1], spacing: (b.t[n - 1] - b.t[0]) / Math.max(1, n - 1),
      rsi: s.rsi[n - 1], rsiMin: range(s.rsi).min, rsiMax: range(s.rsi).max, close: b.c[n - 1],
      values: { rsi: range(s.rsi), bb: range(s.bb), d200: range(s.d200), macd: range(s.macd) },
      triggers: Object.fromEntries(TRIGGERS.map((t) => [t.id, triggerClose(b.c, s, t)])),
      dips: all.filter((x) => x.side === 'dip'),
      tops: all.filter((x) => x.side === 'top'),
    })
  }
  const pick = (side: Side) => frames.flatMap((f) => (side === 'dip' ? f.dips : f.tops)).filter((s) => s.verdict === 'confirmed' || s.verdict === 'promising').sort(better)[0]
  return { frames, bestDip: pick('dip'), bestTop: pick('top') }
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
