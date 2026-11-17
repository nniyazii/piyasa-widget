/**
 * Hisse analizi için derin geçmiş: haftalık ve günlük mumlar (açılış, yüksek, düşük, kapanış, hacim).
 *   W  haftalık (1000 mum ≈ 19 yıl)      D  günlük (3000 mum ≈ 12 yıl)
 * Paket (sürüm 3): [ilk zaman (sn), dakika cinsinden farklar[], kapanışlar[], hacimler[] | 0, açılışlar[], yüksekler[], düşükler[]]
 * Statik yayında semboller parçalara (shard) bölünür: istemci tek sembol için tek küçük dosya indirir.
 */
import { tvBars } from './tv.mjs'

export const DEEP = { W: { res: '1W', count: 1000 }, D: { res: '1D', count: 3000 } }
export const SHARDS = 64
export const BARS_VERSION = 3

/** Sembolün parçası (istemcideki src/data/bars.ts ile aynı olmalı) */
export function shardOf(symbol) {
  let h = 0
  for (const ch of symbol.toUpperCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % SHARDS
}

const sig = (v, d = 7) => Number(v.toPrecision(d))
export function packBars(bars) {
  const b = (bars ?? []).filter((x) => x.c > 0)
  if (!b.length) return null
  const hasV = b.some((x) => x.v > 0)
  // Açılış/yüksek/düşük eksikse kapanışla doldurulur (mum yine çizilebilsin)
  const f = (x, k) => (x[k] > 0 ? sig(x[k], 5) : sig(x.c, 5))
  return [
    b[0].t, b.slice(1).map((x, i) => Math.round((x.t - b[i].t) / 60)), b.map((x) => sig(x.c)),
    hasV ? b.map((x) => (x.v > 0 ? Number(x.v.toPrecision(3)) : 0)) : 0,
    b.map((x) => f(x, 'o')), b.map((x) => f(x, 'h')), b.map((x) => f(x, 'l')),
  ]
}

/** Bir zaman diliminde tüm semboller → { sembol: paket } */
export async function deepBars(symbols, tf, onProgress) {
  const { res, count } = DEEP[tf]
  const r = await tvBars(symbols, { resolution: res, count, onProgress })
  const out = {}
  for (const s of symbols) { const p = packBars(r.get(s)); if (p) out[s] = p }
  return out
}

/** Tek sembol, iki zaman dilimi (sunucu ucu için) */
export async function symbolBars(symbol) {
  const out = {}
  await Promise.all(Object.keys(DEEP).map(async (tf) => { const r = await deepBars([symbol], tf).catch(() => ({})); if (r[symbol]) out[tf] = r[symbol] }))
  return { generated: Date.now(), symbol, bars: out }
}
