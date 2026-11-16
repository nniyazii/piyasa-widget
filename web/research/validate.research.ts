/**
 * Hisse analizi yönteminin sınanması:
 *   1) Gerçek veride kaç kural "teyitli" çıkıyor
 *   2) Öngörülebilirliği yok edilmiş veride (getirilerin büyüklüğü yerinde, yönü rastgele) kaç kural teyitli çıkıyor → yanlış alarm oranı
 *   3) İleriye dönük sınama: geçmişin ilk %75'inde bulunan kurallar, son %25'te (yöntemin hiç görmediği dönem) ne yaptı
 * DATA=research/out/live LIMIT=200 npm run research -- research/validate.research.ts --disable-console-intercept
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { analyze, filterHolds, HORIZONS, indicators, type Bars, type SignalStat, type Timeframe } from '../src/core/signals'

/** Eşik ızgarası: [ad, tüm geçmiş p, dönem p, en az sinyal, saatlikler sayılsın mı] */
const GRID: [string, number, number, number, boolean][] = [['p.01/.10', 0.01, 0.1, 10, true], ['p.005/.10', 0.005, 0.1, 10, true], ['p.005/.05', 0.005, 0.05, 10, true], ['p.002/.05', 0.002, 0.05, 10, true], ['p.001/.05', 0.001, 0.05, 12, true], ['p.002/.05-H1', 0.002, 0.05, 10, false], ['p.001/.05-H1', 0.001, 0.05, 12, false]]
const confirmedBy = (st: SignalStat, g: (typeof GRID)[number]) => {
  const ex = st.main.median != null && st.main.baseMedian != null ? (st.main.median - st.main.baseMedian) * (st.side === 'dip' ? 1 : -1) : -1
  return (g[4] || st.tf !== 'H1') && (st.main.hit ?? 0) >= 0.6 && ex > 0 && st.main.n >= g[3] && (st.test.all.p ?? 1) <= g[1] && st.test.discovery.n >= 5 && (st.test.discovery.p ?? 1) <= g[2] && st.test.confirm.n >= 4 && (st.test.confirm.p ?? 1) <= g[2]
}

const DIR = process.env.DATA ?? 'research/out/live'
const TFS: Timeframe[] = ['W', 'D', 'H4', 'H1']
function unpack(p: [number, number[], number[]]): Bars { const t: number[] = []; let cur = p[0]; for (let i = 0; i < p[2].length; i++) { if (i > 0) cur += p[1][i - 1] * 60; t.push(cur) }; return { t, c: p[2] } }
function load(): Map<string, Partial<Record<Timeframe, Bars>>> {
  const out = new Map<string, Partial<Record<Timeframe, Bars>>>()
  for (const tf of TFS) for (const f of readdirSync(`${DIR}/${tf}`)) {
    const j = JSON.parse(readFileSync(`${DIR}/${tf}/${f}`, 'utf8')).bars as Record<string, [number, number[], number[]]>
    for (const [s, p] of Object.entries(j)) { if (!out.has(s)) out.set(s, {}); out.get(s)![tf] = unpack(p) }
  }
  return out
}
const lcg = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
/** Boş varsayım verisi: getirilerin büyüklüğü ve sırası aynı (oynaklık kümelenmesi korunur), yönü yazı-tura (yukarı oranı korunur). */
function surrogate(b: Bars, seed: number): Bars {
  const r = lcg(seed)
  let ups = 0
  for (let i = 1; i < b.c.length; i++) if (b.c[i] > b.c[i - 1]) ups++
  const pUp = ups / Math.max(1, b.c.length - 1)
  const c = [b.c[0]]
  for (let i = 1; i < b.c.length; i++) { const a = Math.abs(Math.log(b.c[i] / b.c[i - 1])); c.push(c[i - 1] * Math.exp(r() < pUp ? a : -a)) }
  return { t: b.t, c }
}
const cutBars = (b: Bars, share: number): Bars => { const n = Math.floor(b.c.length * share); return { t: b.t.slice(0, n), c: b.c.slice(0, n) } }

it('yöntem sınaması', () => {
  const data = [...load()].filter(([s]) => /^(BIST|NASDAQ|NYSE):/.test(s) && !/XU\d|ALTIN|GLDTR|GMSTR|ZGOLD|ISGLK/.test(s)).slice(0, Number(process.env.LIMIT ?? 400))
  const grid = GRID.map((g) => ({ g, real: 0, realStocks: 0, nul: 0, nulStocks: 0, fn: 0, fh: 0, fb: 0, fx: 0, fr: 0 }))
  const tally = { real: { stocks: 0, withConfirmed: 0, confirmed: 0, promising: 0, tested: 0 }, nul: { stocks: 0, withConfirmed: 0, confirmed: 0, promising: 0, tested: 0 } }
  const fwd: Record<string, { n: number; hits: number; base: number; rules: number; ex: number }> = {}
  const add = (k: string, n: number, hits: number, base: number, ex: number) => { fwd[k] ??= { n: 0, hits: 0, base: 0, rules: 0, ex: 0 }; fwd[k].n += n; fwd[k].hits += hits; fwd[k].base += base * n; fwd[k].ex += ex * n; fwd[k].rules++ }
  let ms = 0
  for (const [sym, frames] of data) {
    const t0 = performance.now()
    const real = analyze(frames)
    ms += performance.now() - t0
    const count = (a: ReturnType<typeof analyze>, into: typeof tally.real) => {
      const all = a.frames.flatMap((f) => [...f.dips, ...f.tops])
      const c = all.filter((s) => s.verdict === 'confirmed').length
      into.stocks++; into.confirmed += c; into.promising += all.filter((s) => s.verdict === 'promising').length; into.tested += all.filter((s) => s.main.n >= 10).length
      if (c) into.withConfirmed++
    }
    count(real, tally.real)
    for (const k of grid) { const c = real.frames.flatMap((f) => [...f.dips, ...f.tops]).filter((s) => confirmedBy(s, k.g)).length; k.real += c; if (c) k.realStocks++ }
    const fake: Partial<Record<Timeframe, Bars>> = {}
    for (const tf of TFS) if (frames[tf]) fake[tf] = surrogate(frames[tf]!, sym.length * 7919 + tf.charCodeAt(0))
    const nulA = analyze(fake)
    count(nulA, tally.nul)
    for (const k of grid) { const c = nulA.frames.flatMap((f) => [...f.dips, ...f.tops]).filter((s) => confirmedBy(s, k.g)).length; k.nul += c; if (c) k.nulStocks++ }

    // İleriye dönük: ilk %75 ile karar ver, son %25'teki sinyalleri ölç (olağan sonuç da son %25'ten, aynı bağlamdan)
    const past: Partial<Record<Timeframe, Bars>> = {}
    for (const tf of TFS) if (frames[tf]) past[tf] = cutBars(frames[tf]!, 0.75)
    const then = analyze(past)
    for (const f of then.frames) {
      const full = frames[f.tf]!
      const s = indicators(full.c)
      const h = HORIZONS[f.tf][1]
      const from = past[f.tf]!.c.length
      const now = real.frames.find((x) => x.tf === f.tf)
      if (!now) continue
      for (const st of [...f.dips, ...f.tops]) {
        const sign = st.side === 'dip' ? 1 : -1
        const later = (st.side === 'dip' ? now.dips : now.tops).find((x) => x.trigger.id === st.trigger.id && x.filter === st.filter)!
        const ev = later.events.filter((e) => e.i >= from && e.ret[1] != null)
        if (!ev.length) continue
        let bn = 0, bu = 0; const br: number[] = []
        for (let j = from; j + h < full.c.length; j++) if (filterHolds(st.filter, full.c, s, j)) { const r = full.c[j + h] / full.c[j] - 1; bn++; if (r * sign > 0) bu++; br.push(r * sign) }
        if (!bn) continue
        const bmean = br.reduce((a, b) => a + b, 0) / bn
        const emean = ev.reduce((a, e) => a + e.ret[1]! * sign, 0) / ev.length
        const hitsL = ev.filter((e) => e.ret[1]! * sign > 0).length
        for (const k of grid) if (confirmedBy(st, k.g)) { k.fn += ev.length; k.fh += hitsL; k.fb += (bu / bn) * ev.length; k.fx += (emean - bmean) * ev.length; k.fr++ }
        add(st.verdict, ev.length, ev.filter((e) => e.ret[1]! * sign > 0).length, bu / bn, emean - bmean)
        add(`${st.verdict}:${f.tf}`, ev.length, ev.filter((e) => e.ret[1]! * sign > 0).length, bu / bn, emean - bmean)
      }
    }
  }
  const pc = (x: number) => (x * 100).toFixed(1) + '%'
  const lines = [
    `hisse ${data.length}, analiz süresi ortalama ${(ms / data.length).toFixed(0)} ms`,
    ...(['real', 'nul'] as const).map((k) => `${k === 'real' ? 'GERÇEK' : 'BOŞ   '}: teyitli kuralı olan hisse ${tally[k].withConfirmed}/${tally[k].stocks} (${pc(tally[k].withConfirmed / tally[k].stocks)}), hisse başına teyitli ${(tally[k].confirmed / tally[k].stocks).toFixed(2)}, umut verici ${(tally[k].promising / tally[k].stocks).toFixed(2)}, sınanabilir kural ${(tally[k].tested / tally[k].stocks).toFixed(0)}`),
    'EŞİK IZGARASI (gerçek / boş: teyitli kuralı olan hisse; ileriye dönük sonuç):',
    ...grid.map((k) => `  ${k.g[0].padEnd(14)} gerçek ${k.realStocks}/${data.length} (${(k.real / data.length).toFixed(2)}/hisse)  boş ${k.nulStocks}/${data.length} (${(k.nul / data.length).toFixed(2)}/hisse)  ileri: kural ${k.fr} sinyal ${k.fn} isabet ${k.fn ? pc(k.fh / k.fn) : '-'} olağan ${k.fn ? pc(k.fb / k.fn) : '-'} getiri farkı ${k.fn ? pc(k.fx / k.fn) : '-'}`),
    'İLERİYE DÖNÜK (ilk %75 ile karar, son %25 sonuç):',
    ...Object.entries(fwd).sort().map(([k, v]) => `  ${k.padEnd(14)} kural ${String(v.rules).padStart(5)} sinyal ${String(v.n).padStart(6)} isabet ${pc(v.hits / v.n)} olağan ${pc(v.base / v.n)} fark ${((v.hits / v.n - v.base / v.n) * 100).toFixed(1)} puan, getiri farkı ${pc(v.ex / v.n)}`),
  ]
  console.log(lines.join('\n'))
  writeFileSync('research/out/validate.txt', lines.join('\n'))
})
