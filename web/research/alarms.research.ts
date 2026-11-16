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
import { INDEX_OF, stockSetups, type SetupTable } from '../src/core/setups'
import { analyze, marketOf, type Bars, type Timeframe, type Universe } from '../src/core/signals'

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
function unpackBars(p: [number, number[], number[]] | undefined): Bars | undefined {
  if (!p || !p[2]?.length) return undefined
  const t: number[] = []
  let cur = p[0]
  for (let i = 0; i < p[2].length; i++) { if (i > 0) cur += p[1][i - 1] * 60; t.push(cur) }
  return { t, c: p[2] }
}

let rules: Promise<{ markets: Record<string, { rules: Universe }> } | undefined> | undefined

let setupFile: Promise<{ markets: Record<string, { setups: SetupTable }> } | undefined> | undefined
const dailyOf = async (symbol: string) => unpackBars(((await symbolBars(symbol)) as { bars: Partial<Record<Timeframe, [number, number[], number[]]>> }).bars.D)

const source: Source = {
  async setups(symbol) {
    const m = marketOf(symbol)
    if (!m) return undefined
    setupFile ??= json<{ markets: Record<string, { setups: SetupTable }> }>(`${BASE}/setups.json`).catch(() => undefined)
    const [daily, index, file] = await Promise.all([dailyOf(symbol), dailyOf(INDEX_OF[m]), setupFile])
    return daily ? stockSetups(daily, index, file?.markets[m]?.setups) : undefined
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
  async analysis(symbol) {
    const r = (await symbolBars(symbol)) as { bars: Partial<Record<Timeframe, [number, number[], number[]]>> }
    const frames: Partial<Record<Timeframe, Bars>> = {}
    for (const tf of ['W', 'D', 'H4', 'H1'] as Timeframe[]) { const b = unpackBars(r.bars[tf]); if (b) frames[tf] = b }
    rules ??= json<{ markets: Record<string, { rules: Universe }> }>(`${BASE}/rules.json`).catch(() => undefined)
    const m = marketOf(symbol)
    return Object.keys(frames).length ? analyze(frames, m ? (await rules)?.markets[m]?.rules : undefined) : undefined
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
