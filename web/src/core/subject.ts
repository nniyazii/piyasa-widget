/**
 * İncelenen varlık (özne): makro varlıklar (altın, petrol, endeksler…) ve tek tek hisseler aynı biçime getirilir:
 * aylık, haftalık ve günlük mumlar. Bu dosya yalnızca saf dönüşümleri içerir; veriyi uygulama ve sunucu ayrı getirir.
 */
import type { OHLCV, Tf } from './study'

export type Frames = Partial<Record<Tf, OHLCV>>
export interface AssetInfo { id: string; label: string; short: string; group: 'global' | 'tr'; /** Mum dosyası (türetilmişlerde kaynak) */ source?: string; via?: 'gram' | 'usd' }
/** Görünüm sayfasındaki makro varlıklar */
export const MACRO_ASSETS: AssetInfo[] = [
  { id: 'GOLD', label: 'Ons altın ($)', short: 'Altın', group: 'global' },
  { id: 'GAUTRY', label: 'Gram altın (TL)', short: 'Gram altın', group: 'tr', source: 'GOLD', via: 'gram' },
  { id: 'SILVER', label: 'Ons gümüş ($)', short: 'Gümüş', group: 'global' },
  { id: 'USDTRY', label: 'Dolar/TL', short: 'Dolar/TL', group: 'tr' },
  { id: 'XU100USD', label: 'BIST 100 (dolar bazında)', short: 'BIST (dolar)', group: 'tr', source: 'XU100', via: 'usd' },
  { id: 'XU100', label: 'BIST 100 (TL)', short: 'BIST (TL)', group: 'tr' },
  { id: 'SPX', label: 'S&P 500', short: 'ABD borsası', group: 'global' },
  { id: 'NDX', label: 'Nasdaq 100', short: 'Nasdaq', group: 'global' },
  { id: 'OIL', label: 'Brent petrol ($)', short: 'Petrol', group: 'global' },
  { id: 'GAS', label: 'Doğal gaz ($)', short: 'Doğal gaz', group: 'global' },
  { id: 'COPPER', label: 'Bakır ($)', short: 'Bakır', group: 'global' },
  { id: 'DXY', label: 'Dolar endeksi (DXY)', short: 'Dolar endeksi', group: 'global' },
  { id: 'BTC', label: 'Bitcoin ($)', short: 'Bitcoin', group: 'global' },
]
export const assetInfo = (id: string) => MACRO_ASSETS.find((a) => a.id === id)
export const isStock = (id: string) => id.includes(':')
export const marketOfSubject = (id: string): 'TR' | 'US' | undefined => (/^BIST:/i.test(id) ? 'TR' : /^(NASDAQ|NYSE|AMEX):/i.test(id) ? 'US' : undefined)

/** Makro mum dosyası: [[zaman, açılış, yüksek, düşük, kapanış, hacim?], …] */
export type CandleRow = [number, number, number, number, number, number?]
export type CandleFile = Partial<Record<Tf, CandleRow[]>>
export function fromRows(rows: CandleRow[] | undefined): OHLCV | undefined {
  if (!rows?.length) return undefined
  const hasV = rows.some((r) => (r[5] ?? 0) > 0)
  return { t: rows.map((r) => r[0]), o: rows.map((r) => r[1]), h: rows.map((r) => r[2]), l: rows.map((r) => r[3]), c: rows.map((r) => r[4]), ...(hasV ? { v: rows.map((r) => r[5] ?? 0) } : {}) }
}
export const framesFromFile = (f: CandleFile | undefined): Frames => ({ M: fromRows(f?.M), W: fromRows(f?.W), D: fromRows(f?.D) })

/** Hisse parçası (sürüm 3): [ilk zaman, dakika farkları, kapanışlar, hacimler | 0, açılışlar, yüksekler, düşükler] */
export type Packed = [number, number[], number[], (number[] | 0)?, number[]?, number[]?, number[]?]
export function unpack(p: Packed | null | undefined): OHLCV | undefined {
  if (!p || !p[2]?.length) return undefined
  const n = p[2].length, t = new Array<number>(n)
  let cur = p[0]
  for (let i = 0; i < n; i++) { if (i > 0) cur += p[1][i - 1] * 60; t[i] = cur }
  const c = p[2]
  const v = Array.isArray(p[3]) ? p[3] : undefined
  return { t, c, o: p[4] ?? c.map((x, i) => (i ? c[i - 1] : x)), h: p[5] ?? c, l: p[6] ?? c, ...(v ? { v } : {}) }
}

/** Her mumu, o mumun zamanındaki (yoksa önceki son) kur kapanışıyla çevirir: gram altın, dolar bazında fiyat */
export function convert(b: OHLCV | undefined, fx: OHLCV | undefined, f: (p: number, x: number) => number): OHLCV | undefined {
  if (!b || !fx?.t.length) return undefined
  const out: OHLCV = { t: [], o: [], h: [], l: [], c: [], ...(b.v ? { v: [] } : {}) }
  let k = 0
  for (let i = 0; i < b.t.length; i++) {
    while (k + 1 < fx.t.length && fx.t[k + 1] <= b.t[i] + 43200) k++
    if (fx.t[k] > b.t[i] + 43200) continue
    const x = fx.c[k]
    out.t.push(b.t[i]); out.o.push(f(b.o[i], x)); out.h.push(f(b.h[i], x)); out.l.push(f(b.l[i], x)); out.c.push(f(b.c[i], x)); if (b.v) out.v!.push(b.v[i])
  }
  return out
}
export const GRAM = (p: number, x: number) => (p * x) / 31.1035
export const IN_USD = (p: number, x: number) => p / x
export function convertFrames(a: Frames, fx: Frames, f: (p: number, x: number) => number): Frames {
  return { M: convert(a.M, fx.M ?? fx.W, f), W: convert(a.W, fx.W, f), D: convert(a.D, fx.D, f) }
}

/** Daha kısa mumlardan ay mumları (hisselerde aylık veri ayrı tutulmaz; haftalıktan türetilir) */
export function toMonthly(b: OHLCV | undefined): OHLCV | undefined {
  if (!b?.t.length) return undefined
  const out: OHLCV = { t: [], o: [], h: [], l: [], c: [], ...(b.v ? { v: [] } : {}) }
  let key = -1
  for (let i = 0; i < b.t.length; i++) {
    const d = new Date(b.t[i] * 1000), k = d.getUTCFullYear() * 12 + d.getUTCMonth()
    if (k !== key) { key = k; out.t.push(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000); out.o.push(b.o[i]); out.h.push(b.h[i]); out.l.push(b.l[i]); out.c.push(b.c[i]); if (b.v) out.v!.push(b.v[i]) }
    else { const j = out.t.length - 1; out.h[j] = Math.max(out.h[j], b.h[i]); out.l[j] = Math.min(out.l[j], b.l[i]); out.c[j] = b.c[i]; if (b.v) out.v![j] += b.v[i] }
  }
  return out
}

/** Mumun dönemi: canlı fiyat aynı dönemdeyse son mumu günceller, değilse yeni mum açar */
const period = (tf: Tf, t: number) => { if (tf === 'D') return Math.floor(t / 86400); if (tf === 'W') return Math.floor((t / 86400 + 3) / 7); const d = new Date(t * 1000); return d.getUTCFullYear() * 12 + d.getUTCMonth() }
/** Kopya saatler önce alınmış olabilir: son mum canlı fiyatla güncellenir (yeni dönem başladıysa mum eklenir; hacmi bilinmez) */
export function withLive(frames: Frames, price: number | undefined, now = Date.now() / 1000): Frames {
  if (!(price && price > 0)) return frames
  const out: Frames = {}
  for (const tf of ['M', 'W', 'D'] as Tf[]) {
    const b = frames[tf]
    if (!b?.t.length) continue
    const n = b.t.length - 1
    if (period(tf, b.t[n]) === period(tf, now) || now <= b.t[n]) {
      out[tf] = { ...b, c: [...b.c.slice(0, n), price], h: [...b.h.slice(0, n), Math.max(b.h[n], price)], l: [...b.l.slice(0, n), Math.min(b.l[n], price)] }
    } else {
      out[tf] = { t: [...b.t, now], o: [...b.o, price], h: [...b.h, price], l: [...b.l, price], c: [...b.c, price], ...(b.v ? { v: [...b.v, NaN] } : {}) }
    }
  }
  return out
}
