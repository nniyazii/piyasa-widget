/**
 * Olaylar ve yön olasılıkları: "son dönemde ne oldu, aynı şey geçmişte olduğunda sonrasında ne oldu?"
 *
 * Olay, bir durumun BAŞLADIĞI aydır (sert düşüş, trendin kırılması, yeni zirve, getiri eğrisinin dönmesi…).
 * Her olay için geçmişteki tüm başlangıçlar bulunur ve sonraki 1, 3, 6, 12 ayda varlığın yukarıda olma oranı,
 * ortanca getirisi ve dağılımı ölçülür. Olay birkaç ay önce olduysa olasılıklar "bugünden sonrası" için verilir:
 * geçmişteki her örnekte olaydan aynı süre geçtikten sonraki dönem ölçülür.
 *
 * Aylık veride örnek azdır; her olasılığın yanında örnek sayısı ve güven aralığı verilir.
 */
import { CONDITIONS, type Asset, type MacroData, type World, world, ASSETS, monthLabel } from './macro'

export const HORIZONS = [1, 3, 6, 12]
export const RECENT = 6
/** Aynı olayın iki başlangıcı arasında en az bu kadar ay (bağımsız dönemler) */
const GAP = 6

export interface EventDef {
  id: string
  /** Olayın cümlesi: "bir ayda sert düştü" (varlık olaylarında özne varlıktır) */
  label: string
  kind: 'asset' | 'macro'
  group?: string
  /** Olay [k] ayında gerçekleşti mi (durum o ay başladı mı) */
  on: (w: World, k: number, asset?: string) => boolean | undefined
  /** O aydaki büyüklük (cümle için): "−%9,2" */
  detail?: (w: World, k: number, asset?: string) => string | undefined
}

const pctS = (v: number, d = 0) => (v >= 0 ? '+' : '−') + '%' + Math.abs(v * 100).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d })
/** Son 36 ayın aylık getirilerinin standart sapması ([k] hariç) */
function vol(w: World, id: string, k: number): number | undefined {
  const s = w.s[id]; const r: number[] = []
  for (let j = k - 36; j < k; j++) { const x = s?.chg(j, 1); if (x != null) r.push(x) }
  if (r.length < 24) return undefined
  const m = r.reduce((a, b) => a + b, 0) / r.length
  return Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / r.length)
}
const avg10 = (w: World, id: string, k: number) => { const s = w.s[id]; let sum = 0, n = 0; for (let j = 0; j < 10; j++) { const v = s?.at(k - j); if (v != null) { sum += v; n++ } }; return n >= 8 ? sum / n : undefined }
const extreme = (w: World, id: string, k: number, n: number, hi: boolean) => { const s = w.s[id]; const p = s?.at(k); if (p == null) return undefined; for (let j = 1; j < n; j++) { const v = s!.at(k - j); if (v == null) return undefined; if (hi ? v >= p : v <= p) return false }; return true }
const streak = (w: World, id: string, k: number, up: boolean) => { let n = 0; for (let j = k; j > k - 12; j--) { const r = w.s[id]?.chg(j, 1); if (r == null || (up ? r <= 0 : r >= 0)) break; n++ }; return n }
const dd = (w: World, id: string, k: number) => { const s = w.s[id]; const p = s?.at(k); if (p == null) return undefined; let m = p; for (let j = 1; j <= 24; j++) { const v = s!.at(k - j); if (v != null && v > m) m = v }; return p / m - 1 }
const was = (f: (k: number) => boolean | undefined, k: number) => f(k) === true && f(k - 1) === false

/** Varlığın kendi fiyatındaki olaylar */
export const ASSET_EVENTS: EventDef[] = [
  { id: 'drop2', kind: 'asset', label: 'bir ayda olağandışı sert düştü', on: (w, k, a) => { const r = w.s[a!]?.chg(k, 1), v = vol(w, a!, k); return r == null || v == null ? undefined : r <= -2 * v }, detail: (w, k, a) => pctS(w.s[a!].chg(k, 1)!, 1) },
  { id: 'jump2', kind: 'asset', label: 'bir ayda olağandışı sert yükseldi', on: (w, k, a) => { const r = w.s[a!]?.chg(k, 1), v = vol(w, a!, k); return r == null || v == null ? undefined : r >= 2 * v }, detail: (w, k, a) => pctS(w.s[a!].chg(k, 1)!, 1) },
  { id: 'drop3m', kind: 'asset', label: 'üç ayda sert düştü', on: (w, k, a) => was((j) => { const r = w.s[a!]?.chg(j, 3), v = vol(w, a!, j); return r == null || v == null ? undefined : r <= -2 * v * Math.sqrt(3) }, k), detail: (w, k, a) => pctS(w.s[a!].chg(k, 3)!, 0) },
  { id: 'jump3m', kind: 'asset', label: 'üç ayda sert yükseldi', on: (w, k, a) => was((j) => { const r = w.s[a!]?.chg(j, 3), v = vol(w, a!, j); return r == null || v == null ? undefined : r >= 2 * v * Math.sqrt(3) }, k), detail: (w, k, a) => pctS(w.s[a!].chg(k, 3)!, 0) },
  { id: 'trend-down', kind: 'asset', label: '10 aylık ortalamasının altına indi (trend kırıldı)', on: (w, k, a) => was((j) => { const p = w.s[a!]?.at(j), m = avg10(w, a!, j); return p == null || m == null ? undefined : p < m }, k) },
  { id: 'trend-up', kind: 'asset', label: '10 aylık ortalamasının üstüne çıktı (trend döndü)', on: (w, k, a) => was((j) => { const p = w.s[a!]?.at(j), m = avg10(w, a!, j); return p == null || m == null ? undefined : p > m }, k) },
  { id: 'high12', kind: 'asset', label: '12 ayın en yüksek aylık kapanışını yaptı', on: (w, k, a) => was((j) => extreme(w, a!, j, 12, true), k) },
  { id: 'low12', kind: 'asset', label: '12 ayın en düşük aylık kapanışını yaptı', on: (w, k, a) => was((j) => extreme(w, a!, j, 12, false), k) },
  { id: 'high36', kind: 'asset', label: '3 yılın zirvesine çıktı', on: (w, k, a) => was((j) => extreme(w, a!, j, 36, true), k) },
  { id: 'up4', kind: 'asset', label: 'art arda 4 ay yükseldi', on: (w, k, a) => streak(w, a!, k, true) === 4 },
  { id: 'down4', kind: 'asset', label: 'art arda 4 ay düştü', on: (w, k, a) => streak(w, a!, k, false) === 4 },
  { id: 'dd20', kind: 'asset', label: 'zirvesinden %20’den fazla geriledi', on: (w, k, a) => was((j) => { const x = dd(w, a!, j); return x == null ? undefined : x <= -0.2 }, k), detail: (w, k, a) => 'zirveden ' + pctS(dd(w, a!, k)!, 0) },
  { id: 'dd10', kind: 'asset', label: 'zirvesinden %10’dan fazla geriledi', on: (w, k, a) => was((j) => { const x = dd(w, a!, j); return x == null ? undefined : x <= -0.1 }, k), detail: (w, k, a) => 'zirveden ' + pctS(dd(w, a!, k)!, 0) },
]
/** Makro olaylar: önceden tanımlı makro durumların başladığı ay */
export const MACRO_EVENTS: EventDef[] = CONDITIONS.map((c) => ({
  id: 'm:' + c.id, kind: 'macro' as const, group: c.group, label: c.label,
  on: (w: World, k: number) => { const a = c.test(w, k), b = c.test(w, k - 1); return a == null || b == null ? undefined : a && !b },
}))

export interface HorizonStat {
  months: number
  n: number
  /** Yukarıda olma oranı ve %80 güven aralığı */
  up: number; lo: number; hi: number
  median: number; q25: number; q75: number
  /** Tüm ayların olağanı */
  base: number; baseMedian: number
}
export interface Occurrence {
  def: EventDef
  asset: Asset
  /** Olayın gerçekleştiği ay ve bugüne kadar geçen ay sayısı */
  month: number
  elapsed: number
  detail?: string
  /** Bu olaydan beri varlığın getirisi */
  since?: number
  /** Geçmişteki başlangıç ayları (bu seferki hariç) */
  history: number[]
  /** Bugünden sonraki 1, 3, 6, 12 ay için (geçmişte olaydan aynı süre geçtikten sonra) */
  stats: HorizonStat[]
  /** Olaydan sonraki seyirler (grafik): her biri olay ayından itibaren 0..elapsed+12 ay */
  paths: { month: number; path: number[] }[]
  /** Bu seferki seyir: olay ayından bugüne */
  current: number[]
  /** Bilgilendirici mi: yeterli örnek ve olağandan belirgin fark */
  informative: boolean
  /** En çok ayrışan vade (başlık için) */
  best?: HorizonStat
}

const quant = (s: number[], p: number) => { if (!s.length) return NaN; const i = p * (s.length - 1), a = Math.floor(i), b = Math.ceil(i); return s[a] + (s[b] - s[a]) * (i - a) }
function wilson(hits: number, n: number, z = 1.28): [number, number] {
  if (!n) return [0, 1]
  const p = hits / n, z2 = z * z, c = (p + z2 / (2 * n)) / (1 + z2 / n), h = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / (1 + z2 / n)
  return [Math.max(0, c - h), Math.min(1, c + h)]
}
/** Serinin anlamlı başlangıcı: fiyatın art arda 6 ay değiştiği ilk ay (sabit fiyatlı eski dönemler atlanır) */
const startCache = new WeakMap<World, Map<string, number>>()
function startOf(w: World, id: string): number {
  let m = startCache.get(w); if (!m) { m = new Map(); startCache.set(w, m) }
  let v = m.get(id)
  if (v == null) { const s = w.s[id]; v = s.first; let run = 0; for (let k = s.first + 1; k <= w.now; k++) { const r = s.chg(k, 1); run = r != null && r !== 0 ? run + 1 : 0; if (run >= 6) { v = k - 6; break } }; m.set(id, v) }
  return v
}
const baseCache = new WeakMap<World, Map<string, { up: number; median: number }>>()
function base(w: World, id: string, h: number) {
  let m = baseCache.get(w); if (!m) { m = new Map(); baseCache.set(w, m) }
  const key = id + ':' + h
  let b = m.get(key)
  if (!b) { const s = w.s[id]; const r: number[] = []; for (let k = startOf(w, id); k + h <= w.now; k++) { const x = s.chg(k + h, h); if (x != null) r.push(x) }; r.sort((x, y) => x - y); b = { up: r.filter((x) => x > 0).length / Math.max(1, r.length), median: quant(r, 0.5) }; m.set(key, b) }
  return b
}

/** Bir olayın bir varlıktaki tüm başlangıç ayları (aralarında en az GAP ay) */
export function onsets(w: World, def: EventDef, asset: string): number[] {
  const s = w.s[asset]; if (!s) return []
  const out: number[] = []
  for (let k = Math.max(w.first + 40, startOf(w, asset) + 40); k <= w.now; k++) if (def.on(w, k, asset) === true && (!out.length || k - out[out.length - 1] >= GAP)) out.push(k)
  return out
}

function occurrence(w: World, def: EventDef, asset: Asset, all: number[]): Occurrence | undefined {
  const month = all[all.length - 1]
  if (month == null || w.now - month > RECENT) return undefined
  const s = w.s[asset.id]
  const elapsed = w.now - month
  const history = all.slice(0, -1)
  const stats: HorizonStat[] = HORIZONS.map((h) => {
    const r: number[] = []
    for (const k of history) { if (k < startOf(w, asset.id)) continue; const a = s.at(k + elapsed), b = s.at(k + elapsed + h); if (a != null && b != null && a > 0) r.push(b / a - 1) }
    r.sort((x, y) => x - y)
    const hits = r.filter((x) => x > 0).length
    const [lo, hi] = wilson(hits, r.length)
    const b = base(w, asset.id, h)
    return { months: h, n: r.length, up: r.length ? hits / r.length : NaN, lo, hi, median: quant(r, 0.5), q25: quant(r, 0.25), q75: quant(r, 0.75), base: b.up, baseMedian: b.median }
  })
  const paths = history.map((k) => { const p0 = s.at(k); const path: number[] = []; if (p0) for (let j = 0; j <= elapsed + 12; j++) { const v = s.at(k + j); if (v == null) break; path.push(v / p0 - 1) }; return { month: k, path } }).filter((p) => p.path.length > elapsed + 1)
  const p0 = s.at(month), p1 = s.at(w.now) ?? s.at(w.now - 1)
  const current: number[] = []
  if (p0) for (let j = 0; j <= elapsed; j++) { const v = s.at(month + j); if (v != null) current.push(v / p0 - 1) }
  const strong = stats.filter((x) => x.n >= 8 && Math.abs(x.up - x.base) >= 0.12).sort((x, y) => Math.abs(y.up - y.base) - Math.abs(x.up - x.base))
  return {
    current, best: strong[0],
    def, asset, month, elapsed, detail: def.detail?.(w, month, asset.id), since: elapsed > 0 && p0 && p1 ? p1 / p0 - 1 : undefined, history, stats, paths,
    informative: stats.some((x) => x.n >= 8 && Math.abs(x.up - x.base) >= 0.12),
  }
}

export interface AssetOdds { asset: Asset; events: Occurrence[] }
export interface EventsView { world: World; month: string; recent: Occurrence[]; odds: AssetOdds[] }

export const EVENT_ASSETS = ['GOLD', 'GAUTRY', 'SILVER', 'USDTRY', 'XU100USD', 'SPX', 'OIL', 'COPPER', 'DXY']

export function eventsView(d: MacroData): EventsView {
  const w = world(d)
  const assets = EVENT_ASSETS.map((id) => ASSETS.find((a) => a.id === id)).filter((a): a is Asset => !!a && !!w.s[a.id])
  const recent: Occurrence[] = []
  for (const asset of assets) {
    for (const def of ASSET_EVENTS) { const o = occurrence(w, def, asset, onsets(w, def, asset.id)); if (o) recent.push(o) }
  }
  // Makro olaylar: başlangıç ayları varlıktan bağımsızdır; her varlık için sonrası ayrı ölçülür
  for (const def of MACRO_EVENTS) {
    const all: number[] = []
    for (let k = w.first + 40; k <= w.now; k++) if (def.on(w, k) === true && (!all.length || k - all[all.length - 1] >= GAP)) all.push(k)
    if (!all.length || w.now - all[all.length - 1] > RECENT) continue
    for (const asset of assets) { if (def.group === 'tr' && asset.group !== 'tr') continue; const o = occurrence(w, def, asset, all); if (o) recent.push(o) }
  }
  recent.sort((a, b) => b.month - a.month || Number(b.informative) - Number(a.informative))
  // Varlık bazında: o varlığın son dönem olayları (en bilgilendirici olan önce)
  const odds: AssetOdds[] = assets.map((asset) => ({ asset, events: recent.filter((o) => o.asset.id === asset.id).sort((a, b) => Number(b.informative) - Number(a.informative) || Math.abs((b.best?.up ?? 0) - (b.best?.base ?? 0)) - Math.abs((a.best?.up ?? 0) - (a.best?.base ?? 0)) || b.month - a.month) }))
  return { world: w, month: monthLabel(w.now), recent, odds }
}

/** Olayın cümlesi: "Altın bir ayda olağandışı sert düştü (−%9,2)" */
export function sentence(o: Occurrence): string {
  return o.def.kind === 'asset' ? `${o.asset.short} ${o.def.label}${o.detail ? ` (${o.detail})` : ''}` : o.def.label
}

// ------------------------------------------------------------------ olay incelemesi (grafik için)

export interface Study {
  def: EventDef
  asset: Asset
  /** Olayın bu varlıktaki tüm başlangıç ayları */
  onsets: number[]
  /** Olay ayından sonraki 1, 3, 6, 12 ay (tüm örnekler) */
  stats: HorizonStat[]
  /** Her başlangıç için vadelerdeki getiri (henüz dolmadıysa undefined) */
  outcomes: Map<number, (number | undefined)[]>
  /** Son 6 ayda gerçekleştiyse: bugünden sonrası için olasılıklar */
  recent?: Occurrence
}

/** Bir olayın bir varlıktaki tüm geçmişi: her gerçekleşme ve sonrası */
export function study(w: World, def: EventDef, asset: Asset): Study {
  const s = w.s[asset.id]
  const all = def.kind === 'macro'
    ? (() => { const o: number[] = []; for (let k = w.first + 40; k <= w.now; k++) if (def.on(w, k) === true && (!o.length || k - o[o.length - 1] >= GAP)) o.push(k); return o.filter((k) => k >= startOf(w, asset.id)) })()
    : onsets(w, def, asset.id)
  const outcomes = new Map<number, (number | undefined)[]>()
  for (const k of all) outcomes.set(k, HORIZONS.map((h) => { const a = s.at(k), b = s.at(k + h); return a != null && b != null && a > 0 ? b / a - 1 : undefined }))
  const stats: HorizonStat[] = HORIZONS.map((h, i) => {
    const r = all.map((k) => outcomes.get(k)![i]).filter((x): x is number => x != null).sort((x, y) => x - y)
    const hits = r.filter((x) => x > 0).length; const [lo, hi] = wilson(hits, r.length); const b = base(w, asset.id, h)
    return { months: h, n: r.length, up: r.length ? hits / r.length : NaN, lo, hi, median: quant(r, 0.5), q25: quant(r, 0.25), q75: quant(r, 0.75), base: b.up, baseMedian: b.median }
  })
  return { def, asset, onsets: all, stats, outcomes, recent: occurrence(w, def, asset, all) }
}
export const ALL_EVENTS = [...ASSET_EVENTS, ...MACRO_EVENTS]
