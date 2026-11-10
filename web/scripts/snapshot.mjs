/**
 * Statik yayın (GitHub Pages) için aylık fiyat geçmişi kopyası üretir:
 *   node scripts/snapshot.mjs [çıktı dizini = dist/data/history]
 *
 * Evren: tüm BIST hisseleri, piyasa değeri 10 milyar $ üstü ABD hisseleri, Dolar/TL ve hazır listedeki semboller.
 * Kaynak: Yahoo Finance aylık çubuklar (6 yıl). Uygulama bu dosyaları yalnızca 5 yıllık dip/zirve ya da
 * ortalama F/K isteyen dinamik listelerde, sunucu vekili yoksa kullanır.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.argv[2] ?? 'dist/data/history'
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
const CONCURRENCY = 4
const HALF_DAY = 12 * 3600

async function scan(market, body) {
  const r = await fetch(`https://scanner.tradingview.com/${market}/scan`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`TradingView ${market}: ${r.status}`)
  return (await r.json()).data.map((x) => x.s)
}

function yahooSymbol(tv) {
  const [ex, t] = tv.split(':')
  if (ex === 'BIST') return `${t}.IS`
  if (['NASDAQ', 'NYSE', 'AMEX', 'ARCA', 'BATS', 'CBOE', 'OTC'].includes(ex)) return t.replace(/\./g, '-')
  if (['FX', 'FX_IDC', 'OANDA'].includes(ex) && /^[A-Z]{6}$/.test(t)) return `${t}=X`
  return null
}

const round = (v) => (v == null || !Number.isFinite(v) ? null : Number(v.toPrecision(6)))

async function monthly(y) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const host = attempt % 2 ? 'query2.finance.yahoo.com' : 'query1.finance.yahoo.com'
    try {
      const r = await fetch(`https://${host}/v8/finance/chart/${encodeURIComponent(y)}?range=6y&interval=1mo`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) })
      if (r.status === 404) return null
      if (r.status === 429 || r.status >= 500) { await new Promise((res) => setTimeout(res, 1500 * 2 ** attempt)); continue }
      if (!r.ok) return null
      const res = (await r.json()).chart?.result?.[0]
      if (!res?.timestamp) return null
      const q = res.indicators?.quote?.[0] ?? {}
      // Ayın başına (UTC) çek: Yahoo borsanın yerel gece yarısında damgalar (BIST: önceki gün 21:00 UTC)
      return res.timestamp.map((t, i) => {
        const d = new Date((t + HALF_DAY) * 1000)
        return [Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000, round(q.low?.[i]), round(q.high?.[i]), round(q.close?.[i])]
      }).filter((b) => b[3] != null || b[1] != null)
    } catch {
      await new Promise((res) => setTimeout(res, 800 * 2 ** attempt))
    }
  }
  return null
}

const started = Date.now()
const bist = await scan('turkey', { filter: [{ left: 'type', operation: 'equal', right: 'stock' }], columns: ['name'], range: [0, 900], sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' } })
const us = await scan('america', {
  filter: [{ left: 'type', operation: 'equal', right: 'stock' }, { left: 'is_primary', operation: 'equal', right: true }, { left: 'market_cap_basic', operation: 'egreater', right: 10e9 }],
  columns: ['name'], range: [0, 1200], sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' },
})
const misc = ['FX:USDTRY', 'FX:EURTRY', 'BIST:ALTIN', 'BIST:GLDTR', 'BIST:GMSTR', 'NASDAQ:AAPL', 'NASDAQ:MSFT', 'NASDAQ:NVDA']
const groups = { bist, us, misc }
console.log(`Semboller: BIST ${bist.length}, ABD ${us.length}, diğer ${misc.length}`)

mkdirSync(OUT, { recursive: true })
const counts = {}
for (const [name, list] of Object.entries(groups)) {
  const bars = {}
  let next = 0, done = 0, missing = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < list.length) {
      const tv = list[next++]
      const y = yahooSymbol(tv)
      const b = y ? await monthly(y) : null
      if (b?.length) bars[tv] = b
      else missing++
      if (++done % 100 === 0) console.log(`  ${name}: ${done}/${list.length}`)
    }
  }))
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ generated: Date.now(), bars }))
  counts[name] = Object.keys(bars).length
  console.log(`${name}: ${counts[name]} sembol yazıldı, ${missing} bulunamadı`)
}
writeFileSync(join(OUT, 'meta.json'), JSON.stringify({ generated: Date.now(), counts }))
console.log(`Bitti: ${Math.round((Date.now() - started) / 1000)} sn`)
if (counts.bist < 100 || counts.us < 100) {
  console.error('Uyarı: beklenenden az sembol; Yahoo erişimi kısıtlanmış olabilir.')
  process.exitCode = 1
}
