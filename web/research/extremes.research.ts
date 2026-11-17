/**
 * Abartılı satış sınaması → extremes.json
 *   DATA=dist/data/bars CANDLES=dist/data/candles OUT=dist/data/extremes.json npm run extremes
 * Eşikler 2021 öncesinden; sonuçlar 2021 öncesi, 2021 sonrası (hiç görülmemiş) ve yıl yıl ayrı.
 * Aynı hissede iki sinyal arasında en az 21 işlem günü aranır.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { extremeScore, HORIZONS, type Block, type Episode, type MarketExtremes, type Metrics, type RuleId, type RuleStats, type Strategy } from '../src/core/extremes'
import type { OHLCV } from '../src/core/study'
import { convert, framesFromFile, GRAM, IN_USD, MACRO_ASSETS, marketOfSubject, unpack, type CandleFile, type Packed } from '../src/core/subject'

const DIR = process.env.DATA ?? 'research/out/v3', CANDLES = process.env.CANDLES ?? 'public/data/candles', OUT = process.env.OUT ?? 'public/data/extremes.json'
const NOT_STOCK = /:(XU\d+|ALTIN|GLDTR|GMSTR|ZGOLD|ISGLK)$/
const SPLIT = Date.UTC(2021, 0, 1) / 1000
const r4 = (x: number) => (Number.isFinite(x) ? Number(x.toPrecision(4)) : 0)
const q = (a: ArrayLike<number>, p: number) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
const yearOf = (t: number) => new Date(t * 1000).getUTCFullYear()
interface Out { t: number; r: number[]; adv: number }
function outcome(b: OHLCV, i: number, side: 'low' | 'high'): Out | undefined {
  if (i + 63 >= b.t.length) return undefined
  let e = side === 'low' ? Infinity : -Infinity
  for (let k = i + 1; k <= i + 63; k++) e = side === 'low' ? Math.min(e, b.l[k]) : Math.max(e, b.h[k])
  return { t: b.t[i], r: HORIZONS.map((h) => b.c[i + h] / b.c[i] - 1), adv: e / b.c[i] - 1 }
}
function block(o: Out[], side: 'low' | 'high'): Block {
  const good = (r: number) => (side === 'low' ? r > 0 : r < 0)
  return { n: o.length, h: HORIZONS.map((_, k) => [r4(o.filter((x) => good(x.r[k])).length / o.length), r4(q(o.map((x) => x.r[k]), 0.5))] as [number, number]), adv: r4(q(o.map((x) => x.adv), 0.5)), adv25: r4(q(o.map((x) => x.adv), side === 'low' ? 0.25 : 0.75)) }
}
function stats(sig: Out[], baseLow: Out[], baseHigh: Out[], side: 'low' | 'high'): RuleStats {
  const base = side === 'low' ? baseLow : baseHigh
  const pre = (a: Out[]) => a.filter((x) => x.t < SPLIT), post = (a: Out[]) => a.filter((x) => x.t >= SPLIT)
  const good = (r: number) => (side === 'low' ? r > 0 : r < 0)
  const years = [...new Set(sig.map((o) => yearOf(o.t)))].sort().map((y): [number, number, number, number] => {
    const a = sig.filter((o) => yearOf(o.t) === y), bb = base.filter((o) => yearOf(o.t) === y)
    return [y, a.length, r4(a.filter((o) => good(o.r[1])).length / a.length), r4(bb.filter((o) => good(o.r[1])).length / bb.length)]
  })
  return { pre: { sig: block(pre(sig), side), base: block(pre(base), side) }, post: { sig: block(post(sig), side), base: block(post(base), side) }, years }
}
function print(name: string, s: RuleStats) {
  const f = (b: Block) => `n=${String(b.n).padStart(6)} ` + b.h.map(([u, m]) => `${(u * 100).toFixed(0)}%/${(m * 100).toFixed(1)}`).join(' ') + ` ters ${(b.adv * 100).toFixed(1)}`
  console.log(`${name}\n  önce  ${f(s.pre.sig)} | her zaman ${f(s.pre.base)}\n  sonra ${f(s.post.sig)} | her zaman ${f(s.post.base)}\n  yıllar ${s.years.filter((y) => y[1] >= 5).map((y) => `${y[0]}:${Math.round(y[2] * 100)}/${Math.round(y[3] * 100)}`).join(' ')}`)
}

/**
 * Strateji sınaması: sinyal günü kapanışta görülür, ertesi gün açılışta alınır, hold gün sonra kapanışta satılır.
 * Her pozisyona sermayenin 1/SLOTS'u ayrılır (aynı anda daha çok pozisyon varsa eşit bölünür); kalan sermaye ya nakitte
 * (getiri 0) ya da endekste bekler. Maliyet her alış ve satışta ayrı düşülür. Aynı hissede pozisyon açıkken yeni sinyal alınmaz.
 * Kontrol: aynı günlerde, aynı sayıda rastgele hisse alınsaydı.
 */
const SLOTS = 20
function legs(b: OHLCV, i: number, hold: number, cost: number, pos: Map<number, number>, sum: Float64Array, cnt: Int32Array) {
  const e = i + 1, x = i + hold, day = (t: number) => Math.floor(t / 86400)
  for (let k = e; k <= x; k++) {
    const j = pos.get(day(b.t[k])); if (j == null) continue
    let r = k === e ? b.c[k] / b.o[k] - 1 : b.c[k] / b.c[k - 1] - 1
    if (k === e) r = (1 + r) * (1 - cost) - 1
    if (k === x) r = (1 + r) * (1 - cost) - 1
    sum[j] += r; cnt[j]++
  }
  return (b.c[x] / b.o[e]) * (1 - cost) * (1 - cost) - 1
}
function strategy(series: { b: OHLCV; sig: (i: number) => boolean }[], idx: OHLCV, hold: number, cost: number, random = 0) {
  const day = (t: number) => Math.floor(t / 86400)
  const days = idx.t.map(day), pos = new Map(days.map((d, k) => [d, k]))
  const n = days.length, sum = new Float64Array(n), cnt = new Int32Array(n)
  const trades: { d: number; r: number }[] = []
  // Sinyal günleri (rastgele kontrol için)
  const sigDays: number[] = []
  for (const { b, sig } of series) {
    let busyUntil = -1
    for (let i = 260; i + hold < b.t.length; i++) {
      if (i <= busyUntil || !sig(i)) continue
      busyUntil = i + hold
      if (random) { sigDays.push(day(b.t[i])); continue }
      trades.push({ d: day(b.t[i]), r: legs(b, i, hold, cost, pos, sum, cnt) })
    }
  }
  if (random) {
    let seed = random * 7919; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
    const at = series.map(({ b }) => new Map(b.t.map((t, i) => [day(t), i])))
    for (const d of sigDays) for (let tries = 0; tries < 50; tries++) {
      const k = Math.floor(rnd() * series.length), i = at[k].get(d)
      if (i != null && i >= 260 && i + hold < series[k].b.t.length) { trades.push({ d, r: legs(series[k].b, i, hold, cost, pos, sum, cnt) }); break }
    }
  }
  const strat = new Float64Array(n), mixed = new Float64Array(n), bh = new Float64Array(n)
  for (let j = 1; j < n; j++) {
    const ir = idx.c[j] / idx.c[j - 1] - 1, slots = Math.max(SLOTS, cnt[j]), w = cnt[j] / slots
    bh[j] = ir; strat[j] = sum[j] / slots; mixed[j] = sum[j] / slots + (1 - w) * ir
  }
  return { days, strat, mixed, bh, cnt, trades }
}
function metrics(r: Float64Array, cnt: Int32Array | undefined, days: number[], from: number, to: number): Metrics {
  let eq = 1, peak = 1, mdd = 0, k0 = -1, k1 = -1, inv = 0, tot = 0
  for (let j = 0; j < r.length; j++) {
    if (days[j] < from || days[j] >= to) continue
    if (k0 < 0) k0 = j; k1 = j; tot++
    eq *= 1 + r[j]; peak = Math.max(peak, eq); mdd = Math.min(mdd, eq / peak - 1)
    if (cnt ? cnt[j] > 0 : r[j] !== 0) inv++
  }
  const years = k0 >= 0 ? (days[k1] - days[k0]) / 365.25 : 0
  return { total: r4(eq - 1), cagr: r4(years > 0.5 ? eq ** (1 / years) - 1 : NaN), mdd: r4(mdd), invested: r4(tot ? inv / tot : 0) }
}

it('abartılı satış', () => {
  const candle = (id: string) => { const f = `${CANDLES}/${id}.json`; return existsSync(f) ? framesFromFile(JSON.parse(readFileSync(f, 'utf8')) as CandleFile).D : undefined }
  const fx = candle('USDTRY')
  if (!fx || !existsSync(`${DIR}/D`)) throw new Error('veri yok')
  const stocks = new Map<string, OHLCV>()
  for (const f of readdirSync(`${DIR}/D`)) for (const [s, p] of Object.entries(JSON.parse(readFileSync(`${DIR}/D/${f}`, 'utf8')).bars as Record<string, Packed>)) { const b = unpack(p); if (b && b.t.length >= 400 && !NOT_STOCK.test(s)) stocks.set(s, b) }
  const out: Record<string, MarketExtremes> = {}
  const groups = [
    { key: 'US', label: 'ABD hisseleri', idx: candle('SPX'), cost: 0.002, series: [...stocks].filter(([s]) => marketOfSubject(s) === 'US').map(([, b]) => b), breadth: true },
    { key: 'TR_USD', label: 'BIST hisseleri (dolar bazında)', idx: convert(candle('XU100'), fx, IN_USD), cost: 0.003, series: [...stocks].filter(([s]) => marketOfSubject(s) === 'TR').flatMap(([, b]) => { const u = convert(b, fx, IN_USD); return u && u.t.length >= 400 ? [u] : [] }), breadth: true },
    { key: 'MACRO', label: 'Makro varlıklar', idx: undefined as OHLCV | undefined, cost: 0.002, series: MACRO_ASSETS.flatMap((a) => { let b = candle(a.source ?? a.id); if (b && a.via) b = convert(b, fx, a.via === 'gram' ? GRAM : IN_USD); return b && b.t.length >= 400 ? [b] : [] }), breadth: false },
  ]
  for (const g of groups) {
    const scored = g.series.map((b) => ({ b, S: extremeScore(b) }))
    const train: number[] = []
    for (const { b, S } of scored) for (let i = 0; i < b.t.length; i += g.breadth ? 3 : 1) if (b.t[i] < SPLIT && !Number.isNaN(S[i])) train.push(S[i])
    const th = { q005: r4(q(train, 0.005)), q01: r4(q(train, 0.01)), q02: r4(q(train, 0.02)), q05: r4(q(train, 0.05)), q99: r4(q(train, 0.99)) }
    // Genişlik
    const day = (t: number) => Math.floor(t / 86400)
    let breadth: MarketExtremes['breadth']
    const br = new Map<number, number>()
    if (g.breadth) {
      const tot = new Map<number, number>(), over = new Map<number, number>()
      for (const { b, S } of scored) for (let i = 0; i < b.t.length; i++) if (!Number.isNaN(S[i])) { const d = day(b.t[i]); tot.set(d, (tot.get(d) ?? 0) + 1); if (S[i] <= th.q05) over.set(d, (over.get(d) ?? 0) + 1) }
      for (const [d, n] of tot) if (n >= 50) br.set(d, (over.get(d) ?? 0) / n)
      const days = [...br.keys()].sort((a, b) => a - b), d0 = days[0]
      const v = Array.from({ length: days[days.length - 1] - d0 + 1 }, (_, k) => { const x = br.get(d0 + k); return x == null ? -1 : Math.round(x * 1000) })
      const bt = [...br].filter(([d]) => d * 86400 < SPLIT).map(([, x]) => x)
      breadth = { d0, v, q90: r4(q(bt, 0.9)), q95: r4(q(bt, 0.95)) }
    }
    const brAt = (t: number) => br.get(day(t)) ?? NaN
    // Sinyaller
    const baseLow: Out[] = [], baseHigh: Out[] = [], sig: Record<RuleId, Out[]> = { strong: [], near: [], alone: [], top: [] }
    const strongDays: { d: number; o: Out }[] = []
    for (const { b, S } of scored) {
      const last: Partial<Record<RuleId, number>> = {}
      const fire = (k: RuleId, i: number, side: 'low' | 'high') => { if ((last[k] ?? -1e9) + 21 > i) return undefined; last[k] = i; const o = outcome(b, i, side); if (o) sig[k].push(o); return o }
      for (let i = 260; i < b.t.length; i++) {
        const s = S[i]; if (Number.isNaN(s)) continue
        if (i % (g.breadth ? 7 : 2) === 0) { const lo = outcome(b, i, 'low'), hi = outcome(b, i, 'high'); if (lo) baseLow.push(lo); if (hi) baseHigh.push(hi) }
        const x = brAt(b.t[i]), panic = breadth ? x >= breadth.q95 : true, calm = breadth ? x < breadth.q90 : false
        if (s <= th.q01 && panic) { const o = fire('strong', i, 'low'); if (o) strongDays.push({ d: day(b.t[i]), o }) }
        if (s <= th.q02 && panic) fire('near', i, 'low')
        if (s <= th.q02 && calm) fire('alone', i, 'low')
        if (s >= th.q99) fire('top', i, 'high')
      }
    }
    const rules: MarketExtremes['rules'] = {}
    console.log(`\n=== ${g.label}: ${g.series.length} seri; eşikler`, th, breadth ? `genişlik q90 ${breadth.q90} q95 ${breadth.q95}` : '')
    for (const k of (g.breadth ? ['strong', 'near', 'alone', 'top'] : ['near', 'top']) as RuleId[]) { if (sig[k].length < 30) continue; rules[k] = stats(sig[k], baseLow, baseHigh, k === 'top' ? 'high' : 'low'); print(k, rules[k]!) }
    // Dönemler: güçlü sinyallerin 15 günden yakın olanları aynı dönem
    const episodes: Episode[] = []
    strongDays.sort((a, b) => a.d - b.d)
    let cur: { d: number; o: Out }[] = []
    const flush = () => { if (cur.length >= (g.breadth ? 5 : 1)) episodes.push({ from: cur[0].d, to: cur[cur.length - 1].d, stocks: cur.length, h: HORIZONS.map((_, k) => r4(q(cur.map((x) => x.o.r[k]), 0.5))), adv: r4(q(cur.map((x) => x.o.adv), 0.5)) }); cur = [] }
    for (const x of strongDays) { if (cur.length && x.d - cur[cur.length - 1].d > 15) flush(); cur.push(x) }
    flush()
    if (g.breadth) console.log('dönemler', episodes.map((e) => `${new Date(e.from * 864e5).toISOString().slice(0, 10)}…${new Date(e.to * 864e5).toISOString().slice(5, 10)} (${e.stocks}) 1a ${(e.h[1] * 100).toFixed(1)} 3a ${(e.h[2] * 100).toFixed(1)} ters ${(e.adv * 100).toFixed(1)}`).join('\n  '))
    let strat: Strategy | undefined
    if (g.breadth && g.idx && breadth) {
      const sigOf = (b: OHLCV, S: Float64Array) => (i: number) => S[i] <= th.q01 && brAt(b.t[i]) >= breadth!.q95
      const ser = scored.map(({ b, S }) => ({ b, sig: sigOf(b, S) }))
      const start = Math.max(...[day(g.idx.t[260])]), split = day(SPLIT), end = Infinity
      const run = (hold: number) => strategy(ser, g.idx!, hold, g.cost)
      const main = run(63)
      const rnd = [1, 2, 3, 4, 5].map((k) => strategy(ser, g.idx!, 63, g.cost, k))
      const med = (f: (x: typeof main) => Metrics): Metrics => { const a = rnd.map(f).sort((x, y) => x.total - y.total); return a[2] }
      const per = (from: number, to: number) => ({
        strat: metrics(main.strat, main.cnt, main.days, from, to), mixed: metrics(main.mixed, undefined, main.days, from, to), bh: metrics(main.bh, undefined, main.days, from, to),
        randStrat: med((x) => metrics(x.strat, x.cnt, x.days, from, to)), randMixed: med((x) => metrics(x.mixed, undefined, x.days, from, to)),
      })
      // Yıl yıl
      const yrs = [...new Set(main.days.filter((d) => d >= start).map((d) => yearOf(d * 86400)))]
      const years = yrs.map((y): [number, number, number, number] => { const a = Date.UTC(y, 0, 1) / 864e5, b = Date.UTC(y + 1, 0, 1) / 864e5; return [y, metrics(main.mixed, undefined, main.days, a, b).total, metrics(main.bh, undefined, main.days, a, b).total, metrics(main.strat, main.cnt, main.days, a, b).total] })
      // Eğri: haftalık (5 işlem gününde bir)
      const curve: [number, number, number][] = []
      let es = 1, eb = 1
      for (let j = 0; j < main.days.length; j++) { if (main.days[j] < start) continue; es *= 1 + main.mixed[j]; eb *= 1 + main.bh[j]; if (j % 5 === 0 || j === main.days.length - 1) curve.push([main.days[j], r4(es), r4(eb)]) }
      const tr = main.trades.map((t) => t.r), trPost = main.trades.filter((t) => t.d >= split).map((t) => t.r)
      const tstat = (a: number[]) => ({ n: a.length, win: r4(a.filter((x) => x > 0).length / a.length), med: r4(q(a, 0.5)), avg: r4(a.reduce((x, y) => x + y, 0) / a.length), worst: r4(q(a, 0.05)), best: r4(q(a, 0.95)) })
      const variants = [21, 63, 126].map((h) => { const v = run(h); return { hold: h, all: metrics(v.mixed, undefined, v.days, start, end), post: metrics(v.mixed, undefined, v.days, split, end) } })
      strat = { hold: 63, cost: g.cost, start, all: per(start, end), pre: per(start, split), post: per(split, end), years, curve, trades: tstat(tr), tradesPost: tstat(trPost), variants }
      const f = (m: Metrics) => `toplam ${(m.total * 100).toFixed(0)}% yıllık ${(m.cagr * 100).toFixed(1)}% en kötü ${(m.mdd * 100).toFixed(0)}% piyasada ${(m.invested * 100).toFixed(0)}%`
      for (const [k, v] of [['tümü', strat.all], ['2021 öncesi', strat.pre], ['2021 sonrası', strat.post]] as const) console.log(`STRATEJİ ${k}:\n   endeks + sinyal    ${f(v.mixed)}\n   endeks + rastgele  ${f(v.randMixed)}\n   yalnız endeks      ${f(v.bh)}\n   yalnız sinyal(nakit) ${f(v.strat)}\n   rastgele(nakit)    ${f(v.randStrat)}`)
      console.log('işlemler', strat.trades, '2021+', strat.tradesPost)
      console.log('yıllar (endeks+sinyal / endeks / yalnız sinyal)', years.map((y) => `${y[0]}: ${(y[1] * 100).toFixed(1)}/${(y[2] * 100).toFixed(1)}/${(y[3] * 100).toFixed(1)}`).join(' '))
      console.log('tutma süresi', variants.map((v) => `${v.hold} gün: tümü ${f(v.all)} | 2021+ ${f(v.post)}`).join('\n   '))
    }
    out[g.key] = { label: g.label, stocks: g.series.length, th, breadth, rules, episodes, ...(strat ? { strategy: strat } : {}) }
  }
  writeFileSync(OUT, JSON.stringify({ generated: Date.now(), split: SPLIT, markets: out }))
})
