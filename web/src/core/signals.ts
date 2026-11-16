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
export const DIP_LEVELS = [20, 25, 30, 35, 40]
export const TOP_LEVELS = [60, 65, 70, 75, 80]
/** Sonrası kaç çubuk ölçülür: kısa, orta (asıl ölçüt), uzun */
export const HORIZONS: Record<Timeframe, [number, number, number]> = { W: [4, 13, 26], D: [5, 21, 63], H4: [6, 20, 60], H1: [7, 35, 140] }
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

/** Eşiği geçiş anları (yeniden kurulma payıyla). */
export function findEvents(rsi: number[], level: number, side: Side): number[] {
  const out: number[] = []
  let armed = true
  for (let i = 1; i < rsi.length; i++) {
    const r = rsi[i], p = rsi[i - 1]
    if (Number.isNaN(r) || Number.isNaN(p)) continue
    if (side === 'dip') {
      if (armed && r <= level && p > level) { out.push(i); armed = false } else if (r >= level + REARM) armed = true
    } else if (armed && r >= level && p < level) { out.push(i); armed = false } else if (r <= level - REARM) armed = true
  }
  return out
}

export function signalStat(bars: Bars, rsi: number[], tf: Timeframe, side: Side, level: number): SignalStat {
  const { c, t } = bars
  const hs = HORIZONS[tf]
  const sign = side === 'dip' ? 1 : -1
  const idx = findEvents(rsi, level, side)
  const events: SignalEvent[] = idx.map((i) => {
    const ret = hs.map((h) => (i + h < c.length ? c[i + h] / c[i] - 1 : undefined))
    // Orta süre içinde en kötü ve en iyi nokta (sinyalden sonra ne kadar daha gitti)
    let worst: number | undefined, best: number | undefined
    for (let j = i + 1; j <= Math.min(c.length - 1, i + hs[1]); j++) { const r = c[j] / c[i] - 1; worst = Math.min(worst ?? r, r); best = Math.max(best ?? r, r) }
    return { i, t: t[i], price: c[i], rsi: rsi[i], ret, worst, best }
  })
  const horizons: HorizonStat[] = hs.map((h, k) => {
    const rets = events.map((e) => e.ret[k]).filter((x): x is number => x != null)
    const base: number[] = []
    for (let j = PERIOD; j + h < c.length; j++) base.push(c[j + h] / c[j] - 1)
    return {
      bars: h, n: rets.length,
      hit: rets.length ? rets.filter((r) => r * sign > 0).length / rets.length : undefined,
      median: median(rets), mean: mean(rets),
      baseHit: base.length ? base.filter((r) => r * sign > 0).length / base.length : undefined,
      baseMedian: median(base),
    }
  })
  const main = horizons[1]
  const hits = main.hit != null ? Math.round(main.hit * main.n) : 0
  const lower = wilsonLower(hits, main.n)
  const excess = main.median != null && main.baseMedian != null ? (main.median - main.baseMedian) * sign : undefined
  // İki yarı sınaması: sonucu belli sinyaller tarih sırasıyla ikiye bölünür, iki yarıda da isabet olağanın üstünde olmalı
  const done = events.filter((e) => e.ret[1] != null)
  const halfHit = (list: SignalEvent[]) => (list.length ? list.filter((e) => e.ret[1]! * sign > 0).length / list.length : 0)
  const mid = done.length >> 1
  const stable = done.length >= 8 && halfHit(done.slice(0, mid)) > (main.baseHit ?? 1) && halfHit(done.slice(mid)) > (main.baseHit ?? 1)
  // Teyit: yeterince tekrar, yüksek isabet, olağandan belirgin biçimde iyi (güven alt sınırıyla), ortanca getiri de iyi
  // ve sonuç tek bir döneme bağlı değil
  const verdict: Verdict = main.n < 4 ? 'thin'
    : main.n >= 8 && (main.hit ?? 0) >= 0.65 && lower > (main.baseHit ?? 1) && (excess ?? -1) > 0 && stable ? 'confirmed'
      : (main.hit ?? 0) >= 0.6 && (main.hit ?? 0) > (main.baseHit ?? 1) && (excess ?? -1) > 0 ? 'promising' : 'none'
  const lastR = rsi[rsi.length - 1]
  const active = side === 'dip' ? lastR <= level : lastR >= level
  const last = events[events.length - 1]
  return {
    tf, side, level, events, horizons, main, verdict,
    score: main.n ? lower - (main.baseHit ?? 0.5) : -1,
    stable,
    span: events.length > 1 ? events[events.length - 1].t - events[0].t : 0,
    active,
    sinceBars: last ? c.length - 1 - last.i : undefined,
    sinceReturn: last ? c[c.length - 1] / last.price - 1 : undefined,
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
  gain: number
  loss: number
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
    const { rsi, gain, loss } = rsiSeries(b.c)
    const n = b.c.length
    const seen = rsi.filter((x) => !Number.isNaN(x))
    frames.push({
      tf: id, bars: n, from: b.t[0], to: b.t[n - 1], spacing: (b.t[n - 1] - b.t[0]) / Math.max(1, n - 1),
      rsi: rsi[n - 1], rsiMin: Math.min(...seen), rsiMax: Math.max(...seen), close: b.c[n - 1], gain, loss,
      dips: DIP_LEVELS.map((l) => signalStat(b, rsi, id, 'dip', l)),
      tops: TOP_LEVELS.map((l) => signalStat(b, rsi, id, 'top', l)),
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
