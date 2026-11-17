/**
 * Hisse verisi: haftalık ve günlük mumlar. Sunucu varsa canlı (api/tv/bars), statik yayında günlük kopyadaki
 * parçalardan (data/bars/{W|D}/{nn}.json). Ayrıca güçlü kurulumların kanıt tablosu (data/setups.json).
 */
import { INDEX_OF, stockSetups, tableKey, toUsd, USDTRY, type Basis, type SetupTable, type StockSetups } from '../core/setups'
import type { Bars } from '../core/signals'
import type { OHLCV } from '../core/study'
import { marketOfSubject, unpack, type Packed } from '../core/subject'
import { historySource } from './history'

export const SHARDS = 64
/** Sembolün parçası (server/bars.mjs ile aynı) */
export function shardOf(symbol: string): number {
  let h = 0
  for (const ch of symbol.toUpperCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % SHARDS
}
export const unpackBars = unpack

export interface StockBars { symbol: string; generated: number; source: 'proxy' | 'snapshot'; W?: OHLCV; D?: OHLCV }
const files = new Map<string, Promise<Record<string, Packed> | undefined>>()
const json = <T,>(url: string) => fetch(url, { cache: 'no-cache' }).then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? (r.json() as Promise<T>) : undefined)).catch(() => undefined)
const loaded = new Map<string, Promise<StockBars | undefined>>()

export function loadBars(symbol: string): Promise<StockBars | undefined> {
  const sym = symbol.toUpperCase()
  if (!loaded.has(sym)) loaded.set(sym, fetchBars(sym).then((r) => { if (!r) loaded.delete(sym); return r }))
  return loaded.get(sym)!
}
async function fetchBars(sym: string): Promise<StockBars | undefined> {
  if ((await historySource()) === 'proxy') {
    const r = await json<{ generated: number; bars: Partial<Record<'W' | 'D', Packed>> }>(`api/tv/bars?symbol=${encodeURIComponent(sym)}`)
    if (!r) return undefined
    const W = unpack(r.bars.W), D = unpack(r.bars.D)
    return W || D ? { symbol: sym, generated: r.generated, source: 'proxy', W, D } : undefined
  }
  const meta = await json<{ generated: number; shards: number }>('data/bars/meta.json')
  if (!meta) return undefined
  const nn = String(shardOf(sym)).padStart(2, '0')
  const get = async (tf: 'W' | 'D') => {
    const url = `data/bars/${tf}/${nn}.json?v=${meta.generated}`
    if (!files.has(url)) files.set(url, json<{ bars: Record<string, Packed> }>(url).then((x) => x?.bars))
    return unpack((await files.get(url))?.[sym])
  }
  const [W, D] = await Promise.all([get('W'), get('D')])
  return W || D ? { symbol: sym, generated: meta.generated, source: 'snapshot', W, D } : undefined
}

let setupFile: Promise<{ generated: number; markets: Record<string, { stocks: number; setups: SetupTable }> } | undefined> | undefined
export interface SetupData extends StockSetups { market: 'TR' | 'US'; basis: Basis; /** Dolar bazında ise son Dolar/TL kuru (tetik fiyatını TL'ye çevirmek için) */ fx?: number; stocks: number; generated: number; bars: Bars }
/** Güçlü kurulumlar: hissenin günlük verisi, pazar endeksi ve pazar geneli kanıt tablosuyla (hisse değilse undefined) */
export async function loadSetups(symbol: string, daily: Bars | undefined, basis: Basis = 'usd'): Promise<SetupData | undefined> {
  const m = marketOfSubject(symbol)
  if (!m || !daily) return undefined
  setupFile ??= json('data/setups.json')
  const usd = m === 'TR' && basis === 'usd'
  const [file, index, fx] = await Promise.all([setupFile, loadBars(INDEX_OF[m]), usd ? loadBars(USDTRY) : undefined])
  if (!file) setupFile = undefined
  // Kur verisi yoksa TL bazına düşülür
  const rate = usd ? fx?.D : undefined
  const b: Basis = rate ? 'usd' : 'try'
  const table = file?.markets[tableKey(m, b)]
  const stock = rate ? toUsd(daily, rate) : daily
  const idx = rate && index?.D ? toUsd(index.D, rate) : index?.D
  return { ...stockSetups(stock, idx, table?.setups), market: m, basis: m === 'TR' ? b : 'try', fx: rate ? rate.c[rate.c.length - 1] : undefined, stocks: table?.stocks ?? 0, generated: file?.generated ?? 0, bars: stock }
}
