import { describe, expect, it } from 'vitest'
import { breadthAt, extremeScore, percentileOf, priceForScore, scoreIfClose, statusOf, type MarketExtremes } from './extremes'
import type { OHLCV } from './study'

function series(n: number, drop = 0): OHLCV {
  const c = [100]
  for (let i = 1; i < n; i++) c.push(c[i - 1] * (i % 2 ? 1.012 : 0.99) * (i >= n - 15 ? 1 - drop : 1))
  return { t: c.map((_, i) => 1.6e9 + i * 86400), o: c, h: c.map((x) => x * 1.005), l: c.map((x) => x * 0.995), c }
}
const M = (breadth = true): MarketExtremes => ({ label: 'Deneme', stocks: 10, th: { q005: -2.5, q01: -2, q02: -1.6, q05: -1.1, q99: 1.7 }, rules: {}, episodes: [], ...(breadth ? { breadth: { d0: Math.floor(1.6e9 / 86400), v: Array.from({ length: 2000 }, (_, k) => (k > 1000 ? 400 : 50)), q90: 0.1, q95: 0.25 } } : {}) })

describe('abartılı satış', () => {
  it('puan: sert düşüş negatif, ilk 250 gün hesaplanmaz, yalnızca geçmiş kullanılır', () => {
    const calm = extremeScore(series(600)), crash = extremeScore(series(600, 0.03))
    expect(Number.isNaN(calm[100])).toBe(true)
    expect(crash[599]).toBeLessThan(calm[599] - 1)
    expect(crash[599]).toBeLessThan(-1.5)
    const b = series(600, 0.03), part = extremeScore({ ...b, t: b.t.slice(0, 500), c: b.c.slice(0, 500) })
    expect(part[499]).toBeCloseTo(crash[499], 10)
  })
  it('tetik fiyatı: o fiyattan kapanırsa puan eşiğe gelir; düşüşle puan azalır', () => {
    const b = series(600)
    const p = priceForScore(b, -2)!
    expect(p).toBeLessThan(b.c[599])
    expect(scoreIfClose(b, p)).toBeCloseTo(-2, 2)
    expect(scoreIfClose(b, p * 0.97)).toBeLessThan(-2)
  })
  it('durum: hisse ve pazar birlikte; tek başına düşüş ayrı', () => {
    const m = M(), quiet = 1.6e9 + 500 * 86400, panic = 1.6e9 + 1500 * 86400
    expect(breadthAt(m, panic)).toBeCloseTo(0.4)
    expect(statusOf(m, -2.2, breadthAt(m, panic))).toBe('strong')
    expect(statusOf(m, -1.8, breadthAt(m, panic))).toBe('near')
    expect(statusOf(m, -2.2, breadthAt(m, quiet))).toBe('alone')
    expect(statusOf(m, -1.2, breadthAt(m, quiet))).toBe('stretched')
    expect(statusOf(m, 0, breadthAt(m, panic))).toBe('none')
    // Genişlik yoksa (makro) yalnızca varlığın kendi düşüşü
    expect(statusOf(M(false), -1.8, undefined)).toBe('near')
    expect(percentileOf(m, -2)).toBeCloseTo(0.01)
    expect(percentileOf(m, 0)).toBe(1)
  })
})
