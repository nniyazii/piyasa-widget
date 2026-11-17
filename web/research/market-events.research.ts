/**
 * Olayların pazar geneli kanıtı → events-market.json
 *   DATA=dist/data/bars OUT=dist/data/events-market.json npm run market-events
 * Grafik tezgâhındaki her olay için, pazardaki (BIST, BIST dolar bazında, ABD) tüm hisselerde olaydan sonraki
 * dört vadede yukarıda olma oranı, olağan oran ve üçüncü vadede üç takvim dönemindeki sonuç.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { periodOf, USDTRY } from '../src/core/setups'
import { eventDefs, HORIZONS, onsets, prepare, type OHLCV, type Tf } from '../src/core/study'
import { convert, IN_USD, marketOfSubject, toMonthly, unpack, type Packed } from '../src/core/subject'

const DIR = process.env.DATA ?? 'research/out/v3'
const OUT = process.env.OUT ?? 'public/data/events-market.json'
const NOT_STOCK = /:(XU\d+|ALTIN|GLDTR|GMSTR|ZGOLD|ISGLK)$/
const MIN: Record<Tf, number> = { M: 60, W: 150, D: 400 }
const r3 = (x: number) => Number(x.toFixed(3))

function load(tf: 'W' | 'D'): Map<string, OHLCV> {
  const out = new Map<string, OHLCV>()
  for (const f of readdirSync(`${DIR}/${tf}`)) for (const [s, p] of Object.entries(JSON.parse(readFileSync(`${DIR}/${tf}/${f}`, 'utf8')).bars as Record<string, Packed>)) { const b = unpack(p); if (b) out.set(s, b) }
  return out
}

it('pazar geneli olay kanıtı', () => {
  if (!existsSync(`${DIR}/D`) || !existsSync(`${DIR}/W`)) throw new Error('mum verisi yok: ' + DIR)
  const frames: Record<'W' | 'D', Map<string, OHLCV>> = { W: load('W'), D: load('D') }
  const markets: Record<string, unknown> = {}
  for (const [key, m, usd] of [['TR', 'TR', false], ['TR_USD', 'TR', true], ['US', 'US', false]] as const) {
    const entry: Record<string, unknown> = { stocks: 0 }
    for (const tf of ['M', 'W', 'D'] as Tf[]) {
      const src = frames[tf === 'D' ? 'D' : 'W']
      const fx = usd ? src.get(USDTRY) : undefined
      if (usd && !fx) continue
      const defs = eventDefs(tf), H = HORIZONS[tf]
      // olay → vade → [n, yukarı]; dönemler üçüncü vadede
      const sig = new Map(defs.map((d) => [d.id, { n: H.map(() => 0), up: H.map(() => 0), p: [[0, 0], [0, 0], [0, 0]] }]))
      const base = { n: H.map(() => 0), up: H.map(() => 0), p: [[0, 0], [0, 0], [0, 0]] }
      let stocks = 0
      for (const [sym, raw] of src) {
        if (marketOfSubject(sym) !== m || NOT_STOCK.test(sym)) continue
        let b: OHLCV | undefined = fx ? convert(raw, fx, IN_USD) : raw
        if (tf === 'M') b = toMonthly(b)
        if (!b || b.t.length < MIN[tf]) continue
        stocks++
        const x = prepare(b, tf), c = x.c, n = x.n
        for (let i = x.start; i < n; i++) H.forEach((h, k) => {
          if (i + h >= n) return
          const up = c[i + h] > c[i]
          base.n[k]++; if (up) base.up[k]++
          if (k === 2) { const p = base.p[periodOf(x.t[i])]; p[0]++; if (up) p[1]++ }
        })
        for (const d of defs) {
          if (d.needsVolume && !x.v) continue
          const a = sig.get(d.id)!
          for (const i of onsets(x, d)) H.forEach((h, k) => {
            if (i + h >= n) return
            const up = c[i + h] > c[i]
            a.n[k]++; if (up) a.up[k]++
            if (k === 2) { const p = a.p[periodOf(x.t[i])]; p[0]++; if (up) p[1]++ }
          })
        }
      }
      entry.stocks = Math.max(entry.stocks as number, stocks)
      const rate = (u: number, n: number) => (n ? r3(u / n) : 0)
      entry[tf] = Object.fromEntries(defs.filter((d) => sig.get(d.id)!.n[0] >= 50).map((d) => {
        const a = sig.get(d.id)!
        return [d.id, [a.n, a.up.map((u, k) => rate(u, a.n[k])), base.up.map((u, k) => rate(u, base.n[k])), a.p.map((p, j) => [p[0], rate(p[1], p[0]), rate(base.p[j][1], base.p[j][0])])]]
      }))
      const rows = entry[tf] as Record<string, [number[], number[], number[], number[][]]>
      console.log(`${key} ${tf}: ${stocks} hisse, ${Object.keys(rows).length} olay`)
      if (process.env.VERBOSE) for (const [id, r] of Object.entries(rows)) console.log(`  ${id.padEnd(14)} n=${String(r[0][2]).padStart(7)} ${r[1].map((u, k) => `${Math.round(u * 100)}/${Math.round(r[2][k] * 100)}`).join('  ')}  | ${r[3].map((p) => `${Math.round(p[1] * 100)}/${Math.round(p[2] * 100)}(${p[0]})`).join(' ')}`)
    }
    markets[key] = entry
  }
  writeFileSync(OUT, JSON.stringify({ generated: Date.now(), markets }))
})
