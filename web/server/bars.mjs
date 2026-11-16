/**
 * Hisse analizi için derin geçmiş: dört zaman diliminde kapanışlar.
 *   W  haftalık  (1000 çubuk ≈ 19 yıl)      D  günlük (3000 çubuk ≈ 12 yıl)
 *   H4 4 saatlik (1500 çubuk ≈ 2–3 yıl)     H1 saatlik (2000 çubuk ≈ 1 yıl)
 * Paket: [ilk zaman (sn), dakika cinsinden farklar[], kapanışlar[], hacimler[]?]. Hacim yalnızca günlük veride
 * tutulur (kurulumlar günlük veriyle çalışır; 3 anlamlı basamak yeter). Statik yayında semboller parçalara
 * (shard) bölünür: istemci tek sembol için tek küçük dosya indirir.
 */
import { tvBars } from './tv.mjs'

export const DEEP = { W: { res: '1W', count: 1000 }, D: { res: '1D', count: 3000 }, H4: { res: '240', count: 1500 }, H1: { res: '60', count: 2000 } }
export const SHARDS = 64

/** Sembolün parçası (istemcideki src/data/bars.ts ile aynı olmalı) */
export function shardOf(symbol) {
  let h = 0
  for (const ch of symbol.toUpperCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % SHARDS
}

const sig = (v) => Number(v.toPrecision(7))
export function packBars(bars, withVolume = false) {
  const b = (bars ?? []).filter((x) => x.c > 0)
  if (!b.length) return null
  const p = [b[0].t, b.slice(1).map((x, i) => Math.round((x.t - b[i].t) / 60)), b.map((x) => sig(x.c))]
  if (withVolume && b.some((x) => x.v > 0)) p.push(b.map((x) => (x.v > 0 ? Number(x.v.toPrecision(3)) : 0)))
  return p
}

/** Bir zaman diliminde tüm semboller → { sembol: paket } */
export async function deepBars(symbols, tf, onProgress) {
  const { res, count } = DEEP[tf]
  const r = await tvBars(symbols, { resolution: res, count, onProgress })
  const out = {}
  for (const s of symbols) { const p = packBars(r.get(s), tf === 'D'); if (p) out[s] = p }
  return out
}

/** Tek sembol, dört zaman dilimi (sunucu ucu için) */
export async function symbolBars(symbol) {
  const out = {}
  await Promise.all(Object.keys(DEEP).map(async (tf) => { const r = await deepBars([symbol], tf).catch(() => ({})); if (r[symbol]) out[tf] = r[symbol] }))
  return { generated: Date.now(), symbol, bars: out }
}
