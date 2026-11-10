/**
 * Dinamik listeyi çalıştırır: TradingView taraması (evren + sunucuda ön filtre) → gerekiyorsa aylık
 * geçmiş (yalnızca ön elemeden geçen ilk 60 aday) → tarama motoru.
 */
import { CATALOG, prettyName } from '../core/catalog'
import type { Instrument } from '../core/models'
import {
  conditionFields, derived, evaluate, field, historyStats, peAverage, preFilter, serverFilters, usesHistory,
  type FieldId, type HistoryStats, type Row, type Screen, type ScreenResult,
} from '../core/screener'
import { historySource, monthlyBars } from './history'
import { scan, type ScanRow } from './tv'

export const BASE_SCAN_COLUMNS = ['name', 'description', 'currency', 'pricescale', 'type']
const BASE_COLUMNS = BASE_SCAN_COLUMNS
const STOCK_TYPES = new Set(['stock', 'dr'])
const HISTORY_CANDIDATES = 60
export const FUNDAMENTAL_COLUMNS = ['earnings_per_share_diluted_fy_h', 'total_revenue_fy_h', 'earnings_per_share_forecast_next_fy', 'fiscal_period_end_fy', 'fundamental_currency_code']
const COL_EPS_FY = 'earnings_per_share_diluted_fy_h'
const COL_REV_FY = 'total_revenue_fy_h'
const COL_EPS_FWD = 'earnings_per_share_forecast_next_fy'
const COL_FY_END = 'fiscal_period_end_fy'
const COL_FUND_CCY = 'fundamental_currency_code'

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
const arr = (v: unknown) => (Array.isArray(v) ? v.map(num) : [])

interface Ctx { instruments: Instrument[]; usdTry?: number }

export async function runScreen(screen: Screen, ctx: Ctx, signal?: AbortSignal): Promise<ScreenResult> {
  const all = screen.conditions.flatMap(conditionFields)
  const fields = [...new Set<FieldId>([...all, 'PRICE', 'CHANGE', 'MCAP'])].filter((f) => field(f).source !== 'HISTORY')
  const fundamentals = all.some((f) => field(f).source === 'DERIVED' || f === 'PE_5Y_AVG')
  const extra = fundamentals ? [COL_EPS_FY, COL_REV_FY, COL_EPS_FWD, COL_FY_END, COL_FUND_CCY] : []
  const columns = [...BASE_COLUMNS, ...fields.map((f) => field(f).column).filter((c): c is string => !!c), ...extra]

  const rows = await fetchRows(screen, ctx, fields, columns, signal)
  if (!rows.length && screen.universe === 'MY_LIST') {
    return { time: Date.now(), rows: [], scanned: 0, note: screen.onlyStocks ? 'Listende hisse yok; hisse ekledikçe burada taranır.' : 'Listende uygun sembol yok.' }
  }
  const needsFx = screen.currency === 'USD' && rows.some((r) => r.currency === 'TRY')
  const usdTry = needsFx ? ctx.usdTry ?? (await fetchUsdTry(signal)) : undefined
  if (needsFx && !usdTry) return { time: Date.now(), rows: [], scanned: rows.length, error: 'Dolar/TL kuru alınamadı' }

  let note: string | undefined
  const history = new Map<string, HistoryStats>()
  if (usesHistory(screen)) {
    const src = await historySource()
    if (src === 'none') {
      return {
        time: Date.now(), rows: [], scanned: rows.length,
        error: 'Bu liste 5 yıllık fiyat geçmişi istiyor; bu yayında geçmiş verisi yok.',
      }
    }
    const needsPe = all.includes('PE_5Y_AVG')
    const candidates = rows
      .filter((r) => preFilter(r, screen, usdTry))
      .filter((r) => !needsPe || (r.fyEnd != null && (r.epsFy ?? []).filter((e) => e != null && e > 0).length >= 3))
      .sort((a, b) => (b.values.MCAP ?? 0) - (a.values.MCAP ?? 0))
      .slice(0, HISTORY_CANDIDATES)
    const fx = screen.currency === 'USD' && candidates.some((r) => r.currency === 'TRY') ? await monthlyBars('FX:USDTRY') : undefined
    if (screen.currency === 'USD' && !fx && candidates.some((r) => r.currency === 'TRY')) {
      return { time: Date.now(), rows: [], scanned: rows.length, error: 'Dolar/TL geçmişi alınamadı' }
    }
    const since = Date.UTC(new Date().getUTCFullYear() - 5, new Date().getUTCMonth(), 1) / 1000
    let failed = 0
    let next = 0
    const worker = async () => {
      while (next < candidates.length) {
        const r = candidates[next++]
        const bars = await monthlyBars(r.symbol)
        if (!bars) { failed++; continue }
        history.set(r.symbol, {
          ...historyStats(bars, r.currency === 'TRY' ? fx : null, since),
          peAvg: needsPe ? peAverage(bars, r.epsFy, r.fyEnd) : undefined,
        })
      }
    }
    await Promise.all(Array.from({ length: src === 'proxy' ? 6 : 1 }, worker))
    if (candidates.length && failed === candidates.length) {
      return { time: Date.now(), rows: [], scanned: rows.length, error: 'Fiyat geçmişi alınamadı' }
    }
    if (candidates.length) note = `Geçmiş fiyatlar Yahoo Finance’ten${src === 'snapshot' ? ' (günlük güncellenir)' : ''}; ön elemeden geçen ilk ${candidates.length} sembol`
    if (failed && note) note += `, ${failed} sembolün geçmişi yok`
  }
  return evaluate(rows, screen, usdTry, history, Date.now(), note)
}

async function fetchUsdTry(signal?: AbortSignal) {
  try {
    const rows = await scan('global', { symbols: { tickers: ['FX:USDTRY'] }, columns: ['close'] }, signal)
    return num(rows[0]?.d[0])
  } catch {
    return undefined
  }
}

/**
 * Evrendeki satırlar. [backtest] için bugünkü değerlere göre sunucuda ön eleme yapılmaz
 * (geçmişte koşulu sağlayıp bugün sağlamayanlar da gerekir) ve ABD evreni en büyük 400 hisseyle sınırlanır.
 */
export async function fetchUniverse(screen: Screen, ctx: Ctx, fields: FieldId[], columns: string[], signal?: AbortSignal, backtest = false): Promise<Row[]> {
  return fetchRows(screen, ctx, fields, columns, signal, backtest)
}

async function fetchRows(screen: Screen, ctx: Ctx, fields: FieldId[], columns: string[], signal?: AbortSignal, backtest = false): Promise<Row[]> {
  const parse = (data: ScanRow[]) => data.map((r) => parseRow(r, screen, ctx, fields, columns)).filter((r): r is Row => !!r)
  if (screen.universe === 'MY_LIST') {
    const tickers = ctx.instruments.filter((i) => !screen.category || i.category === screen.category).map((i) => i.symbol)
    if (!tickers.length) return []
    // BIST sembolleri "turkey" ucundan: "global" uç piyasa değerini ve tahminleri USD'ye çeviriyor
    const bist = tickers.filter((t) => t.toUpperCase().startsWith('BIST:'))
    const other = tickers.filter((t) => !t.toUpperCase().startsWith('BIST:'))
    const parts = await Promise.all(
      ([['turkey', bist], ['global', other]] as const)
        .filter(([, l]) => l.length)
        .map(([m, l]) => scan(m, { symbols: { tickers: l }, columns }, signal)),
    )
    const order = new Map(tickers.map((t, i) => [t.toUpperCase(), i]))
    return parse(parts.flat()).sort((a, b) => (order.get(a.symbol.toUpperCase()) ?? 1e9) - (order.get(b.symbol.toUpperCase()) ?? 1e9))
  }
  const universe = screen.universe === 'BIST'
    ? [{ left: 'type', operation: 'equal', right: 'stock' }]
    : [
      { left: 'type', operation: 'equal', right: 'stock' },
      { left: 'is_primary', operation: 'equal', right: true },
      { left: 'market_cap_basic', operation: 'egreater', right: 2e9 },
    ]
  const body = {
    filter: [...universe, ...(backtest ? [] : serverFilters(screen))],
    columns,
    range: [0, screen.universe === 'BIST' ? 800 : backtest ? 400 : 1500],
    sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' },
  }
  return parse(await scan(screen.universe === 'BIST' ? 'turkey' : 'america', body, signal))
}

export function parseRow(r: ScanRow, screen: Screen, ctx: Ctx, fields: FieldId[], columns: string[]): Row | undefined {
  const at = (col: string) => {
    const i = columns.indexOf(col)
    return i < 0 ? undefined : r.d[i]
  }
  if (screen.onlyStocks && !STOCK_TYPES.has(str(at('type')) ?? '')) return undefined
  const values: Row['values'] = {}
  for (const f of fields) {
    const c = field(f).column
    if (c) values[f] = num(at(c))
  }
  const epsFy = arr(at(COL_EPS_FY))
  if (columns.includes(COL_EPS_FY)) {
    const currency = str(at('currency'))
    const fundCcy = str(at(COL_FUND_CCY))
    // Tahmin başka para biriminde raporlanıyorsa beklenen F/K hesaplanmaz
    const forecast = !fundCcy || !currency || fundCcy === currency ? num(at(COL_EPS_FWD)) : undefined
    const d = derived(values.PRICE, epsFy, arr(at(COL_REV_FY)), forecast)
    for (const f of fields) if (field(f).source === 'DERIVED') values[f] = d[f as keyof typeof d]
  }
  const ticker = str(at('name')) ?? r.s.split(':').pop()!
  return {
    symbol: r.s,
    name: CATALOG.find((i) => i.symbol.toUpperCase() === r.s.toUpperCase())?.name
      ?? ctx.instruments.find((i) => i.symbol.toUpperCase() === r.s.toUpperCase())?.name
      ?? prettyName(str(at('description')), ticker),
    currency: str(at('currency')),
    pricescale: num(at('pricescale')),
    values,
    epsFy,
    fyEnd: num(at(COL_FY_END)),
    revenueFy: columns.includes(COL_REV_FY) ? arr(at(COL_REV_FY)) : undefined,
  }
}
