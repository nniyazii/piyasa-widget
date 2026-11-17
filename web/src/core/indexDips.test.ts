import { describe, expect, it } from 'vitest'
import { accumulate, drawdowns, episodes } from './indexDips'

describe('endeks dipleri', () => {
  it('zirveden düşüş ve dönemler', () => {
    const c = [100, 110, 99, 88, 95, 112, 120, 100, 105]
    const { dd, peak } = drawdowns(c)
    expect(peak).toEqual([100, 110, 110, 110, 110, 112, 120, 120, 120])
    expect(dd[3]).toBeCloseTo(-0.2)
    const e = episodes(c, 0.1)
    expect(e).toHaveLength(2)
    expect(e[0]).toMatchObject({ peak: 1, trough: 3, recover: 5 })
    expect(e[0].depth).toBeCloseTo(-0.2)
    expect(e[1]).toMatchObject({ peak: 6, trough: 7 }) // sürüyor
    expect(e[1].recover).toBeUndefined()
    expect(episodes(c, 0.25)).toHaveLength(0)
  })
  it('birikim: düzenli alım ile nakitte bekleme', () => {
    // Her ay %1 yükselen endeks: beklemek kaybettirir; düşüş hiç gelmez
    const up = () => 0.01, cash = () => 0
    const dca = accumulate(0, 11, 0, () => false, up, cash)
    const wait = accumulate(0, 11, 1, () => false, up, cash)
    expect(wait).toBe(12)
    expect(dca).toBeGreaterThan(12.5)
    // En çok 3 ay bekleme: nakit 3 ayda bir endekse geçer
    expect(accumulate(0, 11, 1, () => false, up, cash, 3)).toBeGreaterThan(12)
    expect(accumulate(0, 11, 1, () => false, up, cash, 3)).toBeLessThan(dca)
    // Yarı nakit, kural hemen sağlanıyorsa düzenli alımla aynı
    expect(accumulate(0, 11, 0.5, () => true, up, cash)).toBeCloseTo(dca, 10)
  })
})
