/**
 * Evren kanıtı: her kuralın, pazardaki (TR: BIST, US: ABD) tüm hisselerde birleşik sonucu → rules.json
 *   DATA=dist/data/bars OUT=dist/data/rules.json npm run rules
 * Her hissede kuralın sinyalleri bulunur; isabet, o hissenin aynı bağlamdaki olağan isabetiyle karşılaştırılır.
 * z = toplam (isabet − olağan) ÷ standart hata. Aynı günlerde birçok hisse birlikte hareket ettiği için z olduğundan
 * büyük görünür; bu yüzden tek başına değil, hissenin kendi kanıtıyla birlikte kullanılır.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { FILTERS, indicators, marketOf, ruleKey, signalStat, TRIGGERS, type Bars, type Timeframe, type UniverseRule } from '../src/core/signals'

const DIR = process.env.DATA ?? 'research/out/live'
const OUT = process.env.OUT ?? 'public/data/rules.json'
function unpack(p: [number, number[], number[]]): Bars { const t: number[] = []; let cur = p[0]; for (let i = 0; i < p[2].length; i++) { if (i > 0) cur += p[1][i - 1] * 60; t.push(cur) }; return { t, c: p[2] } }
const NOT_STOCK = /:(XU\d+|ALTIN|GLDTR|GMSTR|ZGOLD|ISGLK)$/

it('evren kanıtı', () => {
  const agg: Record<string, Map<string, { n: number; d: number; v: number; stocks: number }>> = { TR: new Map(), US: new Map() }
  const stocks: Record<string, Set<string>> = { TR: new Set(), US: new Set() }
  for (const tf of ['W', 'D', 'H4', 'H1'] as Timeframe[]) {
    if (!existsSync(`${DIR}/${tf}`)) continue
    for (const f of readdirSync(`${DIR}/${tf}`)) {
      const j = JSON.parse(readFileSync(`${DIR}/${tf}/${f}`, 'utf8')).bars as Record<string, [number, number[], number[]]>
      for (const [sym, p] of Object.entries(j)) {
        const m = marketOf(sym)
        if (!m || NOT_STOCK.test(sym) || !p?.[2] || p[2].length * Number(process.env.SHARE ?? 1) < 250) continue
        const whole = unpack(p)
        // SHARE: araştırma için geçmişin yalnızca ilk bölümü (ileriye dönük sınamada sonraki dönem görülmesin)
        const keep = Math.floor(whole.c.length * Number(process.env.SHARE ?? 1))
        const b = { t: whole.t.slice(0, keep), c: whole.c.slice(0, keep) }, s = indicators(b.c), cache = new Map()
        stocks[m].add(sym)
        for (const fl of FILTERS) for (const t of TRIGGERS) {
          if (t.ind === 'd200' && (fl === 'above200' || fl === 'below200')) continue
          const st = signalStat(b, s, tf, t, fl, cache, { light: true })
          const { n, hit, baseHit } = st.main
          if (!n || hit == null || baseHit == null) continue
          const k = ruleKey(tf, t, fl)
          const a = agg[m].get(k) ?? { n: 0, d: 0, v: 0, stocks: 0 }
          a.n += n; a.d += (hit - baseHit) * n; a.v += n * baseHit * (1 - baseHit); a.stocks++
          agg[m].set(k, a)
        }
      }
    }
  }
  const round = (x: number, d: number) => Number(x.toFixed(d))
  const markets = Object.fromEntries(Object.entries(agg).map(([m, map]) => [m, {
    stocks: stocks[m].size,
    rules: Object.fromEntries([...map].filter(([, a]) => a.n >= 100 && a.v > 0).map(([k, a]) => [k, { n: a.n, stocks: a.stocks, diff: round(a.d / a.n, 4), z: round(a.d / Math.sqrt(a.v), 2) } satisfies UniverseRule])),
  }]))
  writeFileSync(OUT, JSON.stringify({ generated: Date.now(), markets }))
  for (const [m, v] of Object.entries(markets)) { const r = Object.values(v.rules); console.log(`${m}: ${v.stocks} hisse, ${r.length} kural, z≥2 olan ${r.filter((x) => x.z >= 2).length}`) }
})
