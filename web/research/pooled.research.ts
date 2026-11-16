/**
 * Kuralların evren genelindeki (tüm hisselerde birleşik) sonucu kalıcı mı?
 * Her kural için: ilk %75'te birleşik isabet farkı (olağana göre) ile son %25'teki fark karşılaştırılır.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { FILTER_LABEL, FILTERS, filterHolds, HORIZONS, indicators, signalStat, TRIGGERS, triggerLabel, type Bars, type Timeframe } from '../src/core/signals'

const DIR = process.env.DATA ?? 'research/out/live'
const TFS: Timeframe[] = ['W', 'D', 'H4', 'H1']
function unpack(p: [number, number[], number[]]): Bars { const t: number[] = []; let cur = p[0]; for (let i = 0; i < p[2].length; i++) { if (i > 0) cur += p[1][i - 1] * 60; t.push(cur) }; return { t, c: p[2] } }

it('birleşik kanıt', () => {
  type Agg = { n: number; hit: number; base: number; ex: number; stocks: number }
  const zero = (): Agg => ({ n: 0, hit: 0, base: 0, ex: 0, stocks: 0 })
  const past = new Map<string, Agg>(), fut = new Map<string, Agg>()
  for (const tf of TFS) for (const f of readdirSync(`${DIR}/${tf}`)) {
    const j = JSON.parse(readFileSync(`${DIR}/${tf}/${f}`, 'utf8')).bars as Record<string, [number, number[], number[]]>
    for (const [sym, p] of Object.entries(j)) {
      if (!/^(BIST|NASDAQ|NYSE):/.test(sym) || /XU\d|ALTIN|GLDTR|GMSTR|ZGOLD|ISGLK/.test(sym)) continue
      const market = sym.startsWith('BIST') ? 'TR' : 'US'
      const b = unpack(p)
      if (b.c.length < 300) continue
      const s = indicators(b.c)
      const h = HORIZONS[tf][1]
      const cut = Math.floor(b.c.length * 0.75)
      const cache = new Map()
      for (const fl of FILTERS) {
        // Bağlamın olağan sonucu: iki dönem ayrı
        const base = [{ n: 0, up: 0, sum: 0 }, { n: 0, up: 0, sum: 0 }]
        for (let i = 14; i + h < b.c.length; i++) if (filterHolds(fl, b.c, s, i)) { const r = b.c[i + h] / b.c[i] - 1; const k = i < cut ? 0 : 1; base[k].n++; if (r > 0) base[k].up++; base[k].sum += r }
        for (const t of TRIGGERS) {
          if (t.ind === 'd200' && (fl === 'above200' || fl === 'below200')) continue
          const st = signalStat(b, s, tf, t, fl, cache)
          const sign = t.side === 'dip' ? 1 : -1
          for (const [k, map] of [[0, past], [1, fut]] as const) {
            const ev = st.events.filter((e) => e.ret[1] != null && (k === 0 ? e.i < cut : e.i >= cut))
            if (!ev.length || !base[k].n) continue
            for (const key of [`${market}|${tf}|${t.id}|${fl}`, `ALL|${tf}|${t.id}|${fl}`]) {
              const a = map.get(key) ?? zero()
              const bh = (sign > 0 ? base[k].up : base[k].n - base[k].up) / base[k].n
              a.n += ev.length; a.hit += ev.filter((e) => e.ret[1]! * sign > 0).length; a.base += bh * ev.length
              a.ex += ev.reduce((x, e) => x + (e.ret[1]! - base[k].sum / base[k].n) * sign, 0); a.stocks++
              map.set(key, a)
            }
          }
        }
      }
    }
  }
  const rows = [...past].filter(([k, a]) => a.n >= 150 && (fut.get(k)?.n ?? 0) >= 50).map(([k, a]) => {
    const f = fut.get(k)!
    // z: birleşik isabet farkının standart hatasına oranı
    const z = (a.hit / a.n - a.base / a.n) / Math.sqrt(0.25 / a.n)
    return { k, n: a.n, d: a.hit / a.n - a.base / a.n, z, ex: a.ex / a.n, fn: f.n, fd: f.hit / f.n - f.base / f.n, fex: f.ex / f.n }
  })
  const corr = (xs: number[], ys: number[]) => { const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length; let sxy = 0, sx = 0, sy = 0; xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sx += (x - mx) ** 2; sy += (ys[i] - my) ** 2 }); return sxy / Math.sqrt(sx * sy) }
  const out: string[] = []
  for (const m of ['ALL', 'TR', 'US']) {
    const r = rows.filter((x) => x.k.startsWith(m + '|'))
    out.push(`${m}: kural ${r.length}, geçmiş fark ↔ sonraki fark korelasyonu: isabet ${corr(r.map((x) => x.d), r.map((x) => x.fd)).toFixed(2)}, getiri ${corr(r.map((x) => x.ex), r.map((x) => x.fex)).toFixed(2)}`)
    for (const [name, sel] of [['z≥4', (x: typeof r[0]) => x.z >= 4], ['z 2..4', (x: typeof r[0]) => x.z >= 2 && x.z < 4], ['z −2..2', (x: typeof r[0]) => Math.abs(x.z) < 2], ['z≤−2', (x: typeof r[0]) => x.z <= -2]] as const) {
      const g = r.filter(sel); if (!g.length) continue
      const fn = g.reduce((a, x) => a + x.fn, 0)
      out.push(`   ${name.padEnd(8)} kural ${String(g.length).padStart(4)}  geçmiş fark ${(g.reduce((a, x) => a + x.d * x.n, 0) / g.reduce((a, x) => a + x.n, 0) * 100).toFixed(1)} puan → sonraki dönem fark ${(g.reduce((a, x) => a + x.fd * x.fn, 0) / fn * 100).toFixed(1)} puan, getiri farkı ${(g.reduce((a, x) => a + x.fex * x.fn, 0) / fn * 100).toFixed(2)}% (sinyal ${fn})`)
    }
  }
  const lab = (k: string) => { const [m, tf, id, fl] = k.split('|'); return `${m} ${tf} ${triggerLabel(TRIGGERS.find((t) => t.id === id)!)}${fl === 'any' ? '' : ' | ' + FILTER_LABEL[fl as keyof typeof FILTER_LABEL]}` }
  out.push('EN GÜÇLÜ 25 (ALL):')
  for (const x of rows.filter((x) => x.k.startsWith('ALL|')).sort((a, b) => b.z - a.z).slice(0, 25)) out.push(`  z ${x.z.toFixed(1).padStart(5)} n ${String(x.n).padStart(5)} fark ${(x.d * 100).toFixed(1).padStart(5)} getiri ${(x.ex * 100).toFixed(2).padStart(6)}% → sonra n ${String(x.fn).padStart(5)} fark ${(x.fd * 100).toFixed(1).padStart(5)} getiri ${(x.fex * 100).toFixed(2).padStart(6)}%  ${lab(x.k)}`)
  console.log(out.join('\n'))
  writeFileSync('research/out/pooled.txt', out.join('\n'))
})
