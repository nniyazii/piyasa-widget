/**
 * Dinamik listeler (tarama). Android uygulamasıyla aynı model ve hesaplar.
 *
 *   "USD cinsinden 5 yıllık dibine yakın BIST hisseleri"
 *       Evren: BIST · Para: USD · Fiyat ≤ 5 yıl en düşük +%10
 */
import * as Fmt from './format'
import type { Category } from './models'

export type Universe = 'MY_LIST' | 'BIST' | 'US'
export const UNIVERSES: { id: Universe; label: string; hint: string }[] = [
  { id: 'MY_LIST', label: 'Listem', hint: 'Listendeki semboller' },
  { id: 'BIST', label: 'BIST hisseleri', hint: 'Borsa İstanbul’daki tüm hisseler' },
  { id: 'US', label: 'ABD hisseleri', hint: 'Piyasa değeri 2 milyar $ üstü ABD hisseleri' },
]

export type ScreenCurrency = 'LOCAL' | 'USD'
export type FieldKind = 'PRICE' | 'PERCENT' | 'NUMBER' | 'MONEY'
/** DIRECT: TradingView sütunu · DERIVED: yıllık dizilerden hesaplanır · HISTORY: aylık fiyat geçmişi gerekir */
export type FieldSource = 'DIRECT' | 'DERIVED' | 'HISTORY'

export interface FieldDef {
  id: FieldId
  label: string
  kind: FieldKind
  column?: string
  source: FieldSource
  group: 'Fiyat' | 'Değerleme' | 'Kârlılık'
}

const F = (id: FieldId, label: string, kind: FieldKind, column: string | undefined, o: Partial<FieldDef> = {}): FieldDef => ({
  id, label, kind, column, source: column ? 'DIRECT' : 'HISTORY', group: 'Fiyat', ...o,
})

export type FieldId =
  | 'PRICE' | 'CHANGE' | 'SMA20' | 'SMA50' | 'SMA100' | 'SMA200' | 'EMA200' | 'LOW_52W' | 'HIGH_52W' | 'LOW_5Y' | 'HIGH_5Y'
  | 'ATL' | 'ATH' | 'RSI' | 'PERF_1M' | 'PERF_3M' | 'PERF_YTD' | 'PERF_1Y' | 'PERF_5Y' | 'MCAP'
  | 'PE' | 'PE_5Y_AVG' | 'FWD_PE' | 'PEG' | 'PB' | 'PS' | 'EV_EBITDA' | 'DIV_YIELD'
  | 'ROE' | 'NET_MARGIN' | 'DEBT_EQ' | 'EPS_GROWTH_1Y' | 'EPS_CAGR_5Y' | 'REV_GROWTH_1Y'

export const FIELDS: FieldDef[] = [
  F('PRICE', 'Fiyat', 'PRICE', 'close'),
  F('CHANGE', 'Günlük değişim %', 'PERCENT', 'change'),
  F('SMA20', '20 günlük ortalama', 'PRICE', 'SMA20'),
  F('SMA50', '50 günlük ortalama', 'PRICE', 'SMA50'),
  F('SMA100', '100 günlük ortalama', 'PRICE', 'SMA100'),
  F('SMA200', '200 günlük ortalama', 'PRICE', 'SMA200'),
  F('EMA200', '200 günlük üssel ort.', 'PRICE', 'EMA200'),
  F('LOW_52W', '52 hafta en düşük', 'PRICE', 'price_52_week_low'),
  F('HIGH_52W', '52 hafta en yüksek', 'PRICE', 'price_52_week_high'),
  F('LOW_5Y', '5 yıl en düşük', 'PRICE', undefined),
  F('HIGH_5Y', '5 yıl en yüksek', 'PRICE', undefined),
  F('ATL', 'Tüm zamanların en düşüğü', 'PRICE', 'Low.All'),
  F('ATH', 'Tüm zamanların en yükseği', 'PRICE', 'High.All'),
  F('RSI', 'RSI (14)', 'NUMBER', 'RSI'),
  F('PERF_1M', '1 ay getiri %', 'PERCENT', 'Perf.1M'),
  F('PERF_3M', '3 ay getiri %', 'PERCENT', 'Perf.3M'),
  F('PERF_YTD', 'Yılbaşından beri %', 'PERCENT', 'Perf.YTD'),
  F('PERF_1Y', '1 yıl getiri %', 'PERCENT', 'Perf.Y'),
  F('PERF_5Y', '5 yıl getiri %', 'PERCENT', 'Perf.5Y'),
  F('MCAP', 'Piyasa değeri', 'MONEY', 'market_cap_basic', { group: 'Değerleme' }),
  F('PE', 'F/K', 'NUMBER', 'price_earnings_ttm', { group: 'Değerleme' }),
  F('PE_5Y_AVG', '5 yıllık ortalama F/K', 'NUMBER', undefined, { source: 'HISTORY', group: 'Değerleme' }),
  F('FWD_PE', 'Beklenen F/K', 'NUMBER', undefined, { source: 'DERIVED', group: 'Değerleme' }),
  F('PEG', 'PEG', 'NUMBER', 'price_earnings_growth_ttm', { group: 'Değerleme' }),
  F('PB', 'PD/DD', 'NUMBER', 'price_book_fq', { group: 'Değerleme' }),
  F('PS', 'Fiyat/Satış', 'NUMBER', 'price_sales_current', { group: 'Değerleme' }),
  F('EV_EBITDA', 'FD/FAVÖK', 'NUMBER', 'enterprise_value_ebitda_ttm', { group: 'Değerleme' }),
  F('DIV_YIELD', 'Temettü verimi %', 'PERCENT', 'dividends_yield_current', { group: 'Değerleme' }),
  F('ROE', 'Özsermaye kârlılığı %', 'PERCENT', 'return_on_equity_fq', { group: 'Kârlılık' }),
  F('NET_MARGIN', 'Net kâr marjı %', 'PERCENT', 'net_margin_ttm', { group: 'Kârlılık' }),
  F('DEBT_EQ', 'Borç/Özsermaye', 'NUMBER', 'debt_to_equity_fq', { group: 'Kârlılık' }),
  F('EPS_GROWTH_1Y', 'EPS büyümesi (1 yıl) %', 'PERCENT', undefined, { source: 'DERIVED', group: 'Kârlılık' }),
  F('EPS_CAGR_5Y', 'EPS büyümesi (5 yıl, yıllık) %', 'PERCENT', undefined, { source: 'DERIVED', group: 'Kârlılık' }),
  F('REV_GROWTH_1Y', 'Gelir büyümesi (1 yıl) %', 'PERCENT', undefined, { source: 'DERIVED', group: 'Kârlılık' }),
]

export const field = (id: FieldId): FieldDef => FIELDS.find((f) => f.id === id)!
export const needsHistory = (id: FieldId) => field(id).source === 'HISTORY'

export type Op = 'LT' | 'LTE' | 'GT' | 'GTE'
export const OPS: { id: Op; symbol: string; label: string }[] = [
  { id: 'LT', symbol: '<', label: 'küçük' },
  { id: 'LTE', symbol: '≤', label: 'küçük veya eşit' },
  { id: 'GT', symbol: '>', label: 'büyük' },
  { id: 'GTE', symbol: '≥', label: 'büyük veya eşit' },
]
export const opSymbol = (op: Op) => OPS.find((o) => o.id === op)!.symbol
export function testOp(op: Op, a: number, b: number) {
  switch (op) {
    case 'LT': return a < b
    case 'LTE': return a <= b
    case 'GT': return a > b
    case 'GTE': return a >= b
  }
}

/** [left] [op] ([right] × (1 + value/100))  ya da  [left] [op] [value] */
export interface Condition {
  left: FieldId
  op: Op
  right?: FieldId | null
  value: number
}

export const conditionFields = (c: Condition): FieldId[] => (c.right ? [c.left, c.right] : [c.left])

export type ScreenSort = 'CLOSEST' | 'EXTREME' | 'CHANGE_DESC' | 'CHANGE_ASC' | 'MCAP_DESC' | 'NAME'
export const SORTS: { id: ScreenSort; label: string }[] = [
  { id: 'CLOSEST', label: 'Koşula en yakın' },
  { id: 'EXTREME', label: 'En uç değer' },
  { id: 'CHANGE_DESC', label: 'En çok yükselen' },
  { id: 'CHANGE_ASC', label: 'En çok düşen' },
  { id: 'MCAP_DESC', label: 'Piyasa değeri' },
  { id: 'NAME', label: 'Ada göre' },
]

export interface Screen {
  id: string
  name: string
  universe: Universe
  /** Yalnızca Listem için: tek kategori (null = tümü). */
  category?: Category | null
  currency: ScreenCurrency
  conditions: Condition[]
  /** true: tüm koşullar; false: herhangi biri */
  matchAll: boolean
  sort: ScreenSort
  limit: number
  /** Listemde endeks, döviz vb. hariç. */
  onlyStocks: boolean
}

export const usesHistory = (s: Screen) => s.conditions.some((c) => conditionFields(c).some(needsHistory))

export interface ScreenRow {
  symbol: string
  name: string
  price?: number
  change?: number
  currency?: string
  decimals: number
  /** İlk koşulun sol/sağ oranı ya da sol değeri. */
  score?: number
}

export interface ScreenResult {
  time: number
  rows: ScreenRow[]
  scanned: number
  error?: string
  note?: string
}

// ------------------------------------------------------------------ hazır listeler

const MLR = 1e9
const S = (id: string, name: string, universe: Universe, conditions: Condition[], o: Partial<Screen> = {}): Screen => ({
  id, name, universe, category: null, currency: 'LOCAL', conditions, matchAll: true, sort: 'CLOSEST', limit: 30, onlyStocks: false, ...o,
})
const C = (left: FieldId, op: Op, right: FieldId | null, value: number): Condition => ({ left, op, right, value })

export const SCREEN_TEMPLATES: Screen[] = [
  S('d_bist_5y_usd', '5 yıllık dibe yakın BIST ($)', 'BIST', [C('PRICE', 'LTE', 'LOW_5Y', 10)], { currency: 'USD' }),
  S('d_my_us_sma200', '200 günlük ortalama civarı (listemdeki ABD)', 'MY_LIST', [C('PRICE', 'LT', 'SMA200', 5)], { category: 'US' }),
  S('d_bist_movers', 'Günün yıldızları (BIST)', 'BIST', [C('CHANGE', 'GTE', null, 4), C('MCAP', 'GT', null, 5 * MLR)], { sort: 'CHANGE_DESC', limit: 10 }),
  S('d_bist_oversold_big', 'Yükselen trendde aşırı satılmış BIST devleri', 'BIST', [
    C('RSI', 'LT', null, 35), C('MCAP', 'GT', null, 50 * MLR), C('PRICE', 'GT', 'SMA200', 0),
  ], { limit: 20 }),
  S('d_bist_trend_cheap', 'Trendde ve ucuz (BIST)', 'BIST', [
    C('PE', 'LT', null, 10), C('PE', 'GT', null, 0), C('PRICE', 'GT', 'SMA200', 0), C('SMA50', 'GT', 'SMA200', 0), C('MCAP', 'GT', null, 10 * MLR),
  ], { sort: 'MCAP_DESC', limit: 20 }),
  S('d_bist_52w_high', 'Zirveye yakın BIST hisseleri', 'BIST', [C('PRICE', 'GTE', 'HIGH_52W', -5), C('MCAP', 'GT', null, 20 * MLR)], { limit: 20 }),
  S('d_us_megacap_dip', 'Düşüşteki ABD devleri', 'US', [C('PRICE', 'LTE', 'LOW_52W', 25), C('MCAP', 'GT', null, 100 * MLR)], { limit: 20 }),
  S('d_my_pe_half', 'F/K’sı 5 yıllık ortalamasının yarısına inenler (listem)', 'MY_LIST', [
    C('PE', 'LTE', 'PE_5Y_AVG', -50), C('PE', 'GT', null, 0),
  ], { sort: 'EXTREME', onlyStocks: true }),
  S('d_bist_pe_hist_cheap', 'Tarihine göre ucuzlamış BIST devleri', 'BIST', [
    C('PE', 'LTE', 'PE_5Y_AVG', -40), C('PE', 'GT', null, 0), C('MCAP', 'GT', null, 50 * MLR),
  ], { sort: 'EXTREME', limit: 20 }),
  S('d_us_pe_hist_cheap', 'Tarihine göre ucuz, trendi yukarı ABD devleri', 'US', [
    C('PE', 'LTE', 'PE_5Y_AVG', -25), C('PE', 'GT', null, 0), C('MCAP', 'GT', null, 50 * MLR), C('PRICE', 'GT', 'SMA200', 0),
  ], { sort: 'EXTREME', limit: 20 }),
  S('d_bist_fwd_growth', 'Kârı artması beklenen ucuz BIST', 'BIST', [
    C('FWD_PE', 'LTE', 'PE', -30), C('FWD_PE', 'GT', null, 0), C('PE', 'GT', null, 0), C('PE', 'LT', null, 15), C('MCAP', 'GT', null, 20 * MLR),
  ], { sort: 'EXTREME', limit: 20 }),
  S('d_bist_below_book', 'Defter değerinin altında, kârlı BIST', 'BIST', [
    C('PB', 'LT', null, 1), C('PB', 'GT', null, 0), C('ROE', 'GT', null, 10), C('MCAP', 'GT', null, 30 * MLR),
  ], { limit: 20 }),
  S('d_bist_dividend', 'Yüksek temettü verimli BIST', 'BIST', [C('DIV_YIELD', 'GTE', null, 4), C('MCAP', 'GT', null, 20 * MLR)], { limit: 20 }),
  S('d_us_quality', 'Kaliteli ve makul fiyatlı ABD devleri', 'US', [
    C('ROE', 'GT', null, 15), C('NET_MARGIN', 'GT', null, 15), C('DEBT_EQ', 'LT', null, 1), C('PE', 'GT', null, 0), C('PE', 'LT', null, 35), C('MCAP', 'GT', null, 100 * MLR),
  ], { sort: 'MCAP_DESC', limit: 20 }),
  S('d_us_growth_dip', 'Büyüyen, trendde geri çekilen ABD devleri', 'US', [
    C('RSI', 'LT', null, 40), C('PRICE', 'GT', 'SMA200', 0), C('EPS_CAGR_5Y', 'GT', null, 20), C('MCAP', 'GT', null, 50 * MLR),
  ], { limit: 20 }),
  // Geçmişte test edilerek bulunanlar (web/README: Hazır listelerin araştırması)
  S('d_bist_usd_high', 'Dolar bazında zirvesindeki BIST', 'BIST', [C('PRICE', 'GTE', 'HIGH_52W', -5), C('MCAP', 'GT', null, 5 * MLR)], { currency: 'USD', limit: 20 }),
  S('d_bist_pb_trend', 'Defter değerine yakın, yükselen BIST', 'BIST', [
    C('PB', 'LT', null, 1.5), C('PB', 'GT', null, 0), C('PRICE', 'GT', 'SMA50', 0), C('MCAP', 'GT', null, 30 * MLR),
  ], { limit: 20 }),
  S('d_us_pb_trend', 'Defter değerine göre makul, trendde ABD devleri', 'US', [
    C('PB', 'LT', null, 2), C('PB', 'GT', null, 0), C('PRICE', 'GT', 'SMA200', 0), C('MCAP', 'GT', null, 100 * MLR),
  ], { limit: 20 }),
]

/** Hazır listelerin sürümü: bir hazır liste değiştiğinde ya da eklendiğinde artar. */
export const TEMPLATES_REVISION = 2

/** Önceki sürümlerdeki koşullar: kullanıcı değiştirmediyse yenisiyle güncellenir. */
export const PREVIOUS_TEMPLATE_CONDITIONS: Record<string, Condition[][]> = {
  d_bist_oversold_big: [[C('RSI', 'LT', null, 35), C('MCAP', 'GT', null, 50 * MLR)]],
  d_us_megacap_dip: [[C('PRICE', 'LTE', 'LOW_52W', 15), C('MCAP', 'GT', null, 100 * MLR)]],
  d_us_pe_hist_cheap: [[C('PE', 'LTE', 'PE_5Y_AVG', -25), C('PE', 'GT', null, 0), C('MCAP', 'GT', null, 100 * MLR)]],
  d_bist_below_book: [[C('PB', 'LT', null, 1), C('PB', 'GT', null, 0), C('ROE', 'GT', null, 10), C('MCAP', 'GT', null, 10 * MLR)]],
  d_bist_dividend: [[C('DIV_YIELD', 'GTE', null, 6), C('MCAP', 'GT', null, 20 * MLR)]],
  d_us_quality: [[C('ROE', 'GT', null, 20), C('NET_MARGIN', 'GT', null, 15), C('DEBT_EQ', 'LT', null, 1), C('PE', 'GT', null, 0), C('PE', 'LT', null, 25), C('MCAP', 'GT', null, 100 * MLR)]],
  d_us_growth_dip: [[C('PRICE', 'LT', 'SMA200', 0), C('EPS_CAGR_5Y', 'GT', null, 15), C('MCAP', 'GT', null, 50 * MLR)]],
}
/** Sürümde eklenen hazır listeler (mevcut kullanıcılara bir kez eklenir) */
export const TEMPLATES_ADDED: Record<number, string[]> = { 2: ['d_bist_usd_high', 'd_bist_pb_trend', 'd_us_pb_trend'] }

const sameConditions = (a: Condition[], b: Condition[]) =>
  a.length === b.length && a.every((x, i) => x.left === b[i].left && x.op === b[i].op && (x.right ?? null) === (b[i].right ?? null) && x.value === b[i].value)

/**
 * Kayıtlı listeleri yeni hazır liste sürümüne taşır: koşulları değiştirilmemiş hazır listeler güncellenir
 * (kullanıcının verdiği ad korunur), yeni hazırlar eklenir. Kullanıcının değiştirdiği listelere dokunulmaz.
 */
export function upgradeTemplates(screens: Screen[], fromRevision: number): Screen[] {
  if (fromRevision >= TEMPLATES_REVISION) return screens
  const out = screens.map((s) => {
    const t = SCREEN_TEMPLATES.find((x) => x.id === s.id)
    const old = PREVIOUS_TEMPLATE_CONDITIONS[s.id]
    if (!t || !old?.some((c) => sameConditions(c, s.conditions))) return s
    const renamed = s.name !== (OLD_NAMES[s.id] ?? t.name)
    return { ...structuredClone(t), name: renamed ? s.name : t.name, limit: s.limit, sort: s.sort }
  })
  for (let r = fromRevision + 1; r <= TEMPLATES_REVISION; r++) {
    for (const id of TEMPLATES_ADDED[r] ?? []) if (!out.some((s) => s.id === id)) out.push(structuredClone(SCREEN_TEMPLATES.find((x) => x.id === id)!))
  }
  return out
}
const OLD_NAMES: Record<string, string> = {
  d_bist_oversold_big: 'Aşırı satılmış BIST devleri',
  d_us_pe_hist_cheap: 'Tarihine göre ucuzlamış ABD devleri',
  d_us_growth_dip: 'Büyüyen ama geri çekilen ABD devleri',
}

export const defaultScreens = (): Screen[] => structuredClone(SCREEN_TEMPLATES)

// ------------------------------------------------------------------ motor

export interface Row {
  symbol: string
  name: string
  currency?: string
  pricescale?: number
  values: Partial<Record<FieldId, number | undefined>>
  /** Yıllık seyreltilmiş EPS, en yeni önce. */
  epsFy?: (number | undefined)[]
  /** Son mali yıl sonu (epoch saniye). */
  fyEnd?: number
  /** Yıllık gelir, en yeni önce (geçmişte test için). */
  revenueFy?: (number | undefined)[]
  /** Geçmişte test için yıllık bilanço dizileri (en yeni önce) ve bugünkü firma değeri. */
  fund?: Fundamentals
}

export interface Fundamentals {
  ebitdaFy?: (number | undefined)[]
  dpsFy?: (number | undefined)[]
  netIncomeFy?: (number | undefined)[]
  debtFy?: (number | undefined)[]
  ev?: number
  /** Bilanço para birimi (fiyatınkinden farklıysa oranlar hesaplanmaz) */
  currency?: string
}

export interface HistoryStats { low?: number; high?: number; peAvg?: number }
/** Aylık çubuk; zaman epoch saniye. */
export interface Bar { time: number; low?: number; high?: number; close?: number }

const monthKey = (sec: number) => {
  const d = new Date(sec * 1000)
  return d.getUTCFullYear() * 12 + d.getUTCMonth()
}

/**
 * Aylık çubuklardan 5 yıllık en düşük/en yüksek. [fx] verilirse her ay o ayın kur kapanışına
 * bölünerek USD'ye çevrilir. Kuru bulunamayan ay atlanır.
 */
export function historyStats(bars: Bar[], fx?: Bar[] | null, since?: number): HistoryStats {
  if (!bars.length) return {}
  const fxByMonth = fx ? new Map(fx.filter((b) => (b.close ?? 0) > 0).map((b) => [monthKey(b.time), b.close!])) : null
  let low: number | undefined
  let high: number | undefined
  for (const b of bars) {
    if (since != null && b.time < since) continue
    let div = 1
    if (fxByMonth) {
      const r = fxByMonth.get(monthKey(b.time))
      if (r == null) continue
      div = r
    }
    if ((b.low ?? 0) > 0) { const x = b.low! / div; if (low == null || x < low) low = x }
    if ((b.high ?? 0) > 0) { const x = b.high! / div; if (high == null || x > high) high = x }
  }
  return { low, high }
}

/**
 * 5 yıllık ortalama F/K: her mali yıl için (yıl sonu ayının kapanışı ÷ o yılın EPS'i).
 * Zararlı, F/K'sı anlamsız (> maxPe) ya da fiyatı bulunamayan yıllar atlanır; en az [minYears] yıl.
 */
export function peAverage(bars: Bar[], epsFy: (number | undefined)[] | undefined, fyEnd: number | undefined, years = 5, minYears = 3, maxPe = 100): number | undefined {
  if (fyEnd == null || !epsFy?.length) return undefined
  const closeByMonth = new Map(bars.filter((b) => (b.close ?? 0) > 0).map((b) => [monthKey(b.time), b.close!]))
  const end = monthKey(fyEnd)
  const pes: number[] = []
  for (let k = 0; k < years; k++) {
    const eps = epsFy[k]
    if (eps == null || eps <= 0) continue
    const price = closeByMonth.get(end - 12 * k)
    if (price == null) continue
    const pe = price / eps
    if (pe <= maxPe) pes.push(pe)
  }
  return pes.length >= minYears ? pes.reduce((a, b) => a + b, 0) / pes.length : undefined
}

/** Yıllık dizilerden türetilen alanlar (diziler en yeni önce). */
export function derived(close: number | undefined, epsFy: (number | undefined)[], revenueFy: (number | undefined)[], epsForecast: number | undefined) {
  const growth = (now?: number, base?: number) => (now != null && base != null && base > 0 ? (now / base - 1) * 100 : undefined)
  const e0 = epsFy[0]
  const e5 = epsFy[5]
  return {
    EPS_GROWTH_1Y: growth(e0, epsFy[1]),
    EPS_CAGR_5Y: e0 != null && e5 != null && e0 > 0 && e5 > 0 ? ((e0 / e5) ** (1 / 5) - 1) * 100 : undefined,
    REV_GROWTH_1Y: growth(revenueFy[0], revenueFy[1]),
    FWD_PE: close != null && epsForecast != null && epsForecast > 0 ? close / epsForecast : undefined,
  } satisfies Partial<Record<FieldId, number | undefined>>
}

/** Para birimine çevrilmiş değer. Fiyat cinsinden alanlar USD modunda TRY ise kura bölünür. */
export function valueOf(row: Row, id: FieldId, screen: Screen, usdTry: number | undefined, history: Map<string, HistoryStats>): number | undefined {
  let raw: number | undefined
  if (id === 'LOW_5Y') raw = history.get(row.symbol)?.low
  else if (id === 'HIGH_5Y') raw = history.get(row.symbol)?.high
  else if (id === 'PE_5Y_AVG') raw = history.get(row.symbol)?.peAvg
  else raw = row.values[id]
  if (raw == null) return undefined
  if (needsHistory(id)) return raw
  if (screen.currency === 'USD' && field(id).kind === 'PRICE' && row.currency === 'TRY') {
    return usdTry && usdTry > 0 ? raw / usdTry : undefined
  }
  return raw
}

export function rightOf(c: Condition, row: Row, screen: Screen, usdTry: number | undefined, history: Map<string, HistoryStats>) {
  if (c.right) {
    const v = valueOf(row, c.right, screen, usdTry, history)
    return v == null ? undefined : v * (1 + c.value / 100)
  }
  return c.value
}

export function test(c: Condition, row: Row, screen: Screen, usdTry: number | undefined, history: Map<string, HistoryStats>) {
  const l = valueOf(row, c.left, screen, usdTry, history)
  const r = rightOf(c, row, screen, usdTry, history)
  return l != null && r != null && testOp(c.op, l, r)
}

export function matches(row: Row, screen: Screen, usdTry: number | undefined, history: Map<string, HistoryStats>) {
  if (!screen.conditions.length) return true
  const results = screen.conditions.map((c) => test(c, row, screen, usdTry, history))
  return screen.matchAll ? results.every(Boolean) : results.some(Boolean)
}

/** Geçmiş gerektirmeyen koşullarla ön eleme. */
export function preFilter(row: Row, screen: Screen, usdTry: number | undefined) {
  if (!screen.matchAll) return true
  return screen.conditions
    .filter((c) => !conditionFields(c).some(needsHistory))
    .every((c) => test(c, row, screen, usdTry, new Map()))
}

/** Yakınlık ölçüsü (ilk koşula göre): alanla karşılaştırmada sol / referans, sayıyla karşılaştırmada sol. */
export function score(row: Row, screen: Screen, usdTry: number | undefined, history: Map<string, HistoryStats>) {
  const c = screen.conditions[0]
  if (!c) return undefined
  const l = valueOf(row, c.left, screen, usdTry, history)
  if (l == null) return undefined
  if (!c.right) return l
  const base = valueOf(row, c.right, screen, usdTry, history)
  if (base == null || base === 0) return undefined
  return l / base
}

function decimalsFor(price: number | undefined, pricescale: number | undefined, converted: boolean) {
  if (converted || pricescale == null || pricescale < 1) {
    const p = Math.abs(price ?? 0)
    if (price == null) return 2
    return p >= 1000 ? 0 : p >= 10 ? 2 : p >= 1 ? 3 : 4
  }
  return Math.min(4, Math.max(0, Math.trunc(Math.log10(pricescale))))
}

export function evaluate(rows: Row[], screen: Screen, usdTry: number | undefined, history: Map<string, HistoryStats>, now = Date.now(), note?: string): ScreenResult {
  const matched = rows.filter((r) => matches(r, screen, usdTry, history)).map((r) => ({ row: r, s: score(r, screen, usdTry, history) }))
  const first = screen.conditions[0]
  const asc = (f: (x: typeof matched[0]) => number) => (a: typeof matched[0], b: typeof matched[0]) => f(a) - f(b)
  const MAX = Number.MAX_VALUE
  let sorted = matched
  switch (screen.sort) {
    case 'CLOSEST':
      if (!first) break
      if (first.right) sorted = [...matched].sort(asc((x) => (x.s == null ? MAX : Math.abs(x.s - 1))))
      else if (first.op === 'GT' || first.op === 'GTE') sorted = [...matched].sort(asc((x) => -(x.s ?? -MAX)))
      else sorted = [...matched].sort(asc((x) => x.s ?? MAX))
      break
    case 'EXTREME':
      if (!first) break
      if (first.op === 'GT' || first.op === 'GTE') sorted = [...matched].sort(asc((x) => -(x.s ?? -MAX)))
      else sorted = [...matched].sort(asc((x) => x.s ?? MAX))
      break
    case 'CHANGE_DESC': sorted = [...matched].sort(asc((x) => -(x.row.values.CHANGE ?? -1e9))); break
    case 'CHANGE_ASC': sorted = [...matched].sort(asc((x) => x.row.values.CHANGE ?? 1e9)); break
    case 'MCAP_DESC': sorted = [...matched].sort(asc((x) => -(x.row.values.MCAP ?? 0))); break
    case 'NAME': sorted = [...matched].sort((a, b) => a.row.name.localeCompare(b.row.name, 'tr')); break
  }
  const usd = screen.currency === 'USD'
  const out = sorted.slice(0, Math.min(200, Math.max(1, screen.limit))).map(({ row, s }) => {
    const price = valueOf(row, 'PRICE', screen, usdTry, history)
    return {
      symbol: row.symbol,
      name: row.name,
      price,
      change: row.values.CHANGE,
      currency: usd ? 'USD' : row.currency,
      decimals: decimalsFor(price, row.pricescale, usd && row.currency === 'TRY'),
      score: s,
    } satisfies ScreenRow
  })
  return { time: now, rows: out, scanned: rows.length, note }
}

/** Ön ek / son ek: "$12,34" · "71,34 ₺" */
export function units(currency?: string): [string, string] {
  switch (currency) {
    case 'USD': case 'USDT': case 'USDC': return ['$', '']
    case 'TRY': return ['', '₺']
    case 'EUR': return ['€', '']
    case undefined: case null: case '': return ['', '']
    default: return ['', currency]
  }
}

/** "Fiyat ≤ 5 yıl en düşük +%10" · "Piyasa değeri > 5 mlr" */
export function describe(c: Condition): string {
  let right: string
  if (c.right) {
    const d = c.value % 1 === 0 ? 0 : 1
    const off = c.value > 0 ? ' +%' + Fmt.number(c.value, d) : c.value < 0 ? ' −%' + Fmt.number(-c.value, d) : ''
    right = field(c.right).label + off
  } else if (field(c.left).kind === 'MONEY') right = Fmt.money(c.value)
  else right = Fmt.number(c.value, c.value % 1 === 0 ? 0 : 2)
  return `${field(c.left).label} ${opSymbol(c.op)} ${right}`
}

/** Sonuç satırının koşula uzaklığı: "5 yıl en düşük: %4,2 üstünde" · "RSI (14): 24,1" */
export function metricText(row: ScreenRow, screen: Screen): string | undefined {
  const c = screen.conditions[0]
  if (!c || row.score == null) return undefined
  const s = row.score
  if (!c.right) {
    const f = field(c.left)
    if (f.kind === 'MONEY') return `${f.label}: ${Fmt.money(s)}`
    return `${f.label}: ${Fmt.number(s, Math.abs(s) >= 100 ? 0 : 1)}`
  }
  const pct = (s - 1) * 100
  const label = field(c.right).label
  if (Math.abs(pct) < 0.05) return `${label} seviyesinde`
  return pct > 0 ? `${label}: %${Fmt.number(pct, 1)} üstünde` : `${label}: %${Fmt.number(-pct, 1)} altında`
}

export function summary(s: Screen): string {
  const where = s.universe === 'MY_LIST' && s.category ? `Listem, ${categoryName(s.category)}` : UNIVERSES.find((u) => u.id === s.universe)!.label
  return [where, s.currency === 'USD' ? 'USD' : null, `${s.conditions.length} koşul`].filter(Boolean).join(', ')
}

const CATEGORY_NAMES: Record<Category, string> = { FX: 'Döviz', COMMODITY: 'Emtia', TR: 'Türkiye', US: 'Amerika', CRYPTO: 'Kripto', ECONOMY: 'Ekonomi', WORLD: 'Dünya' }
const categoryName = (c: Category) => CATEGORY_NAMES[c]

/**
 * Sunucuda ön eleme: alan–sayı karşılaştırmaları (USD'ye çevrilmesi gerekmeyenler) ve alan–alan (+%0).
 */
export function serverFilters(screen: Screen): { left: string; operation: string; right: number | string }[] {
  if (!screen.matchAll) return []
  const out: { left: string; operation: string; right: number | string }[] = []
  for (const c of screen.conditions) {
    const left = field(c.left).column
    if (!left) continue
    const operation = { LT: 'less', LTE: 'eless', GT: 'greater', GTE: 'egreater' }[c.op]
    if (!c.right && !(screen.currency === 'USD' && field(c.left).kind === 'PRICE')) out.push({ left, operation, right: c.value })
    else if (c.right && field(c.right).column && c.value === 0) out.push({ left, operation, right: field(c.right).column! })
  }
  return out
}
