/**
 * Tepe ve taban örüntüsü → pivots.json
 *   DATA=dist/data/bars CANDLES=dist/data/candles OUT=dist/data/pivots.json npm run pivots
 * Her pazar (ABD hisseleri, BIST hisseleri dolar bazında, makro varlıklar) ve her hassasiyet için:
 *   - tarihsel tepe ve tabanlar bulunur, o günlerin çevresi "bölge" olarak etiketlenir;
 *   - bölgedeki günleri diğerlerinden ayıran örüntü lojistik modelle öğrenilir;
 *   - geriye dönük sınama: model 2021 öncesiyle öğrenilir, 2021 Temmuz sonrasında (hiç görmediği dönemde) ölçülür;
 *   - yayına giden model tüm veriyle öğrenilir; sınama sonuçları dosyada yanında durur.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { baseFeatures, FEATURES, pivots, probability, rawOf, scaledFeatures, SCALES, vectorOf, zoneLabels, type MacroSeries, type PivotModel, type Side } from '../src/core/pivots'
import type { OHLCV } from '../src/core/study'
import { convert, framesFromFile, GRAM, IN_USD, MACRO_ASSETS, marketOfSubject, unpack, type CandleFile, type Packed } from '../src/core/subject'

const DIR = process.env.DATA ?? 'research/out/v3'
const CANDLES = process.env.CANDLES ?? 'public/data/candles'
const OUT = process.env.OUT ?? 'public/data/pivots.json'
const NOT_STOCK = /:(XU\d+|ALTIN|GLDTR|GMSTR|ZGOLD|ISGLK)$/
const T_TRAIN = Date.UTC(2021, 0, 1) / 1000, T_TEST = Date.UTC(2021, 6, 1) / 1000
const MULTS = [2, 3, 5, 8, 12]
const SIDES: Side[] = ['low', 'high']
const r4 = (x: number) => Number(x.toPrecision(4))
let seed = 12345
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
const quant = (a: number[], q: number) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))] }

/** Ağırlıklı lojistik regresyon (IRLS, küçük ridge) */
function fit(X: Float64Array[], y: number[], wt: number[], d: number): { w: number[]; b: number } {
  const n = X.length, D = d + 1, beta = new Float64Array(D)
  let pos = 0, tot = 0
  for (let i = 0; i < n; i++) { pos += wt[i] * y[i]; tot += wt[i] }
  beta[d] = Math.log(pos / (tot - pos))
  for (let iter = 0; iter < 12; iter++) {
    const A = Array.from({ length: D }, () => new Float64Array(D)), g = new Float64Array(D)
    for (let i = 0; i < n; i++) {
      const x = X[i]
      let s = beta[d]
      for (let k = 0; k < d; k++) s += beta[k] * x[k]
      const p = 1 / (1 + Math.exp(-s)), w = wt[i] * Math.max(1e-6, p * (1 - p)), e = wt[i] * (y[i] - p)
      for (let k = 0; k < D; k++) { const xk = k < d ? x[k] : 1; g[k] += e * xk; const wk = w * xk; for (let j = k; j < D; j++) A[k][j] += wk * (j < d ? x[j] : 1) }
    }
    for (let k = 0; k < D; k++) { for (let j = 0; j < k; j++) A[k][j] = A[j][k]; if (k < d) { A[k][k] += 1e-3 * tot; g[k] -= 1e-3 * tot * beta[k] } }
    // Gauss eleme
    const M = A.map((r, k) => [...r, g[k]])
    for (let c = 0; c < D; c++) {
      let piv = c
      for (let r = c + 1; r < D; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r
      ;[M[c], M[piv]] = [M[piv], M[c]]
      for (let r = 0; r < D; r++) if (r !== c) { const f = M[r][c] / M[c][c]; if (f) for (let k = c; k <= D; k++) M[r][k] -= f * M[c][k] }
    }
    let step = 0
    for (let k = 0; k < D; k++) { const dlt = M[k][D] / M[k][k]; beta[k] += dlt; step = Math.max(step, Math.abs(dlt)) }
    if (step < 1e-5) break
  }
  return { w: [...beta.slice(0, d)], b: beta[d] }
}

interface Series { id: string; b: OHLCV }
interface Universe { key: string; label: string; series: Series[]; macro: MacroSeries; negRate: number }

it('tepe ve taban örüntüsü', () => {
  if (!existsSync(`${DIR}/D`)) throw new Error('günlük veri yok: ' + DIR)
  const candle = (id: string) => { const f = `${CANDLES}/${id}.json`; return existsSync(f) ? framesFromFile(JSON.parse(readFileSync(f, 'utf8')) as CandleFile).D : undefined }
  const fx = candle('USDTRY'), spx = candle('SPX'), xu = candle('XU100'), vix = candle('VIX'), dxy = candle('DXY'), us10y = candle('US10Y')
  if (!fx || !spx || !xu) throw new Error('endeks ya da kur mumları yok: ' + CANDLES)
  const stocks = new Map<string, OHLCV>()
  for (const f of readdirSync(`${DIR}/D`)) for (const [s, p] of Object.entries(JSON.parse(readFileSync(`${DIR}/D/${f}`, 'utf8')).bars as Record<string, Packed>)) { const b = unpack(p); if (b && b.t.length >= 700 && !NOT_STOCK.test(s)) stocks.set(s, b) }
  const of = (m: 'TR' | 'US') => [...stocks].filter(([s]) => marketOfSubject(s) === m)
  const macroAssets: Series[] = MACRO_ASSETS.flatMap((a) => { let b = candle(a.source ?? a.id); if (b && a.via) b = convert(b, fx, a.via === 'gram' ? GRAM : IN_USD); return b && b.t.length >= 700 ? [{ id: a.id, b }] : [] })
  const universes: Universe[] = [
    { key: 'US', label: 'ABD hisseleri', series: of('US').map(([id, b]) => ({ id, b })), macro: { idx: spx, vix, dxy, us10y }, negRate: 0.04 },
    { key: 'TR_USD', label: 'BIST hisseleri (dolar bazında)', series: of('TR').flatMap(([id, b]) => { const u = convert(b, fx, IN_USD); return u && u.t.length >= 700 ? [{ id, b: u }] : [] }), macro: { idx: convert(xu, fx, IN_USD), vix, dxy, us10y, fx }, negRate: 0.05 },
    { key: 'MACRO', label: 'Makro varlıklar', series: macroAssets, macro: { idx: spx, vix, dxy, us10y, lagIdx: true }, negRate: 1 },
  ]
  const out: Record<string, unknown> = {}
  for (const u of universes) {
    // Kullanılacak özellikler: bu pazarda verisi olanlar
    const probe = baseFeatures(u.series[0].b, u.macro)
    const ids = FEATURES.filter((f) => f.scaled || probe.f[FEATURES.indexOf(f)].filter((v) => !Number.isNaN(v)).length > probe.n * 0.4).map((f) => f.id)
    const d = ids.length
    type Slot = { rows: Float64Array[]; y: number[]; wt: number[]; train: boolean[]; zone: number[][]; all: number[][]; gaps: number[]; piv: number }
    const slots = new Map<string, Slot>()
    const slot = (k: string) => { if (!slots.has(k)) slots.set(k, { rows: [], y: [], wt: [], train: [], zone: ids.map(() => []), all: ids.map(() => []), gaps: [], piv: 0 }); return slots.get(k)! }
    // 1. geçiş: örnek topla (ham özellikler)
    for (const s of u.series) {
      const x = baseFeatures(s.b, u.macro)
      for (const sc of SCALES) {
        if (x.n < sc.min + sc.fwd + 250) continue
        const near = scaledFeatures(x, sc)
        for (const side of SIDES) {
          const S = slot(sc.id + side), piv = pivots(s.b, sc, side), y = zoneLabels(x, sc, side, piv)
          S.piv += piv.confirmed.length
          for (let k = 1; k < piv.confirmed.length; k++) S.gaps.push(piv.confirmed[k] - piv.confirmed[k - 1])
          for (let i = 0; i < x.n; i++) {
            if (y[i] < 0) continue
            const t = s.b.t[i], isTrain = t < T_TRAIN
            if (!isTrain && t < T_TEST && false) continue
            const keep = y[i] === 1 ? 1 : u.negRate
            if (rnd() >= keep) continue
            const row = new Float64Array(d)
            for (let k = 0; k < d; k++) row[k] = rawOf(x, near, ids[k], i)
            S.rows.push(row); S.y.push(y[i]); S.wt.push(1 / keep); S.train.push(isTrain)
            if (rnd() < 0.25) for (let k = 0; k < d; k++) if (!Number.isNaN(row[k])) { if (y[i] === 1) S.zone[k].push(row[k]); else if (rnd() < 0.3) S.all[k].push(row[k]) }
          }
        }
      }
    }
    // Modeller: A (yalnızca öğrenme dönemi; sınama için) ve B (tüm veri; yayın için)
    const models = new Map<string, { A?: PivotModel; B?: PivotModel }>()
    for (const [k, S] of slots) {
      const build = (use: (i: number) => boolean): PivotModel | undefined => {
        const idx = S.rows.map((_, i) => i).filter(use)
        const pos = idx.filter((i) => S.y[i] === 1).length
        if (pos < 60) return undefined
        const mu = ids.map((_, k2) => { let s = 0, w = 0; for (const i of idx) { const v = S.rows[i][k2]; if (!Number.isNaN(v)) { s += v * S.wt[i]; w += S.wt[i] } } return w ? s / w : 0 })
        const sd = ids.map((_, k2) => { let s = 0, w = 0; for (const i of idx) { const v = S.rows[i][k2]; if (!Number.isNaN(v)) { s += (v - mu[k2]) ** 2 * S.wt[i]; w += S.wt[i] } } return w ? Math.sqrt(s / w) || 1 : 1 })
        const X = idx.map((i) => { const z = new Float64Array(d); for (let k2 = 0; k2 < d; k2++) { const v = S.rows[i][k2]; z[k2] = Number.isNaN(v) ? 0 : Math.max(-4, Math.min(4, (v - mu[k2]) / sd[k2])) } return z })
        const y = idx.map((i) => S.y[i]), wt = idx.map((i) => S.wt[i])
        const { w, b } = fit(X, y, wt, d)
        let p = 0, tot = 0
        for (let i = 0; i < y.length; i++) { p += wt[i] * y[i]; tot += wt[i] }
        return { ids, mu: mu.map(r4), sd: sd.map(r4), w: w.map(r4), b: r4(b), base: r4(p / tot) }
      }
      models.set(k, { A: build((i) => S.train[i]), B: build(() => true) })
    }
    // 2. geçiş: sınama dönemi (model A, hiç görmediği veri)
    type Prac = { n: number; near5: number; near10: number; dd5: number; dd10: number; good: number; adv: number[]; ret: number[] }
    const prac = (): Prac => ({ n: 0, near5: 0, near10: 0, dd5: 0, dd10: 0, good: 0, adv: [], ret: [] })
    type Ev = { n: number; pos: number; bins: { n: number; pos: number }[]; mult: { n: number; pos: number; caught: number; rets: number[] }[]; pivots: number; rets: number[]; pc: Prac[]; pa: Prac }
    const evs = new Map<string, Ev>()
    const BIN = [0, 1, 2, 3, 5, 8, 12, Infinity]
    for (const s of u.series) {
      const x = baseFeatures(s.b, u.macro)
      for (const sc of SCALES) {
        if (x.n < sc.min + sc.fwd + 250) continue
        const near = scaledFeatures(x, sc), H = Math.min(sc.fwd, 63)
        for (const side of SIDES) {
          const m = models.get(sc.id + side)?.A
          if (!m) continue
          if (!evs.has(sc.id + side)) evs.set(sc.id + side, { n: 0, pos: 0, bins: BIN.slice(1).map(() => ({ n: 0, pos: 0 })), mult: MULTS.map(() => ({ n: 0, pos: 0, caught: 0, rets: [] })), pivots: 0, rets: [], pc: MULTS.map(prac), pa: prac() })
          const E = evs.get(sc.id + side)!, piv = pivots(s.b, sc, side), y = zoneLabels(x, sc, side, piv)
          const p = new Float64Array(x.n), z = new Float64Array(d)
          // Sonraki H gün içindeki en düşük (taban) ya da en yüksek (tepe) fiyat
          const ext = new Float64Array(x.n).fill(NaN)
          { const a = side === 'low' ? s.b.l : s.b.h, q: number[] = []
            for (let i = x.n - 1; i >= 0; i--) { // [i+1 … i+H]
              const j = i + 1
              if (j < x.n) { while (q.length && (side === 'low' ? a[q[q.length - 1]] >= a[j] : a[q[q.length - 1]] <= a[j])) q.pop(); q.push(j) }
              while (q.length && q[0] > i + H) q.shift()
              if (i + H < x.n && q.length) ext[i] = a[q[0]]
            } }
          const add = (P: Prac, i: number, ret: number) => {
            const c = s.b.c[i], adv = side === 'low' ? Math.min(0, ext[i] / c - 1) : Math.max(0, ext[i] / c - 1)
            const lo = side === 'low' ? Math.min(ext[i], s.b.l[i]) : Math.max(ext[i], s.b.h[i])
            const gap = side === 'low' ? c / lo - 1 : 1 - c / lo
            P.n++; if (gap <= 0.05) P.near5++; if (gap <= 0.1) P.near10++
            if (Math.abs(adv) <= 0.05) P.dd5++; if (Math.abs(adv) <= 0.1) P.dd10++
            if (side === 'low' ? ret > 0 : ret < 0) P.good++
            if (P.adv.length < 30000) { P.adv.push(adv); P.ret.push(ret) }
          }
          for (let i = 0; i < x.n; i++) {
            if (y[i] < 0 || s.b.t[i] < T_TEST) continue
            p[i] = probability(m, vectorOf(m, x, near, i, z))
            const ratio = p[i] / m.base, ret = s.b.c[i + H] / s.b.c[i] - 1
            E.n++; E.pos += y[i]
            if (rnd() < 0.05) { E.rets.push(ret); if (!Number.isNaN(ext[i])) add(E.pa, i, ret) }
            const bi = BIN.findIndex((e, k) => k > 0 && ratio < e) - 1
            E.bins[bi].n++; E.bins[bi].pos += y[i]
            MULTS.forEach((mm, k) => { if (ratio >= mm) { E.mult[k].n++; E.mult[k].pos += y[i]; if (E.mult[k].rets.length < 20000) E.mult[k].rets.push(ret); if (!Number.isNaN(ext[i])) add(E.pc[k], i, ret) } })
          }
          for (const pv of piv.confirmed) {
            if (s.b.t[pv] < T_TEST || y[pv] < 0) continue
            E.pivots++
            MULTS.forEach((mm, k) => { for (let i = Math.max(0, pv - sc.tol); i <= Math.min(x.n - 1, pv + sc.tol); i++) if (y[i] === 1 && p[i] / m.base >= mm) { E.mult[k].caught++; break } })
          }
        }
      }
    }
    const scales: Record<string, unknown> = {}
    console.log(`\n=== ${u.label}: ${u.series.length} seri, ${d} özellik`)
    for (const sc of SCALES) {
      const entry: Record<string, unknown> = {}
      for (const side of SIDES) {
        const k = sc.id + side, S = slots.get(k), M = models.get(k), E = evs.get(k)
        if (!S || !M?.B) continue
        const hit = (a: number[]) => (a.length ? a.filter((r) => r > 0).length / a.length : NaN)
        const pr = (q: Prac) => ({ n: q.n, near5: r4(q.near5 / q.n), near10: r4(q.near10 / q.n), dd5: r4(q.dd5 / q.n), dd10: r4(q.dd10 / q.n), good: r4(q.good / q.n), adv: r4(quant(q.adv, 0.5)), adv75: r4(quant(q.adv, side === 'low' ? 0.25 : 0.75)), ret: r4(quant(q.ret, 0.5)) })
        const test = E && E.pos >= 30 ? {
          days: E.n, base: r4(E.pos / E.n), pivots: E.pivots,
          bins: E.bins.map((b, i) => [BIN[i], b.n, b.n ? r4(b.pos / b.n) : 0]),
          mult: E.mult.map((mm, i) => ({ m: MULTS[i], n: mm.n, prec: mm.n ? r4(mm.pos / mm.n) : 0, recall: E.pivots ? r4(mm.caught / E.pivots) : 0, ret: r4(quant(mm.rets, 0.5)), up: r4(hit(mm.rets)) })),
          ret: r4(quant(E.rets, 0.5)), up: r4(hit(E.rets)),
          // Pratik ölçüler (sonraki H gün): fiyat dibe/zirveye %5 ve %10 yakın mı, sonra en fazla ne kadar ters gitti, H gün sonra doğru yönde mi
          prac: { h: Math.min(sc.fwd, 63), all: pr(E.pa), mult: E.pc.map((q, i) => ({ m: MULTS[i], ...pr(q) })) },
        } : undefined
        entry[side] = {
          model: M.B, pivots: S.piv, gap: [quant(S.gaps, 0.25), quant(S.gaps, 0.5), quant(S.gaps, 0.75)],
          feats: Object.fromEntries(ids.map((id, i) => [id, [r4(quant(S.zone[i], 0.25)), r4(quant(S.zone[i], 0.5)), r4(quant(S.zone[i], 0.75)), r4(quant(S.all[i], 0.5))]])),
          test,
        }
        const top = M.B.w.map((w, i) => ({ id: ids[i], w })).sort((a, b) => Math.abs(b.w) - Math.abs(a.w)).slice(0, 6).map((q) => `${q.id}${q.w > 0 ? '+' : '−'}${Math.abs(q.w).toFixed(2)}`).join(' ')
        console.log(`${sc.label.padEnd(13)} ${side === 'low' ? 'taban' : 'tepe '}: ${String(S.piv).padStart(6)} dönüş, olağan %${(M.B.base * 100).toFixed(1)} | ${top}`)
        if (test) { const a = test.prac.all, c = test.prac.mult.find((q) => q.m === 5)!, f = (v: number) => (v * 100).toFixed(0); console.log(`    PRATİK (${test.prac.h} gün): aday ${c.n} gün | dibe/zirveye %5 yakın ${f(c.near5)} vs ${f(a.near5)} | %10 yakın ${f(c.near10)} vs ${f(a.near10)} | sonra en çok %5 ters ${f(c.dd5)} vs ${f(a.dd5)} | %10 ${f(c.dd10)} vs ${f(a.dd10)} | doğru yön ${f(c.good)} vs ${f(a.good)} | ortanca ters ${(c.adv*100).toFixed(1)} vs ${(a.adv*100).toFixed(1)} (kötü çeyrek ${(c.adv75*100).toFixed(1)} vs ${(a.adv75*100).toFixed(1)}) | getiri ${(c.ret*100).toFixed(1)} vs ${(a.ret*100).toFixed(1)}`) }
        if (test) console.log(`    sınama: ${test.days} gün, olağan %${(test.base * 100).toFixed(1)}; ` + test.mult.map((q) => `≥${q.m}x: %${(q.prec * 100).toFixed(0)} (${q.n} gün, yakalanan %${(q.recall * 100).toFixed(0)}, sonra ${(q.ret * 100).toFixed(1)}%/${(q.up * 100).toFixed(0)})`).join('  ') + `  | tüm günler sonra ${(test.ret * 100).toFixed(1)}%/${(test.up * 100).toFixed(0)}`)
        else console.log('    sınama: yeterli örnek yok')
      }
      scales[sc.id] = entry
    }
    out[u.key] = { label: u.label, series: u.series.length, ids, scales }
  }
  writeFileSync(OUT, JSON.stringify({ generated: Date.now(), split: { train: T_TRAIN, test: T_TEST }, mults: MULTS, universes: out }))
})
