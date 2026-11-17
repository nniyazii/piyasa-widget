/**
 * Endeks dipleri ve alım zamanlaması → index-dips.json
 *   CANDLES=dist/data/candles MACRO=dist/data/macro.json OUT=dist/data/index-dips.json npm run index-dips
 * Aylık kapanışlar (S&P 500 1966'dan, Nasdaq 100 1985'ten). Nakit 3 aylık ABD hazine faizi kazanır; endekse yaklaşık
 * temettü eklenir (S&P %2, Nasdaq %0,8 yıllık). Kurallar önceden tanımlıdır, veriye göre ayarlanmaz.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { accumulate, drawdowns, episodes, type IndexDips, type LumpResult, type RuleResult, type StrategyResult, type Windows } from '../src/core/indexDips'
import { framesFromFile, type CandleFile } from '../src/core/subject'

const CANDLES = process.env.CANDLES ?? 'public/data/candles', MACRO = process.env.MACRO ?? 'public/data/macro.json', OUT = process.env.OUT ?? 'public/data/index-dips.json'
const C = (id: string) => framesFromFile(JSON.parse(readFileSync(`${CANDLES}/${id}.json`, 'utf8')) as CandleFile)
const r4 = (x: number) => (Number.isFinite(x) ? Number(x.toPrecision(4)) : NaN)
const q = (a: number[], p: number) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN }
const mk = (t: number) => { const d = new Date(t * 1000); return d.getUTCFullYear() * 12 + d.getUTCMonth() }
const ym = (k: number) => `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`
function rsi(c: number[], p = 14) { const out = c.map(() => NaN); let g = 0, l = 0; for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1]; if (i <= p) { g += Math.max(0, d) / p; l += Math.max(0, -d) / p } else { g = (g * (p - 1) + Math.max(0, d)) / p; l = (l * (p - 1) + Math.max(0, -d)) / p } if (i >= p) out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l) } return out }

it('endeks dipleri', () => {
  const macro = JSON.parse(readFileSync(MACRO, 'utf8')).series as Record<string, [number, number][]>
  const ser = (k: string) => new Map(macro[k] ?? [])
  const at = (m: Map<number, number>, k: number) => { for (let j = 0; j < 4; j++) { const v = m.get(k - j); if (v != null) return v } return NaN }
  const T3 = ser('US3M'), FED = ser('FED'), UR = ser('USUR'), HY = ser('HY'), VIXm = ser('VIX')
  const vixD = C('VIX').D
  const out: Record<string, IndexDips> = {}
  for (const [id, name, etf, div] of [['SPX', 'S&P 500', 'SPY, VOO', 0.02], ['NDX', 'Nasdaq 100', 'QQQ', 0.008]] as const) {
    const F = C(id), M = F.M!, D = F.D!, n = M.t.length, c = M.c, k = M.t.map(mk)
    const { dd } = drawdowns(c), r14 = rsi(c)
    const ma10 = c.map((_, i) => (i >= 9 ? c.slice(i - 9, i + 1).reduce((a, b) => a + b) / 10 : NaN))
    const st = (i: number) => ({ vix: at(VIXm, k[i]), fed12: at(FED, k[i]) - at(FED, k[i] - 12), ur12: at(UR, k[i]) - at(UR, k[i] - 12), hy: at(HY, k[i]), rsi: r14[i] })
    const S = Array.from({ length: n }, (_, i) => st(i))
    const fin = (v: number) => (Number.isFinite(v) ? r4(v) : undefined)
    const eps = episodes(c, 0.1).map((e) => ({ peak: ym(k[e.peak]), trough: ym(k[e.trough]), ...(e.recover != null ? { recover: ym(k[e.recover]), up: e.recover - e.trough } : {}), depth: r4(e.depth), down: e.trough - e.peak, vix: fin(S[e.trough].vix), rsi: fin(S[e.trough].rsi), ur12: fin(S[e.trough].ur12), fed12: fin(S[e.trough].fed12), hy: fin(S[e.trough].hy) }))
    const deep = episodes(c, 0.15).map((e) => S[e.trough])
    const pattern = ([['vix', 'VIX (korku endeksi)'], ['rsi', 'Aylık RSI'], ['ur12', 'İşsizliğin 12 aylık değişimi (puan)'], ['hy', 'Riskli şirket tahvili faiz farkı (puan)']] as const).map(([key, label]) => ({ id: key, label, trough: r4(q(deep.map((s) => s[key]), 0.5)), all: r4(q(S.map((s) => s[key]), 0.5)) }))
    // Sinyaller
    const fwd = (i: number, h: number) => (i + h < n ? c[i + h] / c[i] - 1 : NaN)
    const minAfter = (i: number, h: number) => { let m = Infinity; for (let j = i + 1; j <= Math.min(n - 1, i + h); j++) m = Math.min(m, c[j]); return Math.min(0, m / c[i] - 1) }
    const defs: [string, string, (i: number) => boolean][] = [
      ['all', 'Herhangi bir ay', () => true],
      ['near', 'Zirveye %3’ten yakın', (i) => dd[i] > -0.03],
      ['dd10', 'Zirveden en az %10 aşağıda', (i) => dd[i] <= -0.1],
      ['dd20', 'Zirveden en az %20 aşağıda', (i) => dd[i] <= -0.2],
      ['dd30', 'Zirveden en az %30 aşağıda', (i) => dd[i] <= -0.3],
      ['vix30', 'VIX 30’un üstünde', (i) => S[i].vix >= 30],
      ['dd20ur', 'Zirveden %20 aşağıda ve işsizlik artıyor (resesyon)', (i) => dd[i] <= -0.2 && S[i].ur12 >= 0.5],
      ['dd20noUr', 'Zirveden %20 aşağıda ve işsizlik artmıyor', (i) => dd[i] <= -0.2 && S[i].ur12 < 0.5],
    ]
    const rules: RuleResult[] = defs.map(([rid, label, ok]) => {
      const idx = Array.from({ length: n }, (_, i) => i).filter((i) => ok(i) && i + 12 < n)
      const h = [6, 12, 24].map((hh) => { const r = idx.map((i) => fwd(i, hh)).filter(Number.isFinite); return [r4(r.filter((x) => x > 0).length / r.length), r4(q(r, 0.5))] as [number, number] })
      const ad = idx.map((i) => minAfter(i, 12))
      return { id: rid, label, n: idx.length, h, adv: r4(q(ad, 0.5)), adv25: r4(q(ad, 0.25)) }
    })
    // Birikim stratejileri
    const cashR = (i: number) => (Number.isFinite(at(T3, k[i])) ? at(T3, k[i]) / 100 / 12 : 0)
    const idxR = (i: number) => c[i] / c[i - 1] - 1 + div / 12
    const sdefs: [string, string, number, (i: number) => boolean, number?][] = [
      ['wait10', 'Birikimi nakitte tut, zirveden %10 düşünce hepsini al', 1, (i) => dd[i] <= -0.1],
      ['wait20', 'Birikimi nakitte tut, zirveden %20 düşünce hepsini al', 1, (i) => dd[i] <= -0.2],
      ['wait10max', 'Nakitte tut, %10 düşüşte al; 12 ay içinde düşmezse yine al', 1, (i) => dd[i] <= -0.1, 12],
      ['res10', 'Birikimin %70’ini her ay al, %30’unu %10 düşüşe sakla', 0.3, (i) => dd[i] <= -0.1],
      ['res20', 'Birikimin %70’ini her ay al, %30’unu %20 düşüşe sakla', 0.3, (i) => dd[i] <= -0.2],
      ['resvix', 'Birikimin %70’ini her ay al, %30’unu VIX 30’u geçince al', 0.3, (i) => S[i].vix >= 30],
    ]
    const win = (L: number, ok: (i: number) => boolean, reserve: number, maxWait?: number): Windows | undefined => {
      const starts = Array.from({ length: n - L - 1 }, (_, i) => i + 1)
      if (starts.length < 24) return undefined
      const r = starts.map((a) => accumulate(a, a + L - 1, reserve, ok, idxR, cashR, maxWait) / accumulate(a, a + L - 1, 0, () => false, idxR, cashR))
      return { n: r.length, beat: r4(r.filter((x) => x > 1).length / r.length), med: r4(q(r, 0.5) - 1), worst: r4(q(r, 0) - 1), best: r4(q(r, 1) - 1) }
    }
    const strategies: StrategyResult[] = sdefs.map(([sid, label, reserve, ok, mw]) => ({ id: sid, label, w10: win(120, ok, reserve, mw)!, ...(win(240, ok, reserve, mw) ? { w20: win(240, ok, reserve, mw) } : {}) }))
    // Toplu para: hepsi şimdi, 12 aya yay, %10 düşüş bekle (en çok 24 ay) — 5 yıl sonra karşılaştır
    const H = 60
    const lumpRun = (a: number, mode: string) => {
      let units = 0, cash = 1
      for (let i = a; i < a + H; i++) {
        if (i > a) { units *= 1 + idxR(i); cash *= 1 + cashR(i) }
        if (mode === 'now' && i === a) { units += cash; cash = 0 }
        if (mode === 'spread12' && i - a < 12) { const part = cash / (12 - (i - a)); units += part; cash -= part }
        if (mode === 'wait10' && cash > 0 && (dd[i] <= -0.1 || i - a >= 24)) { units += cash; cash = 0 }
      }
      return units + cash
    }
    const starts = Array.from({ length: n - H - 1 }, (_, i) => i + 1)
    const lump: LumpResult[] = ([['spread12', 'Parayı 12 aya yayarak al'], ['wait10', 'Zirveden %10 düşüşü bekle (en çok 24 ay), sonra al']] as const).map(([lid, label]) => {
      const r = starts.map((a) => lumpRun(a, lid) / lumpRun(a, 'now'))
      return { id: lid, label, n: r.length, beat: r4(r.filter((x) => x > 1).length / r.length), med: r4(q(r, 0.5) - 1), worst: r4(q(r, 0) - 1) }
    })
    // Bugün: günlük son kapanış ve bütün zamanların zirvesi
    const close = D.c[D.c.length - 1], peak = Math.max(...c, ...D.c), ddNow = close / peak - 1
    const vix = vixD ? vixD.c[vixD.c.length - 1] : undefined
    const ur12 = at(UR, k[n - 1]) - at(UR, k[n - 1] - 12)
    const buckets: [string, (x: number) => boolean][] = [['zirveye %3’ten yakın', (x) => x > -0.03], ['zirveden %3–10 aşağıda', (x) => x <= -0.03 && x > -0.1], ['zirveden %10–20 aşağıda', (x) => x <= -0.1 && x > -0.2], ['zirveden %20–30 aşağıda', (x) => x <= -0.2 && x > -0.3], ['zirveden %30’dan fazla aşağıda', (x) => x <= -0.3]]
    const [bl, bf] = buckets.find(([, f]) => f(ddNow))!
    const bi = Array.from({ length: n }, (_, i) => i).filter((i) => bf(dd[i]) && i + 24 < n)
    const r12 = bi.map((i) => fwd(i, 12))
    const fall = (lv: number, h: number) => bi.filter((i) => { for (let j = i + 1; j <= i + h; j++) if (c[j] / c[i] - 1 <= -lv) return true; return false }).length / bi.length
    const nowState = { dd: ddNow, vix: vix ?? NaN, ur12 }
    const active = defs.filter(([rid]) => rid !== 'all').filter(([rid]) => {
      const s = nowState
      return rid === 'near' ? s.dd > -0.03 : rid === 'dd10' ? s.dd <= -0.1 : rid === 'dd20' ? s.dd <= -0.2 : rid === 'dd30' ? s.dd <= -0.3 : rid === 'vix30' ? s.vix >= 30 : rid === 'dd20ur' ? s.dd <= -0.2 && s.ur12 >= 0.5 : rid === 'dd20noUr' ? s.dd <= -0.2 && s.ur12 < 0.5 : false
    }).map(([rid]) => rid)
    const now = {
      date: new Date(D.t[D.t.length - 1] * 1000).toISOString().slice(0, 10), close: r4(close), peak: r4(peak), dd: r4(ddNow), ...(vix != null ? { vix: r4(vix) } : {}), rsi: r4(r14[n - 1]), ur12: r4(ur12),
      levels: [0.1, 0.2, 0.3].map((x) => ({ dd: -x, price: r4(peak * (1 - x)) })),
      bucket: { label: bl, n: bi.length, up: r4(r12.filter((x) => x > 0).length / r12.length), med: r4(q(r12, 0.5)) },
      further: { n: bi.length, p10_12: r4(fall(0.1, 12)), p10_24: r4(fall(0.1, 24)), p20_24: r4(fall(0.2, 24)) },
      active,
    }
    out[id] = { name, etf, from: ym(k[0]), to: ym(k[n - 1]), months: n, episodes: eps, pattern, rules, strategies, lump, now }
    console.log(`${name}: ${eps.length} düşüş; bugün ${(ddNow * 100).toFixed(1)}% (${bl}); toplu para`, lump.map((l) => `${l.id} şimdiyi geçtiği %${Math.round(l.beat * 100)} ortanca ${(l.med * 100).toFixed(1)}%`).join(' | '))
  }
  writeFileSync(OUT, JSON.stringify({ generated: Date.now(), indices: out }))
})
