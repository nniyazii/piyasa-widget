import { describe, expect, it } from 'vitest'
// @ts-expect-error: düz JS modülü (sunucuyla ortak)
import { packBars, shardOf as serverShard, SHARDS as SERVER_SHARDS } from '../../server/bars.mjs'
import { withLive } from '../core/subject'
import { SHARDS, shardOf, unpackBars } from './bars'

describe('derin geçmiş', () => {
  it('parça numarası sunucu ve istemcide aynı', () => {
    expect(SHARDS).toBe(SERVER_SHARDS)
    for (const s of ['NASDAQ:SNDK', 'BIST:THYAO', 'nasdaq:aapl', 'OANDA:XAUUSD', 'BIST:XU100']) {
      expect(shardOf(s)).toBe(serverShard(s))
      expect(shardOf(s)).toBeLessThan(SHARDS)
    }
    expect(shardOf('nasdaq:aapl')).toBe(shardOf('NASDAQ:AAPL'))
  })
  it('paketle ve aç: zaman, mum ve hacim korunur', () => {
    const raw = [{ t: 1_700_000_000, o: 9.5, h: 10.2, l: 9.4, c: 10, v: 123456 }, { t: 1_700_086_400, o: 10, h: 10.6, l: 9.9, c: 10.5, v: 0 }, { t: 1_700_172_800, o: 1, h: 1, l: 1, c: 0, v: 5 }, { t: 1_700_259_200, o: 10.5, h: 11.2, l: 10.4, c: 11.123456789, v: 999 }]
    const b = unpackBars(packBars(raw))!
    expect(b.t).toEqual([1_700_000_000, 1_700_086_400, 1_700_259_200]) // sıfır kapanış atılır
    expect(b.c[0]).toBe(10)
    expect(b.c[2]).toBeCloseTo(11.12346, 4)
    expect(b.o[0]).toBeCloseTo(9.5, 4)
    expect(b.h[2]).toBeCloseTo(11.2, 4)
    expect(b.l[1]).toBeCloseTo(9.9, 4)
    expect(b.v?.[0]).toBeGreaterThan(120000)
    expect(unpackBars(packBars([]))).toBeUndefined()
  })
  it('canlı fiyat: aynı dönemde son mumu günceller, yeni dönemde mum ekler', () => {
    const mon = Date.UTC(2026, 10, 9, 14, 30) / 1000 // 9 Kas 2026 Pazartesi
    const f = (t: number[], c: number[]) => ({ t, o: c, h: c, l: c, c })
    const frames = { W: f([mon - 7 * 86400, mon], [100, 110]), D: f([mon, mon + 86400], [108, 110]) }
    const wed = mon + 2 * 86400 + 3600
    const r = withLive(frames, 120, wed)
    expect(r.W!.c).toEqual([100, 120]) // aynı hafta
    expect(r.W!.h[1]).toBe(120)
    expect(r.D!.c).toEqual([108, 110, 120]) // yeni gün
    expect(r.D!.t.at(-1)).toBe(wed)
    expect(withLive(frames, undefined, wed)).toBe(frames)
  })
})
