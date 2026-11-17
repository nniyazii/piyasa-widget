/** Pazar geneli olay kanıtı (data/events-market.json): bir olayın o pazardaki tüm hisselerde sonrasında ne olduğu. */
import type { Tf } from '../core/study'

export interface MarketEvidence { stocks: number; n: number[]; up: number[]; base: number[]; periods: [number, number, number][] }
type Row = [number[], number[], number[], [number, number, number][]]
interface File { generated: number; markets: Record<string, { stocks: number } & Partial<Record<Tf, Record<string, Row>>>> }
let file: Promise<File | undefined> | undefined
const load = () => (file ??= fetch('data/events-market.json', { cache: 'no-cache' }).then((r) => (r.ok ? (r.json() as Promise<File>) : undefined)).catch(() => undefined))
export type MarketLookup = (tf: Tf, eventId: string) => MarketEvidence | undefined
/** key: TR, TR_USD ya da US */
export async function loadMarketEvents(key: string): Promise<MarketLookup | undefined> {
  const m = (await load())?.markets[key]
  if (!m) return undefined
  return (tf, id) => { const r = m[tf]?.[id]; return r ? { stocks: m.stocks, n: r[0], up: r[1], base: r[2], periods: r[3] } : undefined }
}
