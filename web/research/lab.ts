/**
 * Araştırma düzeneği: statik kopya (günlük + aylık) ve TradingView temel verileriyle listeleri
 * eğitim / sınama dönemlerinde değerlendirir. Aynı motor (core/backtest) ve aynı skor kullanılır.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { reliability, runBacktest, type BtResult, type BtSymbol, type Reliability } from '../src/core/backtest'
import { FIELDS, type Screen } from '../src/core/screener'
import { unpack } from '../src/data/daily'
import { parseRow } from '../src/data/screens'

/** Statik kopya klasörü (daily/, history/): `node scripts/snapshot.mjs research/out/data` ile üretilir */
export const DATA = process.env.LAB_DATA ?? 'research/out/data'
/** TradingView temel veri taraması önbelleği (silinince yeniden çekilir) */
const CACHE = process.env.LAB_CACHE ?? 'research/out/fundamentals.json'

const COLUMNS = ['name', 'description', 'currency', 'pricescale', 'type',
  ...FIELDS.map((f) => f.column).filter((c): c is string => !!c),
  'earnings_per_share_diluted_fy_h', 'total_revenue_fy_h', 'earnings_per_share_forecast_next_fy', 'fiscal_period_end_fy', 'fundamental_currency_code',
  'ebitda_fy_h', 'dps_common_stock_prim_issue_fy_h', 'net_income_fy_h', 'total_debt_fy_h', 'enterprise_value_current']

async function scanAll() {
  if (existsSync(CACHE)) return JSON.parse(readFileSync(CACHE, 'utf8'))
  const post = async (market: string, body: unknown) => (await (await fetch(`https://scanner.tradingview.com/${market}/scan`, { method: 'POST', body: JSON.stringify(body) })).json()).data
  const bist = await post('turkey', { filter: [{ left: 'type', operation: 'equal', right: 'stock' }], columns: COLUMNS, range: [0, 900], sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' } })
  const us = await post('america', { filter: [{ left: 'type', operation: 'equal', right: 'stock' }, { left: 'is_primary', operation: 'equal', right: true }, { left: 'market_cap_basic', operation: 'egreater', right: 2e9 }], columns: COLUMNS, range: [0, 400], sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' } })
  const v = { bist, us }
  mkdirSync(dirname(CACHE), { recursive: true })
  writeFileSync(CACHE, JSON.stringify(v))
  return v
}

const read = (p: string) => JSON.parse(readFileSync(`${DATA}/${p}`, 'utf8')).bars

export interface Lab {
  universe: Record<'BIST' | 'US', BtSymbol[]>
  bench: Record<'BIST' | 'US', { symbol: string; name: string; series: NonNullable<ReturnType<typeof unpack>> }>
  usdTry: NonNullable<ReturnType<typeof unpack>>
  lastDay: number
}

let lab: Lab | null = null
export async function loadLab(): Promise<Lab> {
  if (lab) return lab
  const scans = await scanAll()
  const daily = { BIST: read('daily/bist.json'), US: read('daily/us.json') }
  const monthly = { BIST: read('history/bist.json'), US: read('history/us.json') }
  const misc = read('daily/misc.json')
  const any: Screen = { id: 'x', name: 'x', universe: 'BIST', category: null, currency: 'LOCAL', conditions: [], matchAll: true, sort: 'CLOSEST', limit: 30, onlyStocks: false }
  const fields = FIELDS.filter((f) => f.source !== 'HISTORY').map((f) => f.id)
  const build = (u: 'BIST' | 'US', rows: { s: string; d: unknown[] }[]) => rows.map((r) => {
    const row = parseRow(r, { ...any, universe: u }, { instruments: [] }, fields, COLUMNS)
    const p = daily[u][r.s]
    if (!row || !p) return null
    return {
      symbol: row.symbol, name: row.name, currency: row.currency, pricescale: row.pricescale,
      series: unpack(p)!, now: row.values, epsFy: row.epsFy, revenueFy: row.revenueFy, fyEnd: row.fyEnd, fund: row.fund,
      monthly: monthly[u][r.s]?.map(([time, low, high, close]: (number | null)[]) => ({ time, low: low ?? undefined, high: high ?? undefined, close: close ?? undefined })),
    } satisfies BtSymbol
  }).filter((x): x is BtSymbol => !!x)
  const universe = { BIST: build('BIST', scans.bist), US: build('US', scans.us) }
  const xu = unpack(misc['BIST:XU100'])!
  lab = {
    universe,
    bench: { BIST: { symbol: 'BIST:XU100', name: 'BIST 100', series: xu }, US: { symbol: 'SP:SPX', name: 'S&P 500', series: unpack(misc['SP:SPX'])! } },
    usdTry: unpack(misc['FX:USDTRY'])!,
    lastDay: xu.days[xu.days.length - 1],
  }
  return lab
}

const DAY = 86400_000
export const iso = (d: number) => new Date(d * DAY).toISOString().slice(0, 10)

/** Dönemler (epoch gün): eğitim, sınama (son 1 yıl), tümü (son 3 yıl). Eğitim sınamadan 3 ay önce biter (sonuç sızmasın). */
export function periods(l: Lab) {
  const end = l.lastDay
  const testStart = end - 365
  return {
    train: { start: end - 3 * 365, end: testStart - 92 },
    test: { start: testStart, end },
    all: { start: end - 3 * 365, end },
  }
}

export interface Eval { r: BtResult; rel: Reliability }

export async function evaluate(screen: Screen, period: { start: number; end: number }): Promise<Eval> {
  const l = await loadLab()
  const u = screen.universe === 'US' ? 'US' : 'BIST'
  const r = runBacktest({
    screen, symbols: l.universe[u], startDay: period.start, endDay: period.end,
    benchmark: l.bench[u], usdTry: screen.currency === 'USD' ? l.usdTry : undefined,
  })
  return { r, rel: reliability(r, screen) }
}

const p = (v?: number) => (v == null ? '   —  ' : ((v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%').padStart(6))
const n = (v?: number, d = 2) => (v == null ? '  — ' : v.toFixed(d).padStart(5))

/** Tek satır özet: skor, ay, giriş, 1A/3A fark ve t, tutarlılık, portföy vs endeks */
export function line(e: Eval) {
  const { r, rel } = e
  return `skor ${String(rel.score ?? '—').padStart(3)} ${rel.label.padEnd(13)} ay ${String(rel.months).padStart(3)} giriş ${String(rel.episodes).padStart(5)}  1A ${p(rel.edge1m)} t${n(rel.t1m)}  3A ${p(rel.edge3m)} t${n(rel.t3m)}  +ay ${p(rel.consistency).replace('+', ' ')}  portföy ${p(r.portfolio.total)} endeks ${p(r.portfolio.bench)} dd ${p(r.portfolio.maxDrawdown)} üye ${n(r.portfolio.avgMembers, 1)}`
}
