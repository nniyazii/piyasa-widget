/**
 * Geçmişte testi hazırlar ve çalıştırır: evren (TradingView) → günlük kapanışlar → (gerekirse) aylık
 * geçmiş → hesap ayrı iş parçacığında (Web Worker). Ana iş parçacığı yalnızca ilerlemeyi gösterir.
 */
import type { BtInput, BtResult, BtSymbol } from '../core/backtest'
import type { Instrument } from '../core/models'
import { conditionFields, field, type FieldId, type Screen } from '../core/screener'
import { dailyCloses } from './daily'
import { monthlyBars } from './history'
import { BASE_SCAN_COLUMNS, FUNDAMENTAL_COLUMNS, fetchUniverse } from './screens'

export type BtStep =
  | { step: 'universe' }
  | { step: 'daily'; done: number; total: number }
  | { step: 'monthly'; done: number; total: number }
  | { step: 'compute'; done: number; total: number }

export interface BtRun { years: number; result: BtResult; benchmarkName?: string; universe: number; missing: number }

const DAY = 86400
const today = () => Math.floor(Date.now() / 1000 / DAY)

function benchmarkFor(screen: Screen, symbols: string[]): { symbol: string; name: string } {
  if (screen.universe === 'BIST') return { symbol: 'BIST:XU100', name: 'BIST 100' }
  if (screen.universe === 'US') return { symbol: 'SP:SPX', name: 'S&P 500' }
  const bist = symbols.filter((s) => s.startsWith('BIST:')).length
  return bist >= symbols.length / 2 ? { symbol: 'BIST:XU100', name: 'BIST 100' } : { symbol: 'SP:SPX', name: 'S&P 500' }
}

export async function runScreenBacktest(screen: Screen, instruments: Instrument[], years: number, onStep: (s: BtStep) => void, signal?: AbortSignal): Promise<BtRun> {
  onStep({ step: 'universe' })
  const used = [...new Set(screen.conditions.flatMap(conditionFields))]
  const direct = [...new Set<FieldId>([...used, 'PRICE', 'MCAP'])].filter((f) => field(f).column)
  const fundamentals = used.some((f) => ['PE', 'PE_5Y_AVG', 'EPS_GROWTH_1Y', 'EPS_CAGR_5Y', 'REV_GROWTH_1Y'].includes(f))
  const columns = [...BASE_SCAN_COLUMNS, ...direct.map((f) => field(f).column!), ...(fundamentals ? FUNDAMENTAL_COLUMNS : [])]
  const rows = await fetchUniverse(screen, { instruments }, direct, columns, signal, true)
  if (!rows.length) throw new Error(screen.universe === 'MY_LIST' ? 'Listende test edilecek sembol yok.' : 'Evren alınamadı.')

  const bench = benchmarkFor(screen, rows.map((r) => r.symbol))
  const needFx = screen.currency === 'USD' && rows.some((r) => r.currency === 'TRY')
  const wanted = [...rows.map((r) => r.symbol), bench.symbol, ...(needFx ? ['FX:USDTRY'] : [])]
  const daily = await dailyCloses(wanted, (done, total) => onStep({ step: 'daily', done, total }), signal)
  if (!daily.size) throw new Error('Günlük fiyat geçmişi alınamadı. Bu yayında günlük veri yok ya da bağlantı kesildi.')
  if (needFx && !daily.get('FX:USDTRY')) throw new Error('Dolar/TL geçmişi alınamadı.')

  const needMonthly = used.some((f) => ['LOW_5Y', 'HIGH_5Y', 'PE_5Y_AVG', 'PERF_5Y'].includes(f))
  const monthly = new Map<string, Awaited<ReturnType<typeof monthlyBars>>>()
  if (needMonthly) {
    const list = rows.filter((r) => daily.has(r.symbol.toUpperCase()))
    let done = 0
    // Hepsi birden istenir: sunucu deposunda 100'lük toplu isteklere, statik kopyada tek dosyaya düşer
    await Promise.all(list.map(async (r) => {
      monthly.set(r.symbol, await monthlyBars(r.symbol))
      onStep({ step: 'monthly', done: ++done, total: list.length })
    }))
    if (signal?.aborted) throw new DOMException('İptal', 'AbortError')
  }

  const symbols: BtSymbol[] = rows.filter((r) => daily.has(r.symbol.toUpperCase())).map((r) => ({
    symbol: r.symbol, name: r.name, currency: r.currency, pricescale: r.pricescale,
    series: daily.get(r.symbol.toUpperCase())!,
    monthly: monthly.get(r.symbol) ?? undefined,
    now: r.values, epsFy: r.epsFy, revenueFy: r.revenueFy, fyEnd: r.fyEnd,
  }))
  const end = today()
  const benchSeries = daily.get(bench.symbol)
  const input: BtInput = {
    screen, symbols,
    startDay: end - Math.round(years * 365.25), endDay: end,
    benchmark: benchSeries ? { ...bench, series: benchSeries } : undefined,
    usdTry: needFx ? daily.get('FX:USDTRY') : undefined,
  }
  const result = await inWorker(input, (done, total) => onStep({ step: 'compute', done, total }), signal)
  return { years, result, benchmarkName: benchSeries ? bench.name : undefined, universe: rows.length, missing: rows.length - symbols.length }
}

function inWorker(input: BtInput, onProgress: (d: number, n: number) => void, signal?: AbortSignal): Promise<BtResult> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('../backtest.worker.ts', import.meta.url), { type: 'module' })
    const stop = () => { w.terminate(); reject(new DOMException('İptal', 'AbortError')) }
    signal?.addEventListener('abort', stop, { once: true })
    w.onmessage = (e: MessageEvent<{ type: 'progress'; done: number; total: number } | { type: 'done'; result: BtResult } | { type: 'error'; message: string }>) => {
      const m = e.data
      if (m.type === 'progress') onProgress(m.done, m.total)
      else {
        signal?.removeEventListener('abort', stop)
        w.terminate()
        if (m.type === 'done') resolve(m.result)
        else reject(new Error(m.message))
      }
    }
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message || 'Hesap yapılamadı')) }
    w.postMessage(input)
  })
}
