/**
 * Geçmişte test (backtest): bir dinamik listenin her işlem gününde kimleri içereceğini o günün
 * değerleriyle yeniden hesaplar; giriş/çıkış dönemlerini, listede kalma süresini ve sonrasını ölçer.
 *
 * Değerlendirme canlı listeyle aynı kodla yapılır (screener.matches). Alan değerleri günlük
 * kapanışlardan hesaplanır; geçmişi bilinmeyen temel oranlar bugünkü değerle sabit alınır.
 */
import {
  conditionFields, derived, field, historyStats, matches, peAverage,
  type Bar, type FieldId, type Fundamentals, type HistoryStats, type Row, type Screen,
} from './screener'

export interface Series { days: Int32Array; close: Float64Array }

export interface BtSymbol {
  symbol: string
  name: string
  currency?: string
  pricescale?: number
  series: Series
  /** Aylık çubuklar (5 yıl dip/zirve, ortalama F/K) */
  monthly?: Bar[]
  /** Bugünkü değerler (sabit alanlar ve piyasa değeri ölçeği için) */
  now: Partial<Record<FieldId, number>>
  epsFy?: (number | undefined)[]
  revenueFy?: (number | undefined)[]
  fyEnd?: number
  /** FAVÖK, hisse başı temettü, net kâr dizileri ve bugünkü firma değeri */
  fund?: Fundamentals
}

export interface BtInput {
  screen: Screen
  symbols: BtSymbol[]
  /** Test aralığı (epoch gün, UTC) */
  startDay: number
  endDay: number
  benchmark?: { symbol: string; name: string; series: Series }
  /** USD modunda Dolar/TL günlük kapanışları */
  usdTry?: Series
  /** İleri getiri ufukları (işlem günü) */
  horizons?: number[]
  /** Portföyde alım ya da satım başına maliyet (oran; varsayılan 0,0015 = %0,15) */
  costPerSide?: number
}

export interface Episode {
  symbol: string
  name: string
  entryDay: number
  /** Listeden çıktığı gün (o gün koşulu sağlamadı); hâlâ listedeyse undefined */
  exitDay?: number
  /** Listede kaldığı işlem günü */
  tradingDays: number
  calendarDays: number
  entryPrice: number
  exitPrice: number
  /** Listede kalırken getiri (çıkış ya da son gün) */
  returnIn: number
  /** Listede kalırken en yüksek / en düşük getiri */
  bestIn: number
  worstIn: number
  /** Girişten [h] işlem günü sonra getiri */
  afterEntry: (number | undefined)[]
  /** Çıkıştan [h] işlem günü sonra getiri */
  afterExit: (number | undefined)[]
  /** Aynı dönemde karşılaştırma endeksi */
  benchAfterEntry: (number | undefined)[]
  benchAfterExit: (number | undefined)[]
  benchIn?: number
}

export interface HorizonStat {
  horizon: number
  n: number
  mean?: number
  median?: number
  hitRate?: number
  benchMean?: number
  excessMean?: number
}

export interface BtResult {
  episodes: Episode[]
  afterEntry: HorizonStat[]
  afterExit: HorizonStat[]
  /** Listede kalma süresi (işlem günü) */
  stay: { mean?: number; median?: number; max?: number; completed: number; ongoing: number }
  distinct: number
  currentMembers: string[]
  /** Eşit ağırlıklı portföyler ve endeks: gün, değer (1 = başlangıç), listedeki hisse sayısı */
  curve: { day: number; list: number; hold1m?: number; hold3m?: number; bench?: number; members: number }[]
  /** Portföy türlerine göre özet: listede kaldıkça / girince 1 ay / girince 3 ay tut */
  portfolios?: Record<'list' | 'hold1m' | 'hold3m', { total?: number; maxDrawdown?: number; avgMembers?: number; daysInvested: number; costPaid?: number }>
  portfolio: { total?: number; bench?: number; maxDrawdown?: number; avgMembers?: number; daysInvested: number; costPaid?: number }
  tested: number
  skipped: number
  startDay: number
  endDay: number
  notes: string[]
}

export type Support = 'exact' | 'approx' | 'constant'

/** Alanın geçmişte nasıl hesaplandığı (arayüzde gösterilir). */
export function backtestSupport(id: FieldId): { level: Support; how: string } {
  switch (id) {
    case 'PRICE': case 'CHANGE': case 'SMA20': case 'SMA50': case 'SMA100': case 'SMA200': case 'EMA200': case 'RSI':
    case 'PERF_1M': case 'PERF_3M': case 'PERF_YTD': case 'PERF_1Y':
      return { level: 'exact', how: 'günlük kapanışlardan' }
    case 'LOW_52W': case 'HIGH_52W': return { level: 'approx', how: 'kapanış fiyatları üzerinden' }
    case 'ATL': case 'ATH': return { level: 'approx', how: 'eldeki ~4 yıllık geçmişten' }
    case 'LOW_5Y': case 'HIGH_5Y': case 'PERF_5Y': return { level: 'approx', how: 'aylık çubuklardan' }
    case 'MCAP': return { level: 'approx', how: 'bugünkü hisse sayısıyla, o günün fiyatından' }
    case 'PS': return { level: 'approx', how: 'o gün açıklanmış yıllık satışla, o günün fiyatından' }
    case 'EV_EBITDA': return { level: 'approx', how: 'o gün açıklanmış yıllık FAVÖK ve bugünkü net borçla' }
    case 'DIV_YIELD': return { level: 'approx', how: 'o gün açıklanmış yılın hisse başı temettüsüyle' }
    case 'PB': case 'ROE': case 'DEBT_EQ':
      return { level: 'approx', how: 'o günkü özkaynakla: bugünkünden sonraki yılların kârı ve temettüsü düşülerek' }
    case 'NET_MARGIN': return { level: 'approx', how: 'o gün açıklanmış yıllık kâr ve satıştan' }
    case 'FWD_PE': return { level: 'constant', how: 'geçmiş tahminler bilinmiyor; bugünkü tahmin, o günün fiyatıyla' }
    case 'PE': return { level: 'approx', how: 'son açıklanan yıllık kârla (yıl sonundan 75 gün sonra)' }
    case 'PE_5Y_AVG': case 'EPS_GROWTH_1Y': case 'EPS_CAGR_5Y': case 'REV_GROWTH_1Y':
      return { level: 'approx', how: 'o gün açıklanmış yıllık bilançolardan' }
    default: return { level: 'constant', how: 'geçmişi bilinmiyor, bugünkü değerle sabit' }
  }
}

export const DEFAULT_HORIZONS = [5, 21, 63, 126]
export const horizonLabel = (h: number) => (h === 5 ? '1 hafta' : h === 21 ? '1 ay' : h === 63 ? '3 ay' : h === 126 ? '6 ay' : h === 252 ? '1 yıl' : `${h} gün`)

const REPORT_LAG_DAYS = 75
const DAY = 86400

/** O gün açıklanmış son yıllık bilançodan hesaplanan alanlar. */
export const AS_OF_FIELDS = ['PB', 'PS', 'EV_EBITDA', 'DIV_YIELD', 'ROE', 'NET_MARGIN', 'DEBT_EQ'] as const satisfies readonly FieldId[]

/**
 * Bilanço oranları o gün açıklanmış son yıllık bilançoyla (k0: en yeni önce dizideki sıra):
 *   F/S = piyasa değeri / yıllık satış; FD/FAVÖK = (piyasa değeri + bugünkü net borç) / yıllık FAVÖK;
 *   temettü verimi = hisse başı temettü / fiyat (son yılın temettüsü henüz yazılmadıysa bir önceki);
 *   özkaynak = bugünkü − sonraki yılların (net kâr − dağıtılan temettü) → PD/DD, özsermaye kârlılığı, borç/özsermaye;
 *   net kâr marjı = yıllık net kâr / yıllık satış.
 * Piyasa değeri bugünkü hisse sayısıyla bulunur. Geri alımlar ve kâr dışı özkaynak hareketleri hesaba
 * katılmaz (özkaynak yaklaşık). Bilanço başka para birimindeyse para tutarı içeren oranlar hesaplanmaz.
 */
export function asOfRatios(sym: BtSymbol, k0: number, price: number, lastClose: number, used: Set<FieldId>): Partial<Record<FieldId, number | undefined>> {
  const out: Partial<Record<FieldId, number | undefined>> = {}
  for (const f of AS_OF_FIELDS) if (used.has(f)) out[f] = undefined
  const f = sym.fund
  const rev = sym.revenueFy?.[k0]
  const ni = f?.netIncomeFy?.[k0]
  // Para biriminden bağımsız: aynı bilançonun iki kalemi
  if (used.has('NET_MARGIN') && ni != null && rev != null && rev > 0) out.NET_MARGIN = (ni / rev) * 100
  if (!f || !(lastClose > 0) || (f.currency && sym.currency && f.currency !== sym.currency)) return out
  const mcapNow = sym.now.MCAP
  const shares = mcapNow != null && mcapNow > 0 ? mcapNow / lastClose : undefined
  const mcap = shares != null ? shares * price : undefined
  if (used.has('PS') && mcap != null && rev != null && rev > 0) out.PS = mcap / rev
  if (used.has('EV_EBITDA') && mcap != null && f.ev != null) {
    const e = f.ebitdaFy?.[k0]
    if (e != null && e > 0) out.EV_EBITDA = (mcap + (f.ev - mcapNow!)) / e
  }
  if (used.has('DIV_YIELD') && f.dpsFy?.length) {
    let dps = f.dpsFy[k0]
    if (!dps && f.dpsFy[k0 + 1]) dps = f.dpsFy[k0 + 1]
    if (dps != null) out.DIV_YIELD = (dps / price) * 100
  }
  if ((used.has('PB') || used.has('ROE') || used.has('DEBT_EQ')) && shares != null && sym.now.PB != null && sym.now.PB > 0) {
    let equity: number | undefined = mcapNow! / sym.now.PB
    for (let j = 0; j < k0 && equity != null; j++) {
      const n = f.netIncomeFy?.[j]
      equity = n == null ? undefined : equity - (n - (f.dpsFy?.[j] ?? 0) * shares)
    }
    if (equity != null && equity > 0) {
      if (used.has('PB') && mcap != null) out.PB = mcap / equity
      if (used.has('ROE') && ni != null) out.ROE = (ni / equity) * 100
      const debt = f.debtFy?.[k0]
      if (used.has('DEBT_EQ') && debt != null) out.DEBT_EQ = debt / equity
    }
  }
  return out
}

// ------------------------------------------------------------------ göstergeler

function sma(c: Float64Array, n: number): Float64Array {
  const out = new Float64Array(c.length).fill(NaN)
  let s = 0
  for (let i = 0; i < c.length; i++) {
    s += c[i]
    if (i >= n) s -= c[i - n]
    if (i >= n - 1) out[i] = s / n
  }
  return out
}

function ema(c: Float64Array, n: number): Float64Array {
  const out = new Float64Array(c.length).fill(NaN)
  if (c.length < n) return out
  const k = 2 / (n + 1)
  let e = 0
  for (let i = 0; i < n; i++) e += c[i]
  e /= n
  out[n - 1] = e
  for (let i = n; i < c.length; i++) { e = c[i] * k + e * (1 - k); out[i] = e }
  return out
}

/** Wilder RSI (14) */
function rsi(c: Float64Array, n = 14): Float64Array {
  const out = new Float64Array(c.length).fill(NaN)
  if (c.length <= n) return out
  let gain = 0, loss = 0
  for (let i = 1; i <= n; i++) {
    const d = c[i] - c[i - 1]
    if (d > 0) gain += d; else loss -= d
  }
  gain /= n; loss /= n
  out[n] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1]
    gain = (gain * (n - 1) + Math.max(d, 0)) / n
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  }
  return out
}

/** Kayan pencerede en düşük / en yüksek (tekdüze kuyruk, O(n)). Pencere dolmadıysa NaN. */
function rolling(c: Float64Array, n: number, max: boolean): Float64Array {
  const out = new Float64Array(c.length).fill(NaN)
  const q: number[] = []
  let head = 0
  for (let i = 0; i < c.length; i++) {
    while (q.length > head && (max ? c[q[q.length - 1]] <= c[i] : c[q[q.length - 1]] >= c[i])) q.pop()
    q.push(i)
    if (q[head] <= i - n) head++
    if (i >= n - 1) out[i] = c[q[head]]
  }
  return out
}

/** Gün (epoch gün) → o güne kadarki son kayıt indeksi; yoksa -1. */
function indexAtOrBefore(days: Int32Array, day: number): number {
  let lo = 0, hi = days.length - 1, ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (days[mid] <= day) { ans = mid; lo = mid + 1 } else hi = mid - 1
  }
  return ans
}

const monthOf = (day: number) => { const d = new Date(day * DAY * 1000); return d.getUTCFullYear() * 12 + d.getUTCMonth() }
const monthStartSec = (m: number) => Date.UTC(Math.floor(m / 12), m % 12, 1) / 1000

// ------------------------------------------------------------------ çalıştır

export function runBacktest(input: BtInput, onProgress?: (done: number, total: number) => void): BtResult {
  const { screen, startDay, endDay } = input
  const horizons = input.horizons ?? DEFAULT_HORIZONS
  const used = new Set(screen.conditions.flatMap(conditionFields))
  const need = (...ids: FieldId[]) => ids.some((x) => used.has(x))
  const notes: string[] = []
  const usdTry = input.usdTry
  // USD modunda aylık kur (ay → son kapanış), 5 yıllık dipleri her ayın kuruyla çevirmek için
  const fxMonthly: Bar[] | null = usdTry && screen.currency === 'USD' ? monthlyFromSeries(usdTry) : null

  const memberships = new Map<string, { sym: BtSymbol; member: Uint8Array; from: number; to: number }>()
  const episodes: Episode[] = []
  let tested = 0, skipped = 0
  const bench = input.benchmark?.series

  input.symbols.forEach((sym, si) => {
    onProgress?.(si, input.symbols.length)
    const { days, close: c } = sym.series
    const n = c.length
    const from = Math.max(0, indexAtOrBefore(days, startDay - 1) + 1)
    const to = indexAtOrBefore(days, endDay)
    if (to < from || n < 30) { skipped++; return }
    tested++

    // Göstergeler (yalnızca kullanılanlar)
    const ind: Partial<Record<FieldId, Float64Array>> = {}
    if (need('SMA20')) ind.SMA20 = sma(c, 20)
    if (need('SMA50')) ind.SMA50 = sma(c, 50)
    if (need('SMA100')) ind.SMA100 = sma(c, 100)
    if (need('SMA200')) ind.SMA200 = sma(c, 200)
    if (need('EMA200')) ind.EMA200 = ema(c, 200)
    if (need('RSI')) ind.RSI = rsi(c)
    if (need('LOW_52W')) ind.LOW_52W = rolling(c, 252, false)
    if (need('HIGH_52W')) ind.HIGH_52W = rolling(c, 252, true)
    const lastClose = c[n - 1]
    const needHist = need('LOW_5Y', 'HIGH_5Y', 'PE_5Y_AVG')
    const ratios = need(...AS_OF_FIELDS)
    const fundamentals = ratios || need('PE', 'PE_5Y_AVG', 'EPS_GROWTH_1Y', 'EPS_CAGR_5Y', 'REV_GROWTH_1Y')
    const constants: Partial<Record<FieldId, number>> = {}
    for (const f of used) if (backtestSupport(f).level === 'constant') constants[f] = sym.now[f]
    let runMin = Infinity, runMax = -Infinity
    for (let i = 0; i < from; i++) { runMin = Math.min(runMin, c[i]); runMax = Math.max(runMax, c[i]) }

    const member = new Uint8Array(n)
    let histMonth = -1
    let hist: HistoryStats = {}
    let curMonth = -1, monthLow = Infinity, monthHigh = -Infinity
    for (let i = from; i <= to; i++) {
      runMin = Math.min(runMin, c[i]); runMax = Math.max(runMax, c[i])
      const day = days[i]
      const values: Row['values'] = { ...constants, PRICE: c[i] }
      if (i > 0) values.CHANGE = (c[i] / c[i - 1] - 1) * 100
      for (const k of Object.keys(ind) as FieldId[]) { const v = ind[k]![i]; if (!Number.isNaN(v)) values[k] = v }
      if (used.has('ATL')) values.ATL = runMin
      if (used.has('ATH')) values.ATH = runMax
      if (used.has('PERF_1M') && i >= 21) values.PERF_1M = (c[i] / c[i - 21] - 1) * 100
      if (used.has('PERF_3M') && i >= 63) values.PERF_3M = (c[i] / c[i - 63] - 1) * 100
      if (used.has('PERF_1Y') && i >= 252) values.PERF_1Y = (c[i] / c[i - 252] - 1) * 100
      if (used.has('PERF_YTD')) {
        const y = new Date(day * DAY * 1000).getUTCFullYear()
        const j = indexAtOrBefore(days, Date.UTC(y, 0, 1) / 1000 / DAY - 1)
        if (j >= 0) values.PERF_YTD = (c[i] / c[j] - 1) * 100
      }
      if (used.has('PERF_5Y') && sym.monthly?.length) {
        const m = monthOf(day) - 60
        const b = sym.monthly.find((x) => monthOf(x.time / DAY) === m)
        if (b?.close) values.PERF_5Y = (c[i] / b.close - 1) * 100
      }
      if (used.has('MCAP') && sym.now.MCAP && lastClose > 0) values.MCAP = sym.now.MCAP * (c[i] / lastClose)
      // Bugünkü tahmin (geçmişi yok): o günün fiyatıyla ölçeklenir
      if (used.has('FWD_PE') && sym.now.FWD_PE != null && lastClose > 0) values.FWD_PE = sym.now.FWD_PE * (c[i] / lastClose)

      // Temel analiz: o gün açıklanmış olan yıllık bilançolar
      let k0 = -1
      if (fundamentals && sym.fyEnd != null) {
        const len = Math.max(sym.epsFy?.length ?? 0, sym.revenueFy?.length ?? 0, sym.fund?.ebitdaFy?.length ?? 0, sym.fund?.dpsFy?.length ?? 0)
        for (let k = 0; k < len; k++) {
          const end = sym.fyEnd - k * 365.25 * DAY
          if (end / DAY + REPORT_LAG_DAYS <= day) { k0 = k; break }
        }
      }
      if (k0 >= 0) {
        const eps = (sym.epsFy ?? []).slice(k0)
        if (used.has('PE') && eps[0] != null && eps[0] !== 0) values.PE = c[i] / eps[0]
        const d = derived(c[i], eps, (sym.revenueFy ?? []).slice(k0), undefined)
        if (used.has('EPS_GROWTH_1Y')) values.EPS_GROWTH_1Y = d.EPS_GROWTH_1Y
        if (used.has('EPS_CAGR_5Y')) values.EPS_CAGR_5Y = d.EPS_CAGR_5Y
        if (used.has('REV_GROWTH_1Y')) values.REV_GROWTH_1Y = d.REV_GROWTH_1Y
        if (ratios) Object.assign(values, asOfRatios(sym, k0, c[i], lastClose, used))
      }
      // 5 yıllık dip/zirve ve ortalama F/K: ay değişince yeniden
      if (needHist && sym.monthly?.length) {
        const m = monthOf(day)
        if (m !== histMonth) {
          histMonth = m
          const prior = sym.monthly.filter((b) => b.time < monthStartSec(m))
          const since = monthStartSec(m - 60)
          hist = historyStats(prior, sym.currency === 'TRY' ? fxMonthly : null, since)
          if (used.has('PE_5Y_AVG') && k0 >= 0) {
            const fyEnd = sym.fyEnd! - k0 * 365.25 * DAY
            hist.peAvg = peAverage(prior, sym.epsFy!.slice(k0), fyEnd)
          }
        }
      }
      // Ay içinde o güne kadar görülen kapanışlar da 5 yıllık dibe/zirveye dahil
      let dayHist = hist
      if (needHist && (used.has('LOW_5Y') || used.has('HIGH_5Y'))) {
        const fx = screen.currency === 'USD' && sym.currency === 'TRY' && usdTry ? usdTry.close[Math.max(0, indexAtOrBefore(usdTry.days, day))] : 1
        const px = c[i] / fx
        if (monthOf(day) !== curMonth) { curMonth = monthOf(day); monthLow = px; monthHigh = px }
        else { monthLow = Math.min(monthLow, px); monthHigh = Math.max(monthHigh, px) }
        dayHist = { ...hist, low: hist.low == null ? undefined : Math.min(hist.low, monthLow), high: hist.high == null ? undefined : Math.max(hist.high, monthHigh) }
      }

      const usd = screen.currency === 'USD' && usdTry ? usdTry.close[Math.max(0, indexAtOrBefore(usdTry.days, day))] : undefined
      const row: Row = { symbol: sym.symbol, name: sym.name, currency: sym.currency, pricescale: sym.pricescale, values, epsFy: sym.epsFy, fyEnd: sym.fyEnd }
      if (matches(row, screen, usd, new Map([[sym.symbol, dayHist]]))) member[i] = 1
    }
    memberships.set(sym.symbol, { sym, member, from, to })

    // Dönemler
    let i = from
    while (i <= to) {
      if (!member[i]) { i++; continue }
      const entry = i
      while (i <= to && member[i]) i++
      const exit = i <= to ? i : undefined // çıktığı gün
      const endIdx = exit ?? to
      let best = -Infinity, worst = Infinity
      for (let j = entry; j <= endIdx; j++) { const r = c[j] / c[entry] - 1; best = Math.max(best, r); worst = Math.min(worst, r) }
      const fwd = (base: number | undefined, h: number) => (base != null && base + h < n ? c[base + h] / c[base] - 1 : undefined)
      const bFwd = (base: number | undefined, h: number) => {
        if (!bench || base == null || base + h >= n) return undefined
        const a = indexAtOrBefore(bench.days, days[base])
        const b = indexAtOrBefore(bench.days, days[base + h])
        return a >= 0 && b >= 0 ? bench.close[b] / bench.close[a] - 1 : undefined
      }
      let benchIn: number | undefined
      if (bench) {
        const a = indexAtOrBefore(bench.days, days[entry]), b = indexAtOrBefore(bench.days, days[endIdx])
        if (a >= 0 && b >= 0) benchIn = bench.close[b] / bench.close[a] - 1
      }
      episodes.push({
        symbol: sym.symbol, name: sym.name,
        entryDay: days[entry], exitDay: exit != null ? days[exit] : undefined,
        tradingDays: endIdx - entry + (exit == null ? 1 : 0),
        calendarDays: days[endIdx] - days[entry] + (exit == null ? 1 : 0),
        entryPrice: c[entry], exitPrice: c[endIdx],
        returnIn: c[endIdx] / c[entry] - 1, bestIn: best, worstIn: worst,
        afterEntry: horizons.map((h) => fwd(entry, h)),
        afterExit: horizons.map((h) => fwd(exit, h)),
        benchAfterEntry: horizons.map((h) => bFwd(entry, h)),
        benchAfterExit: horizons.map((h) => bFwd(exit, h)),
        benchIn,
      })
    }
  })
  onProgress?.(input.symbols.length, input.symbols.length)

  // Özet istatistikler
  const stat = (pick: (e: Episode) => [number | undefined, number | undefined], h: number): HorizonStat => {
    const pairs = episodes.map(pick).filter((p): p is [number, number | undefined] => p[0] != null)
    const r = pairs.map((p) => p[0]).sort((a, b) => a - b)
    const b = pairs.map((p) => p[1]).filter((x): x is number => x != null)
    const ex = pairs.filter((p) => p[1] != null).map((p) => p[0] - (p[1] as number))
    return {
      horizon: h, n: r.length,
      mean: r.length ? avg(r) : undefined,
      median: r.length ? median(r) : undefined,
      hitRate: r.length ? r.filter((x) => x > 0).length / r.length : undefined,
      benchMean: b.length ? avg(b) : undefined,
      excessMean: ex.length ? avg(ex) : undefined,
    }
  }
  const afterEntry = horizons.map((h, k) => stat((e) => [e.afterEntry[k], e.benchAfterEntry[k]], h))
  const afterExit = horizons.map((h, k) => stat((e) => [e.afterExit[k], e.benchAfterExit[k]], h))
  const stays = episodes.map((e) => e.tradingDays).sort((a, b) => a - b)
  const currentMembers = [...memberships.values()].filter((m) => m.member[m.to] && m.sym.series.days[m.to] >= endDay - 7).map((m) => m.sym.symbol)

  // Portföyler: (a) listede kaldıkça tut, (b) girince 1 ay tut, (c) girince 3 ay tut — eşit ağırlık, işlem maliyetli
  const cost = input.costPerSide ?? 0.0015
  const cal = bench ?? pickCalendar(input.symbols, startDay, endDay)
  const holdings = (hold: number | null) => {
    const out = new Map<string, Uint8Array>()
    for (const m of memberships.values()) {
      if (hold == null) { out.set(m.sym.symbol, m.member); continue }
      const h = new Uint8Array(m.member.length)
      for (let i = m.from; i <= m.to; i++) {
        // giriş günü: üye ve bir önceki gün üye değil
        if (m.member[i] && !(i > m.from && m.member[i - 1])) for (let k = i; k < Math.min(h.length, i + hold); k++) h[k] = 1
      }
      out.set(m.sym.symbol, h)
    }
    return out
  }
  const simulate = (held: Map<string, Uint8Array>) => {
    const pts: { day: number; value: number; members: number }[] = []
    let maxDd = 0, peak = 1, memberSum = 0, invested = 0, costPaid = 0
    if (!cal) return { pts, maxDd, memberSum, invested, costPaid }
    const a = Math.max(0, indexAtOrBefore(cal.days, startDay - 1) + 1)
    const b = indexAtOrBefore(cal.days, endDay)
    let value = 1
    const idx = new Map<string, number>()
    let weights = new Map<string, number>()
    for (let j = a; j <= b; j++) {
      const day = cal.days[j]
      let rSum = 0, wSum = 0
      const today: string[] = []
      for (const m of memberships.values()) {
        const ds = m.sym.series.days
        const prev = idx.get(m.sym.symbol) ?? -1
        let k = prev
        while (k + 1 < ds.length && ds[k + 1] <= day) k++
        idx.set(m.sym.symbol, k)
        if (k < 0) continue
        const w = weights.get(m.sym.symbol)
        if (w && prev >= 0 && k > prev) { rSum += w * (m.sym.series.close[k] / m.sym.series.close[prev] - 1); wSum += w }
        if (held.get(m.sym.symbol)![k] && ds[k] === day) today.push(m.sym.symbol)
      }
      if (j > a && wSum > 0) { value *= 1 + rSum / wSum; invested++ }
      const next = new Map(today.map((s) => [s, 1 / today.length]))
      let turnover = 0
      for (const [s, w] of next) turnover += Math.abs(w - (weights.get(s) ?? 0))
      for (const [s, w] of weights) if (!next.has(s)) turnover += w
      if (turnover > 0 && cost > 0) { value *= 1 - cost * turnover; costPaid += cost * turnover }
      weights = next
      if (j > a) { peak = Math.max(peak, value); maxDd = Math.min(maxDd, value / peak - 1) }
      memberSum += today.length
      pts.push({ day, value, members: today.length })
    }
    return { pts, maxDd, memberSum, invested, costPaid }
  }
  const sims = { list: simulate(holdings(null)), hold1m: simulate(holdings(21)), hold3m: simulate(holdings(63)) }
  const b0 = cal && bench ? bench.close[Math.max(0, indexAtOrBefore(cal.days, startDay - 1) + 1)] : undefined
  const curve: BtResult['curve'] = sims.list.pts.map((p, i) => ({
    day: p.day, list: p.value, hold1m: sims.hold1m.pts[i]?.value, hold3m: sims.hold3m.pts[i]?.value, members: p.members,
    bench: b0 && cal ? bench!.close[indexAtOrBefore(cal.days, p.day)] / b0 : undefined,
  }))
  const stats = (k: keyof typeof sims) => {
    const s = sims[k]
    const lastV = s.pts.at(-1)?.value
    return { total: lastV != null ? lastV - 1 : undefined, maxDrawdown: s.pts.length ? s.maxDd : undefined, avgMembers: s.pts.length ? s.memberSum / s.pts.length : undefined, daysInvested: s.invested, costPaid: s.costPaid }
  }
  const maxDd = sims.list.maxDd, memberSum = sims.list.memberSum, invested = sims.list.invested, costPaid = sims.list.costPaid
  const last = curve[curve.length - 1]
  if (used.size && [...used].some((f) => backtestSupport(f).level === 'constant')) {
    notes.push('Geçmişi bilinmeyen oranlar bugünkü değerleriyle sabit alındı; sonuçlar iyimser olabilir (ileriye bakma).')
  }
  if (needHistAny(used)) notes.push('5 yıllık dip/zirve ay içinde kapanışlardan hesaplanır. Canlı liste geçmişi hız için yalnızca piyasa değeri en büyük 60 aday için çeker; test tüm evreni tarar, bu yüzden "şu an listede" sayısı daha büyük olabilir.')
  notes.push('Evren bugünkü hisselerden oluşur; bu sürede borsadan çıkanlar dahil değildir.')

  return {
    episodes: episodes.sort((x, y) => y.entryDay - x.entryDay),
    afterEntry, afterExit,
    stay: {
      mean: stays.length ? avg(stays) : undefined, median: stays.length ? median(stays) : undefined, max: stays.at(-1),
      completed: episodes.filter((e) => e.exitDay != null).length, ongoing: episodes.filter((e) => e.exitDay == null).length,
    },
    distinct: new Set(episodes.map((e) => e.symbol)).size,
    currentMembers,
    curve,
    portfolio: {
      total: last ? last.list - 1 : undefined,
      bench: last?.bench != null ? last.bench - 1 : undefined,
      maxDrawdown: curve.length ? maxDd : undefined,
      avgMembers: curve.length ? memberSum / curve.length : undefined,
      daysInvested: invested,
      costPaid,
    },
    portfolios: { list: stats('list'), hold1m: stats('hold1m'), hold3m: stats('hold3m') },
    tested, skipped, startDay, endDay, notes,
  }
}

const needHistAny = (used: Set<FieldId>) => ['LOW_5Y', 'HIGH_5Y', 'PE_5Y_AVG'].some((f) => used.has(f as FieldId))

function pickCalendar(symbols: BtSymbol[], startDay: number, endDay: number): Series | undefined {
  // Endeks yoksa en uzun seriyi takvim olarak kullan
  let best: Series | undefined
  for (const s of symbols) {
    const n = indexAtOrBefore(s.series.days, endDay) - indexAtOrBefore(s.series.days, startDay)
    if (!best || n > indexAtOrBefore(best.days, endDay) - indexAtOrBefore(best.days, startDay)) best = s.series
  }
  return best
}

/** Günlük seriden aylık kapanışlar (kur çevrimi için). */
function monthlyFromSeries(s: Series): Bar[] {
  const out: Bar[] = []
  let cur = -1
  for (let i = 0; i < s.days.length; i++) {
    const m = monthOf(s.days[i])
    if (m !== cur) { out.push({ time: monthStartSec(m), close: s.close[i] }); cur = m } else out[out.length - 1].close = s.close[i]
  }
  return out
}

const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
const median = (sorted: number[]) => {
  const m = sorted.length >> 1
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2
}

/** Alanlardan hangileri kullanılıyor ve nasıl hesaplanıyor (arayüz özeti). */
export function supportSummary(screen: Screen) {
  const used = [...new Set(screen.conditions.flatMap(conditionFields))]
  return used.map((id) => ({ id, label: field(id).label, ...backtestSupport(id) }))
}

// ------------------------------------------------------------------ güvenilirlik skoru

export type ReliabilityLabel = 'Güçlü' | 'Orta' | 'Zayıf' | 'Güvenilmez' | 'Yetersiz veri'

export interface Reliability {
  /** 0–100; yetersiz veride undefined */
  score?: number
  label: ReliabilityLabel
  /** Giriş olan ay sayısı ve toplam giriş */
  months: number
  episodes: number
  /** Girişten 1 ay / 3 ay sonra endekse göre aylık ortalama fark (oran) */
  edge1m?: number
  edge3m?: number
  t1m?: number
  t3m?: number
  /** Ayların kaçında 3 ay sonraki fark pozitif (0–1) */
  consistency?: number
  /** Geçmişi bilinmeyen alan kullanımı cezası */
  lookahead: boolean
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/**
 * Geçmişte testten güvenilirlik skoru. Girişler ay ay gruplanır (aynı gün çok giriş tek ayı şişirmesin),
 * her ayın girişten sonraki ortalama endeks farkı alınır; aylar arası ortalama, t değeri ve pozitif ay oranı:
 *   skor = 100 × (0,5·güç + 0,3·tutarlılık + 0,2·örnek) × (sabit alan varsa 0,75)
 *   güç: t −0,5 → 0, +2,5 → 1 (1 ve 3 ay ortalaması; 3 aylık pencereler örtüştüğü için etkin örnek ⅓)
 *   tutarlılık: pozitif ay oranı %35 → 0, %70 → 1      örnek: ay sayısı 30'a, giriş sayısı 60'a göre
 */
export function reliability(r: BtResult, screen: Screen): Reliability {
  const k1 = (r.afterEntry.findIndex((s) => s.horizon === 21))
  const k3 = (r.afterEntry.findIndex((s) => s.horizon === 63))
  const lookahead = screen.conditions.flatMap(conditionFields).some((f) => backtestSupport(f).level === 'constant')
  const monthly = (k: number) => {
    if (k < 0) return [] as number[]
    const by = new Map<number, number[]>()
    for (const e of r.episodes) {
      const a = e.afterEntry[k]
      if (a == null) continue
      const ex = a - (e.benchAfterEntry[k] ?? 0)
      const m = monthOf(e.entryDay)
      by.set(m, [...(by.get(m) ?? []), ex])
    }
    return [...by.values()].map((v) => v.reduce((x, y) => x + y, 0) / v.length)
  }
  const m1 = monthly(k1), m3 = monthly(k3)
  const tstat = (v: number[], eff = 1) => {
    if (v.length < 3) return undefined
    const mu = v.reduce((a, b) => a + b, 0) / v.length
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / (v.length - 1))
    return sd > 0 ? mu / (sd / Math.sqrt(Math.max(1, v.length * eff))) : undefined
  }
  const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined)
  const months = Math.max(m1.length, m3.length)
  const episodes = r.episodes.length
  const base = { months, episodes, edge1m: mean(m1), edge3m: mean(m3), t1m: tstat(m1), t3m: tstat(m3, 1 / 3), lookahead }
  const pos = m3.length ? m3 : m1
  const consistency = pos.length ? pos.filter((x) => x > 0).length / pos.length : undefined
  if (months < 6 || episodes < 15) return { ...base, consistency, label: 'Yetersiz veri' }
  const ts = [base.t1m, base.t3m].filter((x): x is number => x != null)
  const t = ts.length ? ts.reduce((a, b) => a + b, 0) / ts.length : 0
  const strength = clamp01((t + 0.5) / 3)
  const cons = clamp01(((consistency ?? 0) - 0.35) / 0.35)
  const sample = clamp01(Math.log(months) / Math.log(30)) * Math.sqrt(clamp01(episodes / 60))
  const score = Math.round(100 * (0.5 * strength + 0.3 * cons + 0.2 * sample) * (lookahead ? 0.75 : 1))
  const label: ReliabilityLabel = score >= 70 ? 'Güçlü' : score >= 50 ? 'Orta' : score >= 30 ? 'Zayıf' : 'Güvenilmez'
  return { ...base, consistency, score, label }
}
