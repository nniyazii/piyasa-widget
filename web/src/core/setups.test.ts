import { describe, expect, it } from 'vitest'
import { condLabel, DIP_FLAGS, periodOf, prepare, regimeMap, setupDays, setupHolds, setupKey, SETUPS, stockSetups, strength, tableKey, toUsd, type SetupEvidence, type SetupTable } from './setups'
import type { Bars } from './signals'

const DAY = 86400
const T0 = Date.UTC(2015, 0, 1) / 1000
const bars = (c: number[]): Bars => ({ t: c.map((_, i) => T0 + i * DAY), c })
const S = (id: string) => SETUPS.find((s) => s.id === id)!
/** Yatay seyir, ardından sert bir düşüş (son günlerde RSI dipte) */
function crashed(extra = 0): number[] {
  const c = [100]
  for (let i = 0; i < 700; i++) c.push(c.at(-1)! * (i % 2 ? 1.004 : 0.997))
  for (let i = 0; i < 12 + extra; i++) c.push(c.at(-1)! * 0.96)
  return c
}

describe('güçlü kurulumlar', () => {
  it('kurulum günleri: koşulların sağlandığı ilk gün, 21 gün içinde yeniden sayılmaz', () => {
    const x = prepare(bars(crashed()))
    const n = x.c.length - 1
    expect(setupHolds(x, S('rsi30'), n)).toBe(true)
    expect(setupHolds(x, S('ma20'), n)).toBe(true) // 200 ortalamanın %20 altı ve RSI 30 altı
    expect(setupHolds(x, S('dip4'), n)).toBe(true)
    expect(setupHolds(x, S('rsi75'), n)).toBe(false)
    const days = setupDays(x, S('rsi30'))
    expect(days.length).toBe(1) // 12 günlük düşüş tek kurulum
    expect(x.s.rsi[days[0]]).toBeLessThanOrEqual(30)
    expect(x.s.rsi[days[0] - 1]).toBeGreaterThan(30)
    expect(DIP_FLAGS.length).toBe(5)
    expect(condLabel(S('ma20').conds[0])).toBe('200 ortalamaya uzaklık ≤ −%20')
    expect(condLabel(S('rsi30').conds[0])).toBe('RSI ≤ 30')
  })

  it('haftalık ölçekte RSI son gün için kendi zincirinden hesaplanır', () => {
    const x = prepare(bars(crashed()))
    expect(x.rsiW.at(-1)!).toBeLessThan(40)
    expect(Number.isNaN(x.rsiW.at(-1)!)).toBe(false)
  })

  it('güçlü: üç dönemin üçünde de olağandan iyi; gösterilen isabet en düşük dönemden', () => {
    const ev = (p: [number, number, number][]): SetupEvidence => ({ stocks: 500, periods: p.map(([n, hit, base]) => [n, hit, base, 0.6, 0.55, 0.05, 0.02]) })
    const ok = strength(ev([[300, 0.84, 0.77], [1400, 0.74, 0.59], [230, 0.81, 0.72]]), 'dip')!
    expect(ok).toMatchObject({ strong: true, hit: 0.74, base: 0.59, n: 1930 })
    expect(strength(ev([[300, 0.84, 0.77], [1400, 0.74, 0.59], [230, 0.60, 0.65]]), 'dip')!.strong).toBe(false) // son dönemde tutmadı
    expect(strength(ev([[300, 0.84, 0.77], [1400, 0.74, 0.59], [230, 0.60, 0.65]]), 'dip')!.reason).toContain('2024')
    expect(strength(ev([[300, 0.84, 0.77], [40, 0.9, 0.59], [230, 0.81, 0.72]]), 'dip')!.strong).toBe(false) // örnek az
    expect(strength(ev([[300, 0.62, 0.55], [1400, 0.64, 0.55], [230, 0.63, 0.55]]), 'dip')!.strong).toBe(false) // isabet tabanın altında
    expect(strength(undefined, 'dip')).toBeUndefined()
    expect(periodOf(Date.UTC(2019, 5, 1) / 1000)).toBe(0)
    expect(periodOf(Date.UTC(2022, 5, 1) / 1000)).toBe(1)
    expect(periodOf(Date.UTC(2025, 5, 1) / 1000)).toBe(2)
  })

  it('dolar bazı: her gün o günün kuruna bölünür; kur yoksa önceki son kur; hacim korunur', () => {
    const stock: Bars = { t: [T0, T0 + DAY, T0 + 2 * DAY, T0 + 3 * DAY], c: [100, 110, 120, 130], v: [1, 2, 3, 4] }
    const fx: Bars = { t: [T0 + DAY, T0 + 3 * DAY], c: [10, 13] }
    const u = toUsd(stock, fx)
    expect(u.t).toEqual([T0 + DAY, T0 + 2 * DAY, T0 + 3 * DAY]) // kurun bilinmediği ilk gün atlanır
    expect(u.c).toEqual([11, 12, 10]) // 3. günde önceki kur (10), 4. günde yeni kur (13)
    expect(u.v).toEqual([2, 3, 4])
    expect(tableKey('TR', 'usd')).toBe('TR_USD')
    expect(tableKey('TR', 'try')).toBe('TR')
    expect(tableKey('US', 'usd')).toBe('US')
    // TL'de yatay, kur yükselirken: dolar bazında düşüş, RSI dipte
    const flat = Array.from({ length: 400 }, (_, i) => 100 * (i % 2 ? 1.003 : 0.998))
    const rate = Array.from({ length: 400 }, (_, i) => 10 * 1.01 ** Math.max(0, i - 370))
    const x = prepare(toUsd(bars(flat), bars(rate)))
    expect(x.s.rsi.at(-1)!).toBeLessThan(30)
    expect(prepare(bars(flat)).s.rsi.at(-1)!).toBeGreaterThan(40)
  })

  it('hissenin durumu: açık kurulum öne çıkar; piyasa durumu uymuyorsa açık sayılmaz; uzaklık hesaplanır', () => {
    const strongEv: SetupEvidence = { stocks: 500, periods: [[500, 0.8, 0.6, 0.6, 0.5, 0.1, 0.02], [500, 0.78, 0.6, 0.6, 0.5, 0.1, 0.02], [500, 0.75, 0.6, 0.6, 0.5, 0.1, 0.02]] }
    const table: SetupTable = { [setupKey('rsi30', 'bear')]: strongEv, [setupKey('rsi30', 'any')]: { ...strongEv, periods: strongEv.periods.map((p) => [p[0], 0.7, p[2], p[3], p[4], p[5], p[6]]) as SetupEvidence['periods'] } }
    const stock = bars(crashed())
    const falling = bars(Array.from({ length: stock.c.length }, (_, i) => 1000 - i)) // endeks 200 ortalamasının altında
    const rising = bars(Array.from({ length: stock.c.length }, (_, i) => 100 + i))
    expect([...regimeMap(falling).values()].at(-1)).toBe(false)
    const bear = stockSetups(stock, falling, table)
    expect(bear.regimeNow).toBe(false)
    expect(bear.lead).toMatchObject({ active: true, regime: 'bear' }) // daha güçlü olan öne
    expect(bear.lead!.setup.id).toBe('rsi30')
    const bull = stockSetups(stock, rising, table)
    expect(bull.list.find((s) => s.setup.id === 'rsi30' && s.regime === 'bear')).toMatchObject({ active: false, stockOk: true, regimeOk: false })
    expect(bull.lead).toMatchObject({ active: true, regime: 'any' })
    // Henüz dipte olmayan hisse: tek koşul eksik, tetik fiyatına uzaklık negatif
    const calm = c0()
    const near = stockSetups(bars(calm), rising, table)
    const s = near.list.find((x) => x.setup.id === 'rsi30' && x.regime === 'any')!
    expect(s.active).toBe(false)
    expect(s.distance!).toBeLessThan(0)
    expect(s.conds[0].trigger!).toBeLessThan(calm.at(-1)!)
    expect(near.lead?.setup.id).toBe('rsi30')
    // Kanıt tablosu yoksa hiçbir kurulum güçlü değildir
    expect(stockSetups(stock, falling, undefined).lead).toBeUndefined()
  })
})
function c0(): number[] { const c = [100]; for (let i = 0; i < 700; i++) c.push(c.at(-1)! * (i % 2 ? 1.004 : 0.997)); return c }
