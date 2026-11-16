/**
 * Üretimdeki teyit kurallarının sınanması (README'deki rakamların kaynağı):
 *   1) SHARE=0.75 DATA=research/out/full OUT=research/out/rules75.json npm run rules
 *   2) DATA=research/out/full RULES=research/out/rules75.json STEP=4 npm run research -- research/final.research.ts --disable-console-intercept
 * Kurallar geçmişin ilk %75'iyle (evren kanıtı dahil) seçilir, son %25'te ölçülür; aynı işlem öngörülebilirliği
 * yok edilmiş veride tekrarlanır (yanlış alarm oranı).
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { analyze, filterHolds, HORIZONS, indicators, marketOf, type Bars, type Timeframe, type Universe } from '../src/core/signals'

const DIR = process.env.DATA ?? 'research/out/full'
const TFS: Timeframe[] = ['W', 'D', 'H4', 'H1']
const rules = JSON.parse(readFileSync(process.env.RULES ?? 'research/out/rules75.json', 'utf8')).markets as Record<string, { rules: Universe }>
function unpack(p: [number, number[], number[]]): Bars { const t: number[] = []; let cur = p[0]; for (let i = 0; i < p[2].length; i++) { if (i > 0) cur += p[1][i - 1] * 60; t.push(cur) }; return { t, c: p[2] } }
const lcg = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
function surrogate(b: Bars, seed: number): Bars {
  const r = lcg(seed); let ups = 0
  for (let i = 1; i < b.c.length; i++) if (b.c[i] > b.c[i - 1]) ups++
  const pUp = ups / Math.max(1, b.c.length - 1); const c = [b.c[0]]
  for (let i = 1; i < b.c.length; i++) { const a = Math.abs(Math.log(b.c[i] / b.c[i - 1])); c.push(c[i - 1] * Math.exp(r() < pUp ? a : -a)) }
  return { t: b.t, c }
}

it('üretim kurallarının sınanması', () => {
  const stocks = new Map<string, Partial<Record<Timeframe, Bars>>>()
  for (const tf of TFS) for (const f of readdirSync(`${DIR}/${tf}`)) {
    const j = JSON.parse(readFileSync(`${DIR}/${tf}/${f}`, 'utf8')).bars as Record<string, [number, number[], number[]]>
    for (const [s, p] of Object.entries(j)) if (marketOf(s) && !/:(XU\d+|ALTIN|GLDTR|GMSTR|ZGOLD|ISGLK)$/.test(s)) { if (!stocks.has(s)) stocks.set(s, {}); stocks.get(s)![tf] = unpack(p) }
  }
  const step = Number(process.env.STEP ?? 4)
  const sample = [...stocks].sort(([a], [b]) => a.localeCompare(b)).filter((_, i) => i % step === 0)
  type T = { rules: number; stocks: Set<string>; n: number; hits: number; base: number; ex: number }
  const zero = (): T => ({ rules: 0, stocks: new Set(), n: 0, hits: 0, base: 0, ex: 0 })
  const fwd: Record<string, T> = {}
  const nul = { confirmed: new Set<string>(), promising: new Set<string>(), cRules: 0, pRules: 0 }
  const real = { confirmed: new Set<string>(), promising: new Set<string>(), cRules: 0, pRules: 0 }
  for (const [sym, frames] of sample) {
    const uni = rules[marketOf(sym)!]?.rules
    const past: Partial<Record<Timeframe, Bars>> = {}, fake: Partial<Record<Timeframe, Bars>> = {}
    for (const tf of TFS) if (frames[tf]) { const n = Math.floor(frames[tf]!.c.length * 0.75); past[tf] = { t: frames[tf]!.t.slice(0, n), c: frames[tf]!.c.slice(0, n) }; fake[tf] = surrogate(past[tf]!, sym.length * 7919 + tf.charCodeAt(0)) }
    for (const st of analyze(fake, uni).frames.flatMap((f) => [...f.dips, ...f.tops])) { if (st.verdict === 'confirmed') { nul.confirmed.add(sym); nul.cRules++ } else if (st.verdict === 'promising') { nul.promising.add(sym); nul.pRules++ } }
    const then = analyze(past, uni), full = analyze(frames, uni)
    for (const f of then.frames) {
      const b = frames[f.tf]!, s = indicators(b.c), h = HORIZONS[f.tf][1], from = past[f.tf]!.c.length
      const now = full.frames.find((x) => x.tf === f.tf)!
      const bases = new Map<string, { n: number; up: number; sum: number }>()
      for (const st of [...f.dips, ...f.tops]) {
        if (st.verdict === 'confirmed') { real.confirmed.add(sym); real.cRules++ } else if (st.verdict === 'promising') { real.promising.add(sym); real.pRules++ }
        const sign = st.side === 'dip' ? 1 : -1
        const later = (st.side === 'dip' ? now.dips : now.tops).find((x) => x.trigger.id === st.trigger.id && x.filter === st.filter)!
        const ev = later.events.filter((e) => e.i >= from && e.ret[1] != null)
        if (!ev.length) continue
        let bs = bases.get(st.filter)
        if (!bs) { bs = { n: 0, up: 0, sum: 0 }; for (let j = from; j + h < b.c.length; j++) if (filterHolds(st.filter, b.c, s, j)) { const x = b.c[j + h] / b.c[j] - 1; bs.n++; if (x > 0) bs.up++; bs.sum += x }; bases.set(st.filter, bs) }
        if (!bs.n) continue
        for (const k of [st.verdict, `${st.verdict} ${marketOf(sym)}`, `${st.verdict} ${st.side}`, `${st.verdict} ${f.tf}`]) {
          const a = (fwd[k] ??= zero())
          a.rules++; a.stocks.add(sym); a.n += ev.length; a.hits += ev.filter((e) => e.ret[1]! * sign > 0).length
          a.base += ((sign > 0 ? bs.up : bs.n - bs.up) / bs.n) * ev.length
          a.ex += ev.reduce((x, e) => x + (e.ret[1]! - bs!.sum / bs!.n) * sign, 0)
        }
      }
    }
  }
  const pc = (x: number) => (x * 100).toFixed(1)
  const N = sample.length
  const out = [
    `örnek ${N} hisse (her ${step}. hisse); kurallar ilk %75 ile seçildi`,
    `GERÇEK: teyitli kuralı olan hisse ${real.confirmed.size} (${pc(real.confirmed.size / N)}%), kural ${real.cRules}; umut verici: hisse ${real.promising.size}, kural ${real.pRules}`,
    `BOŞ   : teyitli kuralı olan hisse ${nul.confirmed.size} (${pc(nul.confirmed.size / N)}%), kural ${nul.cRules}; umut verici: hisse ${nul.promising.size}, kural ${nul.pRules}`,
    'SONRAKİ DÖNEM (son %25):',
    ...Object.entries(fwd).filter(([k]) => /^(confirmed|promising|none$|thin$)/.test(k)).sort().map(([k, v]) => `  ${k.padEnd(16)} kural ${String(v.rules).padStart(6)} hisse ${String(v.stocks.size).padStart(4)} sinyal ${String(v.n).padStart(7)} isabet ${pc(v.hits / v.n)} olağan ${pc(v.base / v.n)} fark ${pc(v.hits / v.n - v.base / v.n)} puan, getiri farkı ${pc(v.ex / v.n)}%`),
  ]
  console.log(out.join('\n'))
  writeFileSync('research/out/final.txt', out.join('\n'))
})
