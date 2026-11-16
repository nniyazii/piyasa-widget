import { describe, expect, it } from 'vitest'
import { analyze, durationLabel, findEvents, rsiSeries, signalStat, triggerPrice, wilsonLower, type Bars } from './signals'

const bars = (c: number[], step = 86400): Bars => ({ t: c.map((_, i) => 1_700_000_000 + i * step), c })
/** Tekrarlanabilir rastgele sayı (LCG) */
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)

describe('hisse analizi', () => {
  it('RSI: Wilder örneği ve uç durumlar', () => {
    // Wilder'ın klasik örnek serisi: ilk RSI ≈ 70,46
    const c = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00]
    const { rsi } = rsiSeries(c)
    expect(rsi[13]).toBeNaN()
    expect(rsi[14]).toBeCloseTo(70.46, 1)
    expect(rsi[15]).toBeCloseTo(66.25, 1)
    expect(rsiSeries(Array.from({ length: 20 }, (_, i) => 10 + i)).rsi[19]).toBe(100) // hiç düşüş yok
    expect(rsiSeries([1, 2, 3]).rsi.every(Number.isNaN)).toBe(true)
  })

  it('tetik fiyatı: o kapanış gelirse RSI tam eşikte olur', () => {
    const r = rng(7); const c = [100]
    for (let i = 0; i < 80; i++) c.push(c[i] * (1 + (r() - 0.5) * 0.04))
    const { rsi, gain, loss } = rsiSeries(c)
    const last = c[c.length - 1]
    const now = rsi[rsi.length - 1]
    const down = triggerPrice(last, gain, loss, 30, 'dip')!
    expect(down).toBeLessThan(last)
    expect(rsiSeries([...c, down]).rsi.at(-1)).toBeCloseTo(30, 6)
    const up = triggerPrice(last, gain, loss, 70, 'top')!
    expect(up).toBeGreaterThan(last)
    expect(rsiSeries([...c, up]).rsi.at(-1)).toBeCloseTo(70, 6)
    // Zaten eşiğin ötesindeyse fiyat gerekmez
    expect(triggerPrice(last, gain, loss, Math.ceil(now) + 1, 'dip')).toBeUndefined()
    expect(triggerPrice(last, gain, loss, Math.floor(now) - 1, 'top')).toBeUndefined()
  })

  it('sinyal: eşiği ilk geçiş; RSI 10 puan dönmeden yeniden sayılmaz', () => {
    const rsi = [NaN, 50, 29, 28, 31, 29, 41, 29, 60, 71, 69, 72, 59, 75]
    expect(findEvents(rsi, 30, 'dip')).toEqual([2, 7]) // 5'teki ikinci geçiş aynı düşüş (40'a dönmedi)
    expect(findEvents(rsi, 70, 'top')).toEqual([9, 13]) // 11'deki geçiş aynı yükseliş (60'a dönmedi)
  })

  it('Wilson alt sınırı az örnekte temkinlidir', () => {
    expect(wilsonLower(3, 3)).toBeLessThan(0.7)
    expect(wilsonLower(30, 30)).toBeGreaterThan(0.9)
    expect(wilsonLower(0, 0)).toBe(0)
  })

  it('her dipten sonra yükselen seri: dip sinyali teyitli; rastgele yürüyüşte teyit yok', () => {
    // 12 döngü: sert düşüş (RSI dibe iner), ardından toparlanma ve yatay seyir
    const c: number[] = [100]
    for (let k = 0; k < 12; k++) {
      for (let i = 0; i < 6; i++) c.push(c.at(-1)! * 0.97)
      for (let i = 0; i < 16; i++) c.push(c.at(-1)! * 1.012)
      for (let i = 0; i < 40; i++) c.push(c.at(-1)! * (i % 2 ? 1.004 : 0.996))
    }
    const b = bars(c); const { rsi } = rsiSeries(c)
    const s = signalStat(b, rsi, 'D', 'dip', 30)
    expect(s.events.length).toBeGreaterThanOrEqual(11) // ilk düşüş RSI hesaplanmadan önce başlar
    expect(s.main.hit).toBe(1)
    expect(s.main.median!).toBeGreaterThan(s.main.baseMedian!)
    expect(s.verdict).toBe('confirmed')
    expect(s.events[0].worst!).toBeLessThan(0) // sinyalden sonra bir süre daha düştü
    expect(analyze({ D: b }).bestDip?.verdict).toBe('confirmed')

    const r = rng(42); const w = [100]
    for (let i = 0; i < 3000; i++) w.push(w[i] * (1 + (r() - 0.5) * 0.03))
    const a = analyze({ D: bars(w) })
    expect(a.frames[0].dips.every((x) => x.verdict !== 'confirmed')).toBe(true)
    expect(a.frames[0].tops.every((x) => x.verdict !== 'confirmed')).toBe(true)
  })

  it('kısa geçmiş: yetersiz örnek olarak işaretlenir, şu anki durum yine hesaplanır', () => {
    const r = rng(3); const c = [50]
    for (let i = 0; i < 60; i++) c.push(c[i] * (1 + (r() - 0.5) * 0.05))
    const a = analyze({ W: bars(c, 7 * 86400), D: bars([1, 2, 3]) })
    expect(a.frames.map((f) => f.tf)).toEqual(['W']) // 3 çubukluk günlük seri atlanır
    expect(a.frames[0].dips.find((x) => x.level === 20)!.verdict).toBe('thin')
    expect(a.frames[0].rsi).toBeGreaterThan(0)
  })

  it('süre etiketi takvim süresine göre', () => {
    expect(durationLabel(13, 7 * 86400)).toBe('3 ay')
    expect(durationLabel(21, 86400 * 365.25 / 252)).toBe('4 hafta')
    expect(durationLabel(63, 86400 * 365.25 / 252)).toBe('3 ay')
    expect(durationLabel(5, 86400 * 365.25 / 252)).toBe('7 gün')
    expect(durationLabel(7, 3600 * 24 * 365.25 / (252 * 7))).toBe('1 gün')
  })
})
