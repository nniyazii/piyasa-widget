import { describe, expect, it } from 'vitest'
import { advices, hpiNow, ratioSeries, type Monthly, type RatioData } from './advice'

const months = (n: number, f: (i: number) => number, start = 24000): Monthly => Array.from({ length: n }, (_, i) => [start + i, f(i)])

describe('öneriler', () => {
  it('konut endeksi son 3 ayın artışıyla bugüne taşınır (en çok 4 ay)', () => {
    const hpi: Monthly = [[100, 100], [101, 110], [102, 121], [103, 133.1]] // ayda %10
    expect(hpiNow(hpi, 105)).toEqual({ value: expect.closeTo(133.1 * 1.21, 6), month: 103, gap: 2 })
    expect(hpiNow(hpi, 103)!.gap).toBe(0)
    expect(hpiNow(hpi, 120)!.gap).toBe(4)
  })
  it('ortak aylarda oran', () => {
    expect(ratioSeries([[1, 10], [2, 20], [3, 30]], [[2, 4], [3, 5]])).toEqual([[2, 5], [3, 6]])
  })
  it('ev altına göre ucuzsa "Altın boz, ev al"; dolara göre pahalıysa "Dolar biriktir"; rasyo yüksekse gümüş al', () => {
    // 100 ay: endeks sabit 100; gram altın 1.000'den 2.000'e (ev altın cinsinden ucuzluyor); dolar 20'den 10'a (ev dolar cinsinden pahalanıyor)
    const d: RatioData = { generated: 0, series: {
      HPI: months(100, () => 100),
      GOLD: months(100, (i) => (1000 + 10 * i) * 31.1034768 / (20 - 0.1 * i)),
      USDTRY: months(100, (i) => 20 - 0.1 * i),
      SILVER: months(100, (i) => ((1000 + 10 * i) * 31.1034768 / (20 - 0.1 * i)) / (60 + 0.3 * i)), // rasyo 60 → 90
    } }
    const now = new Date(Date.UTC(Math.floor(24099 / 12), 24099 % 12, 15))
    const [hg, hu, gs] = advices(d, {}, now)
    expect(hg.action).toBe('Altın boz, ev al')
    expect(hg.strength).toBe('strong')
    expect(hg.value).toBeCloseTo(100 / 1990, 6)
    expect(hg.percentile).toBe(0)
    expect(hu.action).toBe('Dolar biriktir')
    expect(hu.strength).toBe('strong')
    expect(gs.action).toBe('Altın sat, gümüş al')
    expect(gs.value).toBeCloseTo(89.7, 1)
    // Canlı fiyat verilirse o kullanılır: rasyo ortancanın altına inerse öneri döner
    expect(advices(d, { silver: d.series.GOLD[99][1] / 62 }, now)[2].action).toBe('Gümüş sat, altın al')
  })
})
