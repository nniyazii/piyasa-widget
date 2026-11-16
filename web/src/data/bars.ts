/**
 * Hisse analizi verisi: dört zaman diliminde kapanışlar. Sunucu varsa her sembol canlı (api/tv/bars),
 * statik yayında günlük kopyadaki parçalardan (data/bars/{W|D|H4|H1}/{nn}.json).
 */
import type { Bars, Timeframe } from '../core/signals'
import { historySource } from './history'

type Packed = [number, number[], number[]]
export const SHARDS = 64

/** Sembolün parçası (server/bars.mjs ile aynı) */
export function shardOf(symbol: string): number {
  let h = 0
  for (const ch of symbol.toUpperCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % SHARDS
}

export function unpackBars(p: Packed | null | undefined): Bars | undefined {
  if (!p || !p[2]?.length) return undefined
  const t = new Array<number>(p[2].length)
  let cur = p[0]
  for (let i = 0; i < t.length; i++) { if (i > 0) cur += p[1][i - 1] * 60; t[i] = cur }
  return { t, c: p[2] }
}

export interface DeepBars { symbol: string; generated: number; frames: Partial<Record<Timeframe, Bars>>; source: 'proxy' | 'snapshot' }

const TFS: Timeframe[] = ['W', 'D', 'H4', 'H1']
const files = new Map<string, Promise<Record<string, Packed> | undefined>>()
const json = <T,>(url: string) => fetch(url, { cache: 'no-cache' }).then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('json') ? (r.json() as Promise<T>) : undefined)).catch(() => undefined)

export async function loadBars(symbol: string): Promise<DeepBars | undefined> {
  const sym = symbol.toUpperCase()
  if ((await historySource()) === 'proxy') {
    const r = await json<{ generated: number; bars: Partial<Record<Timeframe, Packed>> }>(`api/tv/bars?symbol=${encodeURIComponent(sym)}`)
    if (!r) return undefined
    const frames: DeepBars['frames'] = {}
    for (const tf of TFS) { const b = unpackBars(r.bars[tf]); if (b) frames[tf] = b }
    return Object.keys(frames).length ? { symbol: sym, generated: r.generated, frames, source: 'proxy' } : undefined
  }
  const meta = await json<{ generated: number; shards: number }>('data/bars/meta.json')
  if (!meta) return undefined
  const nn = String(shardOf(sym)).padStart(2, '0')
  const frames: DeepBars['frames'] = {}
  await Promise.all(TFS.map(async (tf) => {
    const url = `data/bars/${tf}/${nn}.json?v=${meta.generated}`
    if (!files.has(url)) files.set(url, json<{ bars: Record<string, Packed> }>(url).then((x) => x?.bars))
    const b = unpackBars((await files.get(url))?.[sym])
    if (b) frames[tf] = b
  }))
  return Object.keys(frames).length ? { symbol: sym, generated: meta.generated, frames, source: 'snapshot' } : undefined
}

/** Çubuğun dönemi: aynı dönemdeyse son çubuk canlı fiyatla güncellenir, değilse yeni çubuk eklenir. */
const period = (tf: Timeframe, t: number) => {
  if (tf === 'W') return Math.floor((t / 86400 + 3) / 7) // pazartesiden başlayan hafta
  if (tf === 'D') return Math.floor(t / 86400)
  return Math.floor(t / (tf === 'H4' ? 4 * 3600 : 3600))
}

/** Kopya saatler önce alınmış olabilir: son çubuğu canlı fiyatla günceller (yeni dönem başladıysa çubuk ekler). */
export function withLive(frames: DeepBars['frames'], price: number | undefined, now = Date.now() / 1000): DeepBars['frames'] {
  if (!(price && price > 0)) return frames
  const out: DeepBars['frames'] = {}
  for (const tf of TFS) {
    const b = frames[tf]
    if (!b) continue
    const last = b.t[b.t.length - 1]
    out[tf] = period(tf, last) === period(tf, now) || now <= last
      ? { t: b.t, c: [...b.c.slice(0, -1), price] }
      : { t: [...b.t, now], c: [...b.c, price] }
  }
  return out
}
