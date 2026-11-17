/**
 * Hissenin karakteri sınaması: hisseye özgü eşik ve "dipten döner mi" karakteri, pazar genelinden iyi mi?
 *   npm run research -- research/character.research.ts --disable-console-intercept
 * 2021 öncesi: her hissenin kendi eşikleri ve kendi dip sonrası sonucu (karakter). 2021 sonrası: bunlar sınanır.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { it } from 'vitest'
import { extremeScore } from '../src/core/extremes'
import type { OHLCV } from '../src/core/study'
import { convert, framesFromFile, IN_USD, marketOfSubject, unpack, type CandleFile, type Packed } from '../src/core/subject'

const DIR = 'research/out/v3', CANDLES = 'public/data/candles'
const NOT_STOCK = /:(XU\d+|ALTIN|GLDTR|GMSTR|ZGOLD|ISGLK)$/
const SPLIT = Date.UTC(2021, 0, 1) / 1000
const q = (a: ArrayLike<number>, p: number) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
function spearman(x: number[], y: number[]) {
  const rank = (a: number[]) => { const idx = a.map((v, i) => [v, i]).sort((p, r) => p[0] - r[0]); const r = new Array(a.length); idx.forEach(([, i], k) => { r[i] = k }); return r as number[] }
  const rx = rank(x), ry = rank(y), mx = mean(rx), my = mean(ry)
  let n = 0, dx = 0, dy = 0
  for (let i = 0; i < x.length; i++) { n += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2 }
  return n / Math.sqrt(dx * dy)
}
interface Ev { t: number; r21: number; r63: number }
function events(b: OHLCV, S: Float64Array, ok: (i: number) => boolean, from: number, to: number): Ev[] {
  const out: Ev[] = []; let last = -1e9
  for (let i = 260; i + 63 < b.t.length; i++) {
    if (b.t[i] < from || b.t[i] >= to || Number.isNaN(S[i]) || !ok(i) || i - last < 21) continue
    last = i; out.push({ t: b.t[i], r21: b.c[i + 21] / b.c[i] - 1, r63: b.c[i + 63] / b.c[i] - 1 })
  }
  return out
}
const up = (e: Ev[], k: 'r21' | 'r63') => e.filter((x) => x[k] > 0).length / e.length

it('hissenin karakteri', () => {
  const candle = (id: string) => framesFromFile(JSON.parse(readFileSync(`${CANDLES}/${id}.json`, 'utf8')) as CandleFile).D
  const fx = candle('USDTRY')!
  const raw = new Map<string, OHLCV>()
  for (const f of readdirSync(`${DIR}/D`)) for (const [s, p] of Object.entries(JSON.parse(readFileSync(`${DIR}/D/${f}`, 'utf8')).bars as Record<string, Packed>)) { const b = unpack(p); if (b && b.t.length >= 1500 && !NOT_STOCK.test(s)) raw.set(s, b) }
  const ext = JSON.parse(readFileSync('public/data/extremes.json', 'utf8'))
  for (const [key, m] of [['US', 'US'], ['TR_USD', 'TR']] as const) {
    const M = ext.markets[key], pooled = M.th
    const day = (t: number) => Math.floor(t / 86400)
    const br = (t: number) => { const k = day(t) - M.breadth.d0; const v = M.breadth.v[k]; return v == null || v < 0 ? NaN : v / 1000 }
    const panic = (t: number) => br(t) >= M.breadth.q95
    const rows: { pre: Ev[]; post: Ev[]; postPool: Ev[]; basePre: number; basePost: number; prePanic: Ev[]; postPanic: Ev[]; postPoolPanic: Ev[] }[] = []
    for (const [s, b0] of raw) {
      if (marketOfSubject(s) !== m) continue
      const b = m === 'TR' ? convert(b0, fx, IN_USD) : b0
      if (!b || b.t.length < 1500) continue
      const S = extremeScore(b)
      const preVals: number[] = []
      for (let i = 0; i < b.t.length; i++) if (b.t[i] < SPLIT && !Number.isNaN(S[i])) preVals.push(S[i])
      if (preVals.length < 750) continue
      const own02 = q(preVals, 0.02)
      const all = (from: number, to: number) => events(b, S, () => true, from, to).length ? (() => { let u = 0, n = 0; for (let i = 260; i + 63 < b.t.length; i += 5) if (b.t[i] >= from && b.t[i] < to && !Number.isNaN(S[i])) { n++; if (b.c[i + 63] > b.c[i]) u++ } return u / n })() : NaN
      rows.push({
        pre: events(b, S, (i) => S[i] <= own02, 0, SPLIT),
        post: events(b, S, (i) => S[i] <= own02, SPLIT, Infinity),
        postPool: events(b, S, (i) => S[i] <= pooled.q02, SPLIT, Infinity),
        prePanic: events(b, S, (i) => S[i] <= own02 && panic(b.t[i]), 0, SPLIT),
        postPanic: events(b, S, (i) => S[i] <= own02 && panic(b.t[i]), SPLIT, Infinity),
        postPoolPanic: events(b, S, (i) => S[i] <= pooled.q01 && panic(b.t[i]), SPLIT, Infinity),
        basePre: all(0, SPLIT), basePost: all(SPLIT, Infinity),
      })
    }
    const flat = (k: 'post' | 'postPool' | 'postPanic' | 'postPoolPanic') => rows.flatMap((r) => r[k])
    const basePost = mean(rows.map((r) => r.basePost).filter((x) => !Number.isNaN(x)))
    const line = (name: string, e: Ev[]) => console.log(`  ${name.padEnd(52)} n=${String(e.length).padStart(5)}  1 ay %${(up(e, 'r21') * 100).toFixed(0)}  3 ay %${(up(e, 'r63') * 100).toFixed(0)}  ortanca 3 ay ${(q(e.map((x) => x.r63), 0.5) * 100).toFixed(1)}%`)
    console.log(`\n=== ${key}: ${rows.length} hisse (en az 6 yıl geçmiş); 2021 sonrası her zaman 3 ay sonra yukarıda %${(basePost * 100).toFixed(0)}`)
    console.log('1) Eşik: pazar geneli mi, hissenin kendisi mi (2021 sonrası, en sert %2):')
    line('pazar geneli eşik', flat('postPool'))
    line('hissenin kendi eşiği', flat('post'))
    console.log('   + pazar genelinde panik:')
    line('pazar geneli eşik (en sert %1) + panik', flat('postPoolPanic'))
    line('hissenin kendi eşiği (%2) + panik', flat('postPanic'))
    // 2) Karakter: 2021 öncesi dipten dönme (kendi her zamanki oranına göre fark)
    const ch = rows.filter((r) => r.pre.length >= 5 && r.post.length >= 3)
    const preD = ch.map((r) => up(r.pre, 'r63') - r.basePre), postD = ch.map((r) => up(r.post, 'r63') - r.basePost)
    const rho = spearman(preD, postD)
    console.log(`2) Karakter sürüyor mu? ${ch.length} hisse: 2021 öncesi dip sonrası fark ile 2021 sonrası fark arasındaki sıra korelasyonu ${rho.toFixed(3)} (z ≈ ${(rho * Math.sqrt(ch.length - 1)).toFixed(2)}; |z| < 2 ise şanstan ayırt edilemez)`)
    const third = Math.floor(ch.length / 3), order = ch.map((r, i) => [preD[i], i] as const).sort((a, b) => a[0] - b[0])
    const groups: [string, number[]][] = [['2021 öncesi en kötü dönen üçte bir', order.slice(0, third).map((x) => x[1])], ['ortadaki üçte bir', order.slice(third, 2 * third).map((x) => x[1])], ['2021 öncesi en iyi dönen üçte bir', order.slice(2 * third).map((x) => x[1])]]
    for (const [name, ids] of groups) {
      const pre = ids.flatMap((i) => ch[i].pre), post = ids.flatMap((i) => ch[i].post)
      console.log(`  ${name.padEnd(36)} öncesi 3 ay %${(up(pre, 'r63') * 100).toFixed(0)} (n=${pre.length})  →  sonrası 3 ay %${(up(post, 'r63') * 100).toFixed(0)} (n=${post.length}), ortanca ${(q(post.map((x) => x.r63), 0.5) * 100).toFixed(1)}%`)
    }
    // 3) Karakter + panik
    const chp = rows.filter((r) => r.prePanic.length >= 2 && r.postPanic.length >= 1)
    if (chp.length > 30) {
      const pd = chp.map((r) => mean(r.prePanic.map((x) => x.r63))), qd = chp.map((r) => mean(r.postPanic.map((x) => x.r63)))
      console.log(`3) Panik dönemlerinde karakter: ${chp.length} hisse; öncesi ortalama getiri ile sonrası arasındaki sıra korelasyonu ${spearman(pd, qd).toFixed(3)} (z ≈ ${(spearman(pd, qd) * Math.sqrt(chp.length - 1)).toFixed(2)})`)
    }
    // 4) Sahte veri denetimi: karakterler rastgele karıştırılsa korelasyon dağılımı
    let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
    const sims: number[] = []
    for (let k = 0; k < 500; k++) { const p = [...preD]; for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]] } sims.push(spearman(p, postD)) }
    console.log(`4) Karıştırılmış veride korelasyon: %95 aralık ${q(sims, 0.025).toFixed(3)} … ${q(sims, 0.975).toFixed(3)}; gerçek ${rho.toFixed(3)}`)
  }
})
