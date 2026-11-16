import { describe, expect, it } from 'vitest'
// @ts-expect-error: düz JS modülü (sunucuyla ortak)
import { packBars, shardOf as serverShard, SHARDS as SERVER_SHARDS } from '../../server/bars.mjs'
import { SHARDS, shardOf, unpackBars, withLive } from './bars'

describe('derin geçmiş', () => {
  it('parça numarası sunucu ve istemcide aynı', () => {
    expect(SHARDS).toBe(SERVER_SHARDS)
    for (const s of ['NASDAQ:SNDK', 'BIST:THYAO', 'nasdaq:aapl', 'OANDA:XAUUSD', 'BIST:XU100']) {
      expect(shardOf(s)).toBe(serverShard(s))
      expect(shardOf(s)).toBeLessThan(SHARDS)
    }
    expect(shardOf('nasdaq:aapl')).toBe(shardOf('NASDAQ:AAPL'))
  })
  it('paketle ve aç: zaman ve kapanışlar korunur', () => {
    const raw = [{ t: 1_700_000_000, c: 10 }, { t: 1_700_003_600, c: 10.5 }, { t: 1_700_090_000, c: 0 }, { t: 1_700_176_400, c: 11.123456789 }]
    const b = unpackBars(packBars(raw))!
    expect(b.t).toEqual([1_700_000_000, 1_700_003_600, 1_700_176_400]) // sıfır kapanış atılır
    expect(b.c).toEqual([10, 10.5, 11.12346])
    expect(unpackBars(packBars([]))).toBeUndefined()
    // Hacim yalnızca istenirse paketlenir (günlük veri); 3 anlamlı basamak
    const withV = unpackBars(packBars([{ t: 1_700_000_000, c: 10, v: 123456 }, { t: 1_700_086_400, c: 11, v: 0 }], true))!
    expect(withV.v).toEqual([123000, 0])
    expect(unpackBars(packBars([{ t: 1_700_000_000, c: 10, v: 5 }]))!.v).toBeUndefined()
  })
  it('canlı fiyat: aynı dönemde son çubuğu günceller, yeni dönemde çubuk ekler', () => {
    const mon = Date.UTC(2026, 10, 9, 14, 30) / 1000 // 9 Kas 2026 Pazartesi
    const frames = { W: { t: [mon - 7 * 86400, mon], c: [100, 110] }, D: { t: [mon, mon + 86400], c: [108, 110] } }
    const wed = mon + 2 * 86400 + 3600
    const r = withLive(frames, 120, wed)
    expect(r.W!.c).toEqual([100, 120]) // aynı hafta
    expect(r.D!.c).toEqual([108, 110, 120]) // yeni gün
    expect(r.D!.t.at(-1)).toBe(wed)
    expect(withLive(frames, undefined, wed)).toBe(frames)
  })
})
