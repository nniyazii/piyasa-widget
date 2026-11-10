/**
 * Yeni liste keşfi: gerekçesi olan aileler, küçük ızgaralar. Seçim ilk iki yılın en kötüsüne göre;
 * kabul: y1, y2 ≥ 45, son yıl ≥ 50, tüm dönem ≥ 60.
 */
import { it } from 'vitest'
import type { Condition, Screen, Universe } from '../src/core/screener'
import { C, describeAll, MLR, save } from './grid'
import { foldSearch, sc, show } from './folds'

const opt = (...xs: Condition[][]) => xs
const mk = (universe: Universe, currency: 'LOCAL' | 'USD' = 'LOCAL'): Screen => ({
  id: 'n', name: 'n', universe, category: null, currency, conditions: [], matchAll: true, sort: 'CLOSEST', limit: 20, onlyStocks: false,
})

const WAVE2: { key: string; name: string; base: Screen; axes: Condition[][][] }[] = [
  { key: 'bist_pe_hist_trend', name: 'BIST: F/K ortalamasının altında ve trendde', base: mk('BIST'), axes: [
    [-20, -30].map((v) => [C('PE', 'LTE', 'PE_5Y_AVG', v), C('PE', 'GT', null, 0)]),
    opt([C('PRICE', 'GT', 'SMA50', 0)], [C('PRICE', 'GT', 'SMA200', 0)]),
    opt([C('MCAP', 'GT', null, 10 * MLR)], [C('MCAP', 'GT', null, 30 * MLR)]),
  ] },
  { key: 'bist_ps_trend', name: 'BIST: satışlarına göre ucuz ve trendde', base: mk('BIST'), axes: [
    [0.5, 1].map((v) => [C('PS', 'GT', null, 0), C('PS', 'LT', null, v)]),
    opt([C('PRICE', 'GT', 'SMA50', 0)], [C('PRICE', 'GT', 'SMA200', 0)]),
    opt([C('MCAP', 'GT', null, 10 * MLR)], [C('MCAP', 'GT', null, 30 * MLR)]),
  ] },
  { key: 'bist_ev_trend', name: 'BIST: FD/FAVÖK düşük ve trendde', base: mk('BIST'), axes: [
    [5, 8].map((v) => [C('EV_EBITDA', 'GT', null, 0), C('EV_EBITDA', 'LT', null, v)]),
    opt([C('PRICE', 'GT', 'SMA50', 0)], [C('PRICE', 'GT', 'SMA200', 0)]),
    opt([C('MCAP', 'GT', null, 10 * MLR)], [C('MCAP', 'GT', null, 30 * MLR)]),
  ] },
  { key: 'us_pb_trend', name: 'ABD: PD/DD makul ve trendde', base: mk('US'), axes: [
    [2, 3].map((v) => [C('PB', 'GT', null, 0), C('PB', 'LT', null, v)]),
    opt([C('PRICE', 'GT', 'SMA200', 0)], [C('PRICE', 'GT', 'SMA50', 0)]),
    opt([C('MCAP', 'GT', null, 50 * MLR)], [C('MCAP', 'GT', null, 100 * MLR)]),
  ] },
  { key: 'us_div_trend', name: 'ABD: temettü veren ve trendde', base: mk('US'), axes: [
    [2, 3].map((v) => [C('DIV_YIELD', 'GTE', null, v)]),
    opt([C('PRICE', 'GT', 'SMA200', 0)], [C('PRICE', 'GT', 'SMA50', 0)]),
    opt([C('MCAP', 'GT', null, 50 * MLR)], [C('MCAP', 'GT', null, 100 * MLR)]),
  ] },
]

const WAVE3: { key: string; name: string; base: Screen; axes: Condition[][][] }[] = [
  { key: 'bist_quality_cheap', name: 'BIST: kârlı, borcu az, ucuz', base: mk('BIST'), axes: [
    [15, 25].map((v) => [C('ROE', 'GT', null, v)]),
    [8, 12].map((v) => [C('PE', 'GT', null, 0), C('PE', 'LT', null, v)]),
    opt([C('DEBT_EQ', 'LT', null, 1)], [C('PRICE', 'GT', 'SMA200', 0)]),
    opt([C('MCAP', 'GT', null, 10 * MLR)], [C('MCAP', 'GT', null, 30 * MLR)]),
  ] },
  { key: 'bist_margin_trend', name: 'BIST: yüksek marjlı ve trendde', base: mk('BIST'), axes: [
    [15, 25].map((v) => [C('NET_MARGIN', 'GT', null, v)]),
    opt([C('PRICE', 'GT', 'SMA50', 0)], [C('PRICE', 'GT', 'SMA200', 0)]),
    opt([C('MCAP', 'GT', null, 10 * MLR)], [C('MCAP', 'GT', null, 30 * MLR)]),
  ] },
  { key: 'us_quality_trend', name: 'ABD: kaliteli ve trendde', base: mk('US'), axes: [
    [20, 30].map((v) => [C('ROE', 'GT', null, v), C('NET_MARGIN', 'GT', null, 15)]),
    opt([C('PRICE', 'GT', 'SMA200', 0)], [C('PRICE', 'GT', 'SMA50', 0), C('SMA50', 'GT', 'SMA200', 0)]),
    opt([C('MCAP', 'GT', null, 50 * MLR)], [C('MCAP', 'GT', null, 100 * MLR)]),
  ] },
  { key: 'us_ps_trend', name: 'ABD: satışlarına göre makul ve trendde', base: mk('US'), axes: [
    [2, 4].map((v) => [C('PS', 'GT', null, 0), C('PS', 'LT', null, v)]),
    opt([C('PRICE', 'GT', 'SMA200', 0)], [C('PRICE', 'GT', 'SMA50', 0)]),
    opt([C('MCAP', 'GT', null, 50 * MLR)], [C('MCAP', 'GT', null, 100 * MLR)]),
  ] },
]

const FAMILIES: { key: string; name: string; base: Screen; axes: Condition[][][] }[] = process.env.WAVE === '2' ? WAVE2 : process.env.WAVE === '3' ? WAVE3 : [
  { key: 'bist_momentum', name: 'BIST: 1 yılın kazananları, trend sürüyor', base: mk('BIST'), axes: [
    [30, 50, 100].map((v) => [C('PERF_1Y', 'GT', null, v)]),
    opt([C('PRICE', 'GT', 'SMA50', 0)], [C('PRICE', 'GT', 'SMA20', 0)]),
    opt([C('MCAP', 'GT', null, 5 * MLR)], [C('MCAP', 'GT', null, 20 * MLR)]),
  ] },
  { key: 'bist_pullback', name: 'BIST: yükselen trendde geri çekilme', base: mk('BIST'), axes: [
    [35, 40, 45].map((v) => [C('RSI', 'LT', null, v)]),
    opt([C('PRICE', 'GT', 'SMA200', 0)], [C('PRICE', 'GT', 'SMA200', 0), C('SMA50', 'GT', 'SMA200', 0)]),
    opt([C('MCAP', 'GT', null, 10 * MLR)], [C('MCAP', 'GT', null, 30 * MLR)]),
  ] },
  { key: 'bist_usd_high', name: 'BIST: dolar bazında 52 hafta zirvesinde', base: mk('BIST', 'USD'), axes: [
    [3, 5, 10].map((v) => [C('PRICE', 'GTE', 'HIGH_52W', -v)]),
    opt([C('MCAP', 'GT', null, 5 * MLR)], [C('MCAP', 'GT', null, 20 * MLR)]),
  ] },
  { key: 'bist_value_mom', name: 'BIST: ucuz ve yükselen', base: mk('BIST'), axes: [
    [8, 12].map((v) => [C('PE', 'GT', null, 0), C('PE', 'LT', null, v)]),
    [0, 10, 20].map((v) => [C('PERF_3M', 'GT', null, v)]),
    opt([C('MCAP', 'GT', null, 10 * MLR)], [C('MCAP', 'GT', null, 30 * MLR)]),
  ] },
  { key: 'bist_trend', name: 'BIST: ortalamaların üstünde, ivmeli', base: mk('BIST'), axes: [
    [0, 5].map((v) => [C('PRICE', 'GT', 'SMA50', 0), C('SMA50', 'GT', 'SMA200', 0), C('PERF_1M', 'GT', null, v)]),
    opt([], [C('RSI', 'LT', null, 70)]),
    opt([C('MCAP', 'GT', null, 10 * MLR)], [C('MCAP', 'GT', null, 30 * MLR)]),
  ] },
  { key: 'bist_pb_trend', name: 'BIST: defter değerine yakın ve trendde', base: mk('BIST'), axes: [
    [1, 1.5].map((v) => [C('PB', 'GT', null, 0), C('PB', 'LT', null, v)]),
    opt([C('PRICE', 'GT', 'SMA200', 0)], [C('PRICE', 'GT', 'SMA50', 0)]),
    opt([C('MCAP', 'GT', null, 10 * MLR)], [C('MCAP', 'GT', null, 30 * MLR)]),
  ] },
  { key: 'us_high', name: 'ABD: 52 hafta zirvesine yakın devler', base: mk('US'), axes: [
    [3, 5, 10].map((v) => [C('PRICE', 'GTE', 'HIGH_52W', -v)]),
    opt([C('MCAP', 'GT', null, 50 * MLR)], [C('MCAP', 'GT', null, 100 * MLR)]),
  ] },
  { key: 'us_pullback', name: 'ABD: yükselen trendde geri çekilme', base: mk('US'), axes: [
    [35, 40, 45].map((v) => [C('RSI', 'LT', null, v)]),
    opt([C('PRICE', 'GT', 'SMA200', 0)], [C('PRICE', 'GT', 'SMA200', 0), C('SMA50', 'GT', 'SMA200', 0)]),
    opt([C('MCAP', 'GT', null, 50 * MLR)], [C('MCAP', 'GT', null, 100 * MLR)]),
  ] },
  { key: 'us_value_trend', name: 'ABD: makul F/K ve trendde', base: mk('US'), axes: [
    [15, 20, 25].map((v) => [C('PE', 'GT', null, 0), C('PE', 'LT', null, v)]),
    opt([C('PRICE', 'GT', 'SMA200', 0)], [C('PRICE', 'GT', 'SMA50', 0), C('SMA50', 'GT', 'SMA200', 0)]),
    opt([C('MCAP', 'GT', null, 50 * MLR)], [C('MCAP', 'GT', null, 100 * MLR)]),
  ] },
  { key: 'us_growth_mom', name: 'ABD: kârı hızla büyüyen ve yükselen', base: mk('US'), axes: [
    [20, 40].map((v) => [C('EPS_GROWTH_1Y', 'GT', null, v)]),
    opt([C('PRICE', 'GT', 'SMA50', 0)], [C('PRICE', 'GT', 'SMA200', 0)]),
    opt([C('MCAP', 'GT', null, 50 * MLR)], [C('MCAP', 'GT', null, 100 * MLR)]),
  ] },
  { key: 'us_momentum', name: 'ABD: 1 yılın kazananları, trend sürüyor', base: mk('US'), axes: [
    [30, 50].map((v) => [C('PERF_1Y', 'GT', null, v)]),
    opt([C('PRICE', 'GT', 'SMA50', 0)], [C('PRICE', 'GT', 'SMA20', 0)]),
    opt([C('MCAP', 'GT', null, 50 * MLR)], [C('MCAP', 'GT', null, 100 * MLR)]),
  ] },
]

it('yeni listeler keşfet', async () => {
  const found: unknown[] = []
  for (const f of FAMILIES) {
    const { best, tried } = await foldSearch(f.base, f.axes, 3)
    const lines = [`\n■ ${f.name}  (${tried} ayar)`]
    let accepted: (typeof best)[0] | undefined
    best.forEach((c, i) => {
      lines.push(`  aday ${i + 1}: ${describeAll(c.conds)}`, show(`aday ${i + 1}`, c))
      // Ayrıca tüm dönemde en az bir portföy biçimi (listede kaldıkça / 1 ay / 3 ay tut) endeksi geçmeli
      const p = c.all!.r.portfolios!, bench = c.all!.r.portfolio.bench ?? 0
      const beats = [p.list.total, p.hold1m.total, p.hold3m.total].some((t) => (t ?? -1) > bench)
      const ok = Math.min(sc(c.y1), sc(c.y2)) >= 45 && sc(c.y3) >= 50 && sc(c.all) >= 60 && beats
      if (ok && !accepted) accepted = c
    })
    lines.push(`  → ${accepted ? 'KABUL: ' + describeAll(accepted.conds) : 'reddedildi'}`)
    console.log(lines.join('\n'))
    if (accepted) found.push({ key: f.key, name: f.name, universe: f.base.universe, currency: f.base.currency, conds: accepted.conds, y1: accepted.y1.rel.score, y2: accepted.y2.rel.score, y3: accepted.y3!.rel.score, all: accepted.all!.rel.score, rel: accepted.all!.rel, portfolios: accepted.all!.r.portfolios, bench: accepted.all!.r.portfolio.bench })
  }
  save(process.env.OUT ?? `research/out/discover-${process.env.WAVE ?? 1}.json`, found)
})
