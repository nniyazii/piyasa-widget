/** Tepe/taban modeli (data/pivots.json) ve bir varlık için gereken makro seriler. */
import type { MacroSeries, PivotEntry, ScaleId, Side } from '../core/pivots'
import { convert, IN_USD, isStock, marketOfSubject } from '../core/subject'
import { candles, loadSubject, type Subject } from './subjects'

export interface PivotUniverse { label: string; series: number; ids: string[]; scales: Partial<Record<ScaleId, Partial<Record<Side, PivotEntry>>>> }
export interface PivotFile { generated: number; split: { train: number; test: number }; universes: Record<string, PivotUniverse> }
let file: Promise<PivotFile | undefined> | undefined
export const loadPivotFile = () => (file ??= fetch('data/pivots.json', { cache: 'no-cache' }).then((r) => (r.ok ? (r.json() as Promise<PivotFile>) : undefined)).catch(() => undefined).then((f) => { if (!f) file = undefined; return f }))

export interface Turning { subject: Subject; universe?: PivotUniverse; macro: MacroSeries; generated?: number; split?: PivotFile['split'] }
/** Varlık (BIST hisseleri dolar bazında), ait olduğu pazarın modeli ve makro girdiler */
export async function loadTurning(id: string): Promise<Turning | undefined> {
  const market = isStock(id) ? marketOfSubject(id) : undefined
  const [subject, f, spx, xu, vix, dxy, us10y, fx] = await Promise.all([loadSubject(id, true), loadPivotFile(), candles('SPX'), candles('XU100'), candles('VIX'), candles('DXY'), candles('US10Y'), candles('USDTRY')])
  if (!subject?.frames.D) return undefined
  const key = !isStock(id) ? 'MACRO' : market === 'US' ? 'US' : market === 'TR' && subject.usd ? 'TR_USD' : undefined
  const macro: MacroSeries = key === 'TR_USD'
    ? { idx: convert(xu?.D, fx?.D, IN_USD), vix: vix?.D, dxy: dxy?.D, us10y: us10y?.D, fx: fx?.D }
    : { idx: spx?.D, vix: vix?.D, dxy: dxy?.D, us10y: us10y?.D, lagIdx: key === 'MACRO' }
  return { subject, universe: key ? f?.universes[key] : undefined, macro, generated: f?.generated, split: f?.split }
}
