/**
 * Teyit yönteminin seçimi: hisse kanıtı, evren (birleşik) kanıtı ve veri derinliği şartlarının değişik
 * birleşimleri, hiç görülmemiş son %25'lik dönemde ne kadar tutuyor; rastgele veride ne kadar yanlış alarm veriyor.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { analyze, filterHolds, HORIZONS, indicators, type Bars, type SignalStat, type Timeframe } from '../src/core/signals'

const DIR = process.env.DATA ?? 'research/out/live'
const TFS: Timeframe[] = ['W', 'D', 'H4', 'H1']
function unpack(p: [number, number[], number[]]): Bars { const t: number[] = []; let cur = p[0]; for (let i = 0; i < p[2].length; i++) { if (i > 0) cur += p[1][i - 1] * 60; t.push(cur) }; return { t, c: p[2] } }
const lcg = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
function surrogate(b: Bars, seed: number): Bars {
  const r = lcg(seed); let ups = 0
  for (let i = 1; i < b.c.length; i++) if (b.c[i] > b.c[i - 1]) ups++
  const pUp = ups / Math.max(1, b.c.length - 1); const c = [b.c[0]]
  for (let i = 1; i < b.c.length; i++) { const a = Math.abs(Math.log(b.c[i] / b.c[i - 1])); c.push(c[i - 1] * Math.exp(r() < pUp ? a : -a)) }
  return { t: b.t, c }
}
interface Rec { sym: string; market: string; tf: Timeframe; key: string; n: number; hit: number; base: number; ex: number; p: number; pd: number; pc: number; nd: number; nc: number; betterD: boolean; betterC: boolean; years: number; fn: number; fh: number; fb: number; fx: number; nul: boolean }

it('yöntem seçimi', () => {
  const stocks = new Map<string, Partial<Record<Timeframe, Bars>>>()
  for (const tf of TFS) for (const f of readdirSync(`${DIR}/${tf}`)) {
    const j = JSON.parse(readFileSync(`${DIR}/${tf}/${f}`, 'utf8')).bars as Record<string, [number, number[], number[]]>
    for (const [s, p] of Object.entries(j)) if (/^(BIST|NASDAQ|NYSE):/.test(s) && !/XU\d|ALTIN|GLDTR|GMSTR|ZGOLD|ISGLK/.test(s)) { if (!stocks.has(s)) stocks.set(s, {}); stocks.get(s)![tf] = unpack(p) }
  }
  const recs: Rec[] = []
  const rec = (sym: string, tf: Timeframe, st: SignalStat, years: number, nul: boolean): Rec => {
    const sign = st.side === 'dip' ? 1 : -1
    const better = (e: typeof st.test.all) => e.hit != null && e.baseHit != null && e.hit > e.baseHit
    return { sym, market: sym.startsWith('BIST') ? 'TR' : 'US', tf, key: `${tf}|${st.trigger.id}|${st.filter}`, n: st.main.n, hit: st.main.hit ?? 0, base: st.main.baseHit ?? 0.5,
      ex: st.main.median != null && st.main.baseMedian != null ? (st.main.median - st.main.baseMedian) * sign : -1,
      p: st.test.all.p ?? 1, pd: st.test.discovery.p ?? 1, pc: st.test.confirm.p ?? 1, nd: st.test.discovery.n, nc: st.test.confirm.n, betterD: better(st.test.discovery), betterC: better(st.test.confirm), years, fn: 0, fh: 0, fb: 0, fx: 0, nul }
  }
  for (const [sym, frames] of stocks) {
    const past: Partial<Record<Timeframe, Bars>> = {}, fake: Partial<Record<Timeframe, Bars>> = {}
    for (const tf of TFS) if (frames[tf]) { const n = Math.floor(frames[tf]!.c.length * 0.75); past[tf] = { t: frames[tf]!.t.slice(0, n), c: frames[tf]!.c.slice(0, n) }; fake[tf] = surrogate(past[tf]!, sym.length * 7919 + tf.charCodeAt(0)) }
    const then = analyze(past), full = analyze(frames), nulA = analyze(fake)
    for (const f of nulA.frames) for (const st of [...f.dips, ...f.tops]) if (st.main.n >= 6) recs.push(rec(sym, f.tf, st, (f.to - f.from) / (365.25 * 86400), true))
    for (const f of then.frames) {
      const b = frames[f.tf]!, s = indicators(b.c), h = HORIZONS[f.tf][1], from = past[f.tf]!.c.length
      const now = full.frames.find((x) => x.tf === f.tf)!
      const bases = new Map<string, { n: number; up: number; sum: number }>()
      for (const st of [...f.dips, ...f.tops]) {
        const r = rec(sym, f.tf, st, (f.to - f.from) / (365.25 * 86400), false)
        const sign = st.side === 'dip' ? 1 : -1
        const later = (st.side === 'dip' ? now.dips : now.tops).find((x) => x.trigger.id === st.trigger.id && x.filter === st.filter)!
        const ev = later.events.filter((e) => e.i >= from && e.ret[1] != null)
        let bs = bases.get(st.filter)
        if (!bs) { bs = { n: 0, up: 0, sum: 0 }; for (let j = from; j + h < b.c.length; j++) if (filterHolds(st.filter, b.c, s, j)) { const x = b.c[j + h] / b.c[j] - 1; bs.n++; if (x > 0) bs.up++; bs.sum += x }; bases.set(st.filter, bs) }
        if (ev.length && bs.n) { r.fn = ev.length; r.fh = ev.filter((e) => e.ret[1]! * sign > 0).length; r.fb = (sign > 0 ? bs.up : bs.n - bs.up) / bs.n; r.fx = ev.reduce((a, e) => a + (e.ret[1]! - bs!.sum / bs!.n) * sign, 0) / ev.length }
        recs.push(r)
      }
    }
  }
  // Evren kanıtı (yalnızca geçmiş %75'ten): pazar × kural için birleşik isabet farkının z değeri
  const pooled = new Map<string, { n: number; d: number; v: number }>()
  for (const r of recs) if (!r.nul && r.n > 0) { const k = `${r.market}|${r.key}`; const a = pooled.get(k) ?? { n: 0, d: 0, v: 0 }; a.n += r.n; a.d += (r.hit - r.base) * r.n; a.v += r.n * r.base * (1 - r.base); pooled.set(k, a) }
  const z = (r: Rec) => { const a = pooled.get(`${r.market}|${r.key}`); return a && a.n >= 100 ? a.d / Math.sqrt(a.v) : 0 }
  const good = (r: Rec) => r.hit >= 0.6 && r.ex > 0
  const stock = (p: number, pp: number, n = 10) => (r: Rec) => good(r) && r.n >= n && r.p <= p && r.nd >= 5 && r.pd <= pp && r.nc >= 4 && r.pc <= pp
  const V: [string, (r: Rec) => boolean][] = [
    ['A hisse p≤.01, dönem≤.10', stock(0.01, 0.1)],
    ['B hisse p≤.005, dönem≤.10', stock(0.005, 0.1)],
    ['C  B + geçmiş≥3 yıl', (r) => stock(0.005, 0.1)(r) && r.years >= 2.25],
    ['D  B + evren z≥2', (r) => stock(0.005, 0.1)(r) && z(r) >= 2],
    ['E  B + 3 yıl + evren z≥2', (r) => stock(0.005, 0.1)(r) && r.years >= 2.25 && z(r) >= 2],
    ['F  A + 3 yıl + evren z≥2', (r) => stock(0.01, 0.1)(r) && r.years >= 2.25 && z(r) >= 2],
    ['G hisse p≤.05 + iki dönem iyi + 3 yıl + evren z≥2', (r) => good(r) && r.n >= 8 && r.p <= 0.05 && r.betterD && r.betterC && r.years >= 2.25 && z(r) >= 2],
    ['H  G ama evren z≥3', (r) => good(r) && r.n >= 8 && r.p <= 0.05 && r.betterD && r.betterC && r.years >= 2.25 && z(r) >= 3],
    ['I hisse p≤.05 + iki dönem iyi + 3 yıl (evren yok)', (r) => good(r) && r.n >= 8 && r.p <= 0.05 && r.betterD && r.betterC && r.years >= 2.25],
    ['J yalnız evren z≥3 + 3 yıl', (r) => r.years >= 2.25 && z(r) >= 3 && r.n >= 4],
    ['K  G yalnız haftalık+günlük', (r) => good(r) && r.n >= 8 && r.p <= 0.05 && r.betterD && r.betterC && (r.tf === 'W' || r.tf === 'D') && z(r) >= 2],
    ['L hisse p≤.02 + iki dönem iyi + 3 yıl + evren z≥2', (r) => good(r) && r.n >= 8 && r.p <= 0.02 && r.betterD && r.betterC && r.years >= 2.25 && z(r) >= 2],
  ]
  const pc = (x: number) => (x * 100).toFixed(1)
  const N = stocks.size
  const out = [`hisse ${N}; geçmiş derinliği "3 yıl" şartı, kesilmiş (%75) veride 2,25 yıl olarak uygulanır`]
  for (const [name, sel] of V) {
    const real = recs.filter((r) => !r.nul && sel(r)), nul = recs.filter((r) => r.nul && sel(r))
    const fw = real.filter((r) => r.fn > 0); const fn = fw.reduce((a, r) => a + r.fn, 0)
    const by = (m: string) => { const g = fw.filter((r) => r.market === m); const n = g.reduce((a, r) => a + r.fn, 0); return n ? `${m} ${pc(g.reduce((a, r) => a + r.fh, 0) / n - g.reduce((a, r) => a + r.fb * r.fn, 0) / n)}p/${pc(g.reduce((a, r) => a + r.fx * r.fn, 0) / n)}% (${n})` : `${m} -` }
    out.push(`${name.padEnd(50)} gerçek ${String(new Set(real.map((r) => r.sym)).size).padStart(3)} hisse ${String(real.length).padStart(4)} kural | boş ${String(new Set(nul.map((r) => r.sym)).size).padStart(3)} hisse ${String(nul.length).padStart(4)} kural | sonraki dönem: sinyal ${String(fn).padStart(5)} isabet ${fn ? pc(fw.reduce((a, r) => a + r.fh, 0) / fn) : '-'} olağan ${fn ? pc(fw.reduce((a, r) => a + r.fb * r.fn, 0) / fn) : '-'} getiri farkı ${fn ? pc(fw.reduce((a, r) => a + r.fx * r.fn, 0) / fn) : '-'}% | ${by('TR')} ${by('US')}`)
  }
  console.log(out.join('\n'))
  writeFileSync('research/out/method.txt', out.join('\n'))
})
