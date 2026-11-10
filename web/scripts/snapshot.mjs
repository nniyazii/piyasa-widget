/**
 * Statik yayın (GitHub Pages) için fiyat geçmişi kopyası:
 *   node scripts/snapshot.mjs [çıktı = dist/data] [önceki yayın adresi]
 *
 * Üretilenler:
 *   history/{misc,bist,us}.json  aylık çubuklar (6 yıl): 5 yıllık dip/zirve, 5 yıllık ortalama F/K
 *   daily/{misc,bist,us}.json    günlük kapanışlar (~4 yıl): geçmişte test (backtest)
 *   history/meta.json            üretim zamanı ve sayılar
 *
 * Artımlı: önceki yayındaki kopya depo olarak kullanılır; her sembol için yalnızca son ~100 gün çekilir.
 * Bölünme/bedelsiz gibi geriye dönük düzeltmeler çakışan günlerden anlaşılır, o sembol baştan çekilir.
 * Kaynak TradingView (sunucu tarafı websocket); bağlanamazsa aylık için Yahoo denenir, o da olmazsa önceki kopya kalır.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { refreshHistory } from '../server/store.mjs'

const OUT = process.argv[2] ?? 'dist/data'
const BASE = (process.argv[3] ?? process.env.SNAPSHOT_BASE ?? '').replace(/\/$/, '')
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
const started = Date.now()
const sig = (v) => (v == null || !Number.isFinite(v) ? null : Number(v.toPrecision(6)))

async function scan(market, body) {
  const r = await fetch(`https://scanner.tradingview.com/${market}/scan`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`TradingView ${market}: ${r.status}`)
  return (await r.json()).data.map((x) => x.s)
}

async function loadBase(dir, name) {
  if (!BASE) return {}
  try {
    const r = await fetch(`${BASE}/${dir}/${name}.json`, { signal: AbortSignal.timeout(30000) })
    return r.ok ? (await r.json()).bars ?? {} : {}
  } catch {
    return {}
  }
}

// ------------------------------------------------------------------ Yahoo yedeği (yalnızca aylık)

const HALF_DAY = 12 * 3600
function yahooSymbol(tv) {
  const [ex, t] = tv.split(':')
  if (ex === 'BIST') return `${t}.IS`
  if (['NASDAQ', 'NYSE', 'AMEX', 'ARCA', 'BATS', 'CBOE', 'OTC'].includes(ex)) return t.replace(/\./g, '-')
  if (['FX', 'FX_IDC', 'OANDA'].includes(ex) && /^[A-Z]{6}$/.test(t)) return `${t}=X`
  return null
}
async function yahooMonthly(tv) {
  const y = yahooSymbol(tv)
  if (!y) return null
  try {
    const r = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?range=6y&interval=1mo`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) })
    if (!r.ok) return null
    const res = (await r.json()).chart?.result?.[0]
    const q = res?.indicators?.quote?.[0] ?? {}
    return res?.timestamp?.map((t, i) => {
      const d = new Date((t + HALF_DAY) * 1000)
      return [Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000, sig(q.low?.[i]), sig(q.high?.[i]), sig(q.close?.[i])]
    }).filter((b) => b[3] != null) ?? null
  } catch {
    return null
  }
}

// ------------------------------------------------------------------ evren

const bist = await scan('turkey', { filter: [{ left: 'type', operation: 'equal', right: 'stock' }], columns: ['name'], range: [0, 900], sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' } })
const us = await scan('america', {
  filter: [{ left: 'type', operation: 'equal', right: 'stock' }, { left: 'is_primary', operation: 'equal', right: true }, { left: 'market_cap_basic', operation: 'egreater', right: 10e9 }],
  columns: ['name'], range: [0, 1200], sort: { sortBy: 'market_cap_basic', sortOrder: 'desc' },
})
// Kur, karşılaştırma endeksleri ve hazır listedeki semboller
const misc = ['FX:USDTRY', 'FX:EURTRY', 'BIST:XU100', 'BIST:XU030', 'SP:SPX', 'NASDAQ:NDX', 'BIST:ALTIN', 'BIST:GLDTR', 'BIST:GMSTR', 'OANDA:XAUUSD', 'TVC:SILVER']
const groups = { misc, bist, us }
console.log(`Semboller: BIST ${bist.length}, ABD ${us.length}, diğer ${misc.length}`)

mkdirSync(join(OUT, 'history'), { recursive: true })
mkdirSync(join(OUT, 'daily'), { recursive: true })
const counts = {}
const totals = { incremental: 0, full: 0, kept: 0, failed: 0, yahoo: 0 }
let tvOk = true
for (const [name, list] of Object.entries(groups)) {
  const base = { daily: await loadBase('daily', name), monthly: await loadBase('history', name) }
  let r = { daily: {}, monthly: {}, stats: { incremental: 0, full: 0, kept: 0, failed: list.length } }
  if (tvOk) {
    try {
      r = await refreshHistory(list, base, { onProgress: (d, n) => { if (d % 200 === 0) console.log(`  ${name}: ${d}/${n}`) } })
    } catch (e) {
      tvOk = false
      console.log(`TradingView'a bağlanılamadı (${e.message}); aylık geçmiş için Yahoo denenecek`)
    }
  }
  let yahoo = 0
  for (const tv of list) {
    if (!r.monthly[tv] && Date.now() - started < 8 * 60_000) {
      const y = await yahooMonthly(tv)
      if (y?.length) { r.monthly[tv] = y; yahoo++ }
    }
    if (!r.monthly[tv] && base.monthly[tv]) r.monthly[tv] = base.monthly[tv]
    if (!r.daily[tv] && base.daily[tv]) r.daily[tv] = base.daily[tv]
  }
  writeFileSync(join(OUT, 'history', `${name}.json`), JSON.stringify({ generated: Date.now(), bars: r.monthly }))
  writeFileSync(join(OUT, 'daily', `${name}.json`), JSON.stringify({ generated: Date.now(), bars: r.daily }))
  counts[name] = Object.keys(r.monthly).length
  for (const k of ['incremental', 'full', 'kept', 'failed']) totals[k] += r.stats[k]
  totals.yahoo += yahoo
  console.log(`${name}: ${counts[name]} sembol (son günler eklendi ${r.stats.incremental}, baştan çekildi ${r.stats.full}, eskisi korundu ${r.stats.kept}, Yahoo ${yahoo}); günlük ${Object.keys(r.daily).length}`)
}
const fresh = totals.incremental + totals.full + totals.yahoo
writeFileSync(join(OUT, 'history', 'meta.json'), JSON.stringify({ generated: Date.now(), counts, fresh, ...totals, source: tvOk ? 'tradingview' : 'yahoo' }))
console.log(`Bitti: ${Math.round((Date.now() - started) / 1000)} sn, ${fresh} sembol güncel`)
