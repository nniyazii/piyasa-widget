/** Abartılı satış kanıtı (data/extremes.json) ve incelenen varlık. */
import type { ExtremesFile, MarketExtremes } from '../core/extremes'
import { isStock, marketOfSubject } from '../core/subject'
import { loadSubject, type Subject } from './subjects'

let file: Promise<ExtremesFile | undefined> | undefined
const load = () => (file ??= fetch('data/extremes.json', { cache: 'no-cache' }).then((r) => (r.ok ? (r.json() as Promise<ExtremesFile>) : undefined)).catch(() => undefined).then((f) => { if (!f) file = undefined; return f }))

export interface ExtremeData { subject: Subject; market?: MarketExtremes; key?: string; generated?: number; split?: number }
/** BIST hisseleri dolar bazında; makro varlıklar kendi gruplarıyla */
export async function loadExtremes(id: string): Promise<ExtremeData | undefined> {
  const [subject, f] = await Promise.all([loadSubject(id, true), load()])
  if (!subject?.frames.D) return undefined
  const m = isStock(id) ? marketOfSubject(id) : undefined
  const key = !isStock(id) ? 'MACRO' : m === 'US' ? 'US' : m === 'TR' && subject.usd ? 'TR_USD' : undefined
  return { subject, market: key ? f?.markets[key] : undefined, key, generated: f?.generated, split: f?.split }
}
