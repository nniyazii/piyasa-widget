import { describe, expect, it } from 'vitest'
import { advices, carried, hpiNow, moneyAdvices, ratioSeries, type Monthly, type RatioData } from './advice'

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
  it('gecikmeli seri en çok 3 ay ileri taşınır', () => {
    const at = carried([[10, 5], [11, 6]])
    expect([at(10), at(11), at(14), at(15), at(9)]).toEqual([5, 6, 6, undefined, undefined])
  })
  it('para arzına göre: fiyat arzdan hızlı arttıysa pahalı, yavaş arttıysa ucuz', () => {
    // 100 ay. TR M2 ayda %2, ABD M2 sabit. Dolar/TL ayda %3 (arzdan hızlı → pahalı); BIST sabit (arzdan yavaş → ucuz); altın $ sabit
    const g = (r: number) => (i: number) => 100 * (1 + r) ** i
    const d: RatioData = { generated: 0, series: {
      HPI: months(100, g(0.02)), GOLD: months(100, () => 2000), SILVER: months(100, () => 25), USDTRY: months(100, g(0.03)),
      TRM2: months(98, g(0.02)), USM2: months(98, () => 1000), XU100: months(100, () => 5000), // para arzı 2 ay gecikmeli
    } }
    const now = new Date(Date.UTC(Math.floor(24099 / 12), 24099 % 12, 15))
    const a = Object.fromEntries(moneyAdvices(d, {}, now).map((x) => [x.id, x]))
    expect(a['m2-usdtry'].action).toBe('Dolar sat')
    expect(a['m2-usdtry'].strength).toBe('strong')
    expect(a['m2-usdtry'].value).toBeCloseTo(100 * 1.03 ** 99 / (100 * 1.02 ** 97 / 1000), 6) // son arz ileri taşınır
    expect(a['m2-usdtry'].m2Month).toBe(24097)
    expect(a['m2-bist'].action).toBe('BIST al')
    expect(a['m2-gold-try'].action).toBe('Gram altın sat') // gram altın TL = sabit ons × hızla artan kur
    expect(a['m2-gold-usd'].vsMedian).toBeCloseTo(0, 9) // altın ve dolar arzı sabit: tam ortancada
    expect(Math.abs(a['m2-home'].vsMedian)).toBeLessThan(0.1) // ev arzla aynı hızda: ortanca civarı
    // Canlı fiyat verilirse o kullanılır
    expect(moneyAdvices(d, { xu100: 5000 * 100 }, now).find((x) => x.id === 'm2-bist')!.action).toBe('BIST sat')
    // Para arzı serisi yoksa (eski veri dosyası) boş döner
    expect(moneyAdvices({ generated: 0, series: { ...d.series, USM2: undefined } }, {}, now)).toEqual([])
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
