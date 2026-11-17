/**
 * Güçlü kurulumların pazar geneli kanıtı → setups.json
 *   DATA=dist/data/bars OUT=dist/data/setups.json npm run setups
 * Her kurulum × piyasa durumu için, üç takvim döneminde tüm hisselerdeki birleşik sonuç ve olağan sonuç.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { HORIZON, INDEX_OF, inRegime, PATH_DAYS, periodOf, toUsd, USDTRY, prepare, regimeMap, REGIMES, setupDays, setupKey, SETUPS, SHORT, strength, type PeriodStat, type Regime, type SetupEvidence } from '../src/core/setups'
import { marketOf, type Bars } from '../src/core/signals'
import { unpack as unpackV3, type Packed } from '../src/core/subject'

const DIR = process.env.DATA ?? 'research/out/v3'
const OUT = process.env.OUT ?? 'public/data/setups.json'
const unpack = (p: Packed): Bars | undefined => unpackV3(p)
const NOT_STOCK = /:(XU\d+|ALTIN|GLDTR|GMSTR|ZGOLD|ISGLK)$/

it('güçlü kurulumlar', () => {
  if (!existsSync(`${DIR}/D`)) throw new Error('günlük veri yok: ' + DIR)
  const daily = new Map<string, Bars>()
  for (const f of readdirSync(`${DIR}/D`)) for (const [s, p] of Object.entries(JSON.parse(readFileSync(`${DIR}/D/${f}`, 'utf8')).bars as Record<string, Packed>)) { const b = unpack(p); if (b) daily.set(s, b) }
  type A = { n: number; hit: number; hit21: number; ret: number }
  const zero = (): A => ({ n: 0, hit: 0, hit21: 0, ret: 0 })
  const markets: Record<string, unknown> = {}
  // BIST dolar bazında: hisseler ve endeks, o günün kuruyla dolara çevrilir
  const fx = daily.get(USDTRY)
  const usd = new Map<string, Bars>()
  if (fx) for (const [sym, b] of daily) if (sym.startsWith('BIST:')) usd.set(sym, toUsd(b, fx))
  for (const [key, m, data] of [['TR', 'TR', daily], ['TR_USD', 'TR', usd], ['US', 'US', daily]] as const) {
    const index = data.get(INDEX_OF[m])
    if (!index) continue
    const reg = regimeMap(index)
    const sig = new Map<string, A[]>(), stocksOf = new Map<string, Set<string>>()
    // Ortalama seyir (uç değerler kırpılır: −%90, +%150)
    const clip = (r: number) => Math.max(-0.9, Math.min(1.5, r))
    const paths = new Map<string, { n: number; sum: number[] }>()
    const basePaths: Record<Regime, { n: number; sum: number[] }> = { any: { n: 0, sum: PATH_DAYS.map(() => 0) }, bear: { n: 0, sum: PATH_DAYS.map(() => 0) }, bull: { n: 0, sum: PATH_DAYS.map(() => 0) } }
    const base: Record<Regime, A[]> = { any: [zero(), zero(), zero()], bear: [zero(), zero(), zero()], bull: [zero(), zero(), zero()] }
    let stocks = 0
    for (const [sym, b] of data) {
      if (marketOf(sym) !== m || NOT_STOCK.test(sym) || b.c.length < 400) continue
      stocks++
      const x = prepare(b), c = x.c, n = c.length
      const bullAt = (i: number) => reg.get(Math.floor(b.t[i] / 86400))
      for (let i = 260; i + HORIZON < n; i++) {
        const r = c[i + HORIZON] / c[i] - 1, r21 = c[i + SHORT] / c[i] - 1, p = periodOf(b.t[i]), bull = bullAt(i)
        for (const g of REGIMES) if (inRegime(g, bull)) { const a = base[g][p]; a.n++; if (r > 0) a.hit++; if (r21 > 0) a.hit21++; a.ret += r; if (i % 3 === 0) { const bp = basePaths[g]; bp.n++; PATH_DAYS.forEach((k, j) => { bp.sum[j] += clip(c[i + k] / c[i] - 1) }) } }
      }
      for (const s of SETUPS) {
        const sign = s.side === 'dip' ? 1 : -1
        for (const i of setupDays(x, s)) {
          if (i + HORIZON >= n) continue
          const r = c[i + HORIZON] / c[i] - 1, r21 = c[i + SHORT] / c[i] - 1, p = periodOf(b.t[i]), bull = bullAt(i)
          for (const g of REGIMES) if (inRegime(g, bull)) {
            const k = setupKey(s.id, g)
            if (!sig.has(k)) { sig.set(k, [zero(), zero(), zero()]); stocksOf.set(k, new Set()) }
            const a = sig.get(k)![p]; a.n++; if (r * sign > 0) a.hit++; if (r21 * sign > 0) a.hit21++; a.ret += r
            stocksOf.get(k)!.add(sym)
            const pp = paths.get(k) ?? { n: 0, sum: PATH_DAYS.map(() => 0) }; pp.n++; PATH_DAYS.forEach((d, j) => { pp.sum[j] += clip(c[i + d] / c[i] - 1) }); paths.set(k, pp)
          }
        }
      }
    }
    const r3 = (x: number) => Number(x.toFixed(3))
    const table: Record<string, SetupEvidence> = {}
    for (const s of SETUPS) for (const g of REGIMES) {
      const a = sig.get(setupKey(s.id, g)); if (!a) continue
      const top = s.side === 'top'
      const periods = a.map((e, p): PeriodStat => {
        const bb = base[g][p]; const bh = bb.n ? bb.hit / bb.n : 0, bh21 = bb.n ? bb.hit21 / bb.n : 0
        return [e.n, r3(e.n ? e.hit / e.n : 0), r3(top ? 1 - bh : bh), r3(e.n ? e.hit21 / e.n : 0), r3(top ? 1 - bh21 : bh21), r3(e.n ? e.ret / e.n : 0), r3(bb.n ? bb.ret / bb.n : 0)]
      })
      const pp = paths.get(setupKey(s.id, g))!, bp = basePaths[g]
      table[setupKey(s.id, g)] = { periods, stocks: stocksOf.get(setupKey(s.id, g))!.size, path: pp.sum.map((x) => Number((x / pp.n).toFixed(4))), basePath: bp.sum.map((x) => Number((x / Math.max(1, bp.n)).toFixed(4))) }
    }
    markets[key] = { stocks, setups: table }
    console.log(`\n${key}: ${stocks} hisse`)
    for (const s of SETUPS) for (const g of REGIMES) {
      const e = table[setupKey(s.id, g)]; if (!e) continue
      const st = strength(e, s.side)!
      console.log(`  ${st.strong ? 'GÜÇLÜ' : '     '} ${s.side} ${s.label.padEnd(46)} ${g.padEnd(4)} ` + e.periods.map((p) => `${String(p[0]).padStart(5)}: ${(p[1] * 100).toFixed(0)}/${(p[2] * 100).toFixed(0)} (21g ${(p[3] * 100).toFixed(0)}/${(p[4] * 100).toFixed(0)})`).join(' | ') + (st.reason ? `  [${st.reason}]` : ''))
    }
  }
  writeFileSync(OUT, JSON.stringify({ generated: Date.now(), markets }))
})
