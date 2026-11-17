/**
 * Alarm kontrolü (sunucu tarafı; GitHub Actions 10 dakikada bir çalıştırır):
 *   ALARMS=alarms.json STATE=state.json FIRED=fired.json DATA_BASE=https://…/data npm run alarms
 * Uygulamadaki kontrolle aynı motor (src/core/alarms.ts); veri doğrudan TradingView'den ve yayındaki kopyadan gelir.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { it } from 'vitest'
// @ts-expect-error: düz JS modülü
import { symbolBars } from '../server/bars.mjs'
import type { RatioData } from '../src/core/advice'
import { checkAlarms, sanitizeAlarms, type Source, type States } from '../src/core/alarms'
import { bistOpen, type Series } from '../src/core/premium'
import { buildPremiums, PREMIUM_QUOTES, PREMIUM_SYMBOLS } from '../src/core/premiums'
import { INDEX_OF, stockSetups, tableKey, toUsd, USDTRY, type SetupTable } from '../src/core/setups'
import { world, type MacroData } from '../src/core/macro'
import { macroEventDefs } from '../src/core/macroEvents'
import { outlookView } from '../src/core/outlook'
import { assetInfo, convertFrames, framesFromFile, GRAM, IN_USD, isStock, marketOfSubject, toMonthly, unpack, type CandleFile, type Frames, type Packed } from '../src/core/subject'

const env = process.env
const BASE = (env.DATA_BASE ?? 'https://nniyazii.github.io/piyasa-widget/data').replace(/\/$/, '')
const read = <T,>(path: string | undefined, fallback: T): T => { try { return path && existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : fallback } catch { return fallback } }

async function quotes(symbols: string[]): Promise<Map<string, number>> {
  const r = await fetch('https://scanner.tradingview.com/global/scan', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ symbols: { tickers: symbols }, columns: ['close'] }), signal: AbortSignal.timeout(20_000) })
  if (!r.ok) throw new Error(`TradingView ${r.status}`)
  const j = (await r.json()) as { data: { s: string; d: unknown[] }[] }
  return new Map(j.data.flatMap((x) => (typeof x.d[0] === 'number' ? [[x.s.toUpperCase(), x.d[0] as number] as const] : [])))
}
const json = async <T,>(url: string) => { const r = await fetch(url, { signal: AbortSignal.timeout(30_000) }); if (!r.ok) throw new Error(`${url}: ${r.status}`); return (await r.json()) as T }

type PackedDaily = [number, number[], (number | null)[]] | null
function unpackDaily(p: PackedDaily): Series | undefined {
  if (!p || !p[2]?.length) return undefined
  const n = p[2].length, days = new Int32Array(n), close = new Float64Array(n)
  let d = p[0], last = NaN
  for (let i = 0; i < n; i++) { if (i > 0) d += p[1][i - 1]; days[i] = d; const c = p[2][i]; close[i] = c == null ? last : c; if (c != null) last = c }
  return { days, close }
}
let setupFile: Promise<{ markets: Record<string, { setups: SetupTable }> } | undefined> | undefined
let macroFile: Promise<MacroData | undefined> | undefined
const macro = () => (macroFile ??= json<MacroData>(`${BASE}/macro.json`).catch(() => undefined))
const barCache = new Map<string, Promise<{ W?: ReturnType<typeof unpack>; D?: ReturnType<typeof unpack> }>>()
/** Hissenin haftalık ve günlük mumları (TradingView'den, canlı) */
const barsOf = (symbol: string) => {
  if (!barCache.has(symbol)) barCache.set(symbol, (symbolBars(symbol) as Promise<{ bars: Partial<Record<'W' | 'D', Packed>> }>).then((r) => ({ W: unpack(r.bars.W), D: unpack(r.bars.D) })))
  return barCache.get(symbol)!
}
const dailyOf = async (symbol: string) => (await barsOf(symbol)).D
const candleCache = new Map<string, Promise<Frames | undefined>>()
const candles = (id: string) => { if (!candleCache.has(id)) candleCache.set(id, json<CandleFile>(`${BASE}/candles/${id}.json`).then(framesFromFile).catch(() => undefined)); return candleCache.get(id)! }

const source: Source = {
  async outlook() {
    const d = await macro()
    return d ? Object.fromEntries(outlookView(d).list.map((o) => [o.asset.id, { stance: o.stance, conviction: o.conviction, name: o.asset.short, why: o.why }])) : undefined
  },
  async setups(symbol) {
    const m = marketOfSubject(symbol)
    if (!m) return undefined
    setupFile ??= json<{ markets: Record<string, { setups: SetupTable }> }>(`${BASE}/setups.json`).catch(() => undefined)
    // BIST hisseleri dolar bazında değerlendirilir (uygulamadaki varsayılanla aynı)
    const [daily, index, file, fx] = await Promise.all([dailyOf(symbol), dailyOf(INDEX_OF[m]), setupFile, m === 'TR' ? dailyOf(USDTRY) : undefined])
    if (!daily) return undefined
    return fx ? stockSetups(toUsd(daily, fx), index && toUsd(index, fx), file?.markets[tableKey(m, 'usd')]?.setups) : stockSetups(daily, index, file?.markets[m]?.setups)
  },
  prices: quotes,
  async premiums() {
    const [price, daily, long] = await Promise.all([
      quotes(PREMIUM_QUOTES),
      json<{ bars: Record<string, PackedDaily> }>(`${BASE}/daily/misc.json`),
      json<RatioData>(`${BASE}/ratios.json`).catch(() => undefined),
    ])
    const series = new Map<string, Series>()
    for (const s of PREMIUM_SYMBOLS) { const u = unpackDaily(daily.bars[s]); if (u) series.set(s, u) }
    const b = buildPremiums(price, series, long)
    return { rows: b.rows, advices: [...b.advices, ...b.money], open: bistOpen() }
  },
  async subject(id, usd) {
    if (!isStock(id)) {
      const a = assetInfo(id)
      if (!a) return undefined
      let frames = await candles(a.source ?? a.id)
      if (!frames) return undefined
      if (a.via) { const fx = await candles('USDTRY'); if (!fx) return undefined; frames = convertFrames(frames, fx, a.via === 'gram' ? GRAM : IN_USD) }
      const d = await macro()
      return { short: a.short, frames, macroDefs: d ? macroEventDefs(world(d), a.group) : undefined }
    }
    const b = await barsOf(id)
    if (!b.W && !b.D) return undefined
    let frames: Frames = { W: b.W, D: b.D, M: toMonthly(b.W) }
    if (usd && marketOfSubject(id) === 'TR') { const fx = await candles('USDTRY'); if (!fx) return undefined; frames = convertFrames(frames, fx, IN_USD) }
    return { short: id.split(':').pop()!, frames }
  },
}

it('alarmlar', async () => {
  const alarms = sanitizeAlarms(read<{ alarms?: unknown }>(env.ALARMS, {}).alarms)
  const prev = read<{ states?: States; log?: { t: number; title: string; text: string }[] }>(env.STATE, {})
  const ids = new Set(alarms.map((a) => a.id))
  const before: States = Object.fromEntries(Object.entries(prev.states ?? {}).filter(([id]) => ids.has(id)))
  const now = Date.now()
  const { states, fired } = await checkAlarms(alarms, before, source, now)
  const log = [...fired.map((f) => ({ t: now, title: f.title, text: f.text })), ...(prev.log ?? [])].slice(0, 30)
  if (env.STATE) writeFileSync(env.STATE, JSON.stringify({ checked: now, states, log }, null, 1))
  if (env.FIRED) writeFileSync(env.FIRED, JSON.stringify(fired.map((f) => ({ title: f.title, text: f.text }))))
  console.log(`alarmlar: ${alarms.length} kontrol edildi, ${fired.length} çaldı` + Object.entries(states).filter(([, s]) => s.error).map(([id, s]) => `\n  ${id}: ${s.error}`).join(''))
})
