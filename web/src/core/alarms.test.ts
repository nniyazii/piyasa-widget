import { describe as group, expect, it } from 'vitest'
import { checkAlarms, describe, sanitizeAlarms, type Alarm, type Source } from './alarms'
import { PREMIUM_PAIRS, premiumRow } from './premium'
import { analyze } from './signals'

const price = (_p: number): Alarm => ({ id: 'p', created: 1, type: 'price', symbol: 'NASDAQ:SNDK', op: 'below', value: 770 })
const src = (over: Partial<Source>): Source => ({
  prices: async () => new Map(), premiums: async () => ({ rows: [], advices: [], open: true }), analysis: async () => undefined, ...over,
})

group('alarmlar', () => {
  it('fiyat: düzey geçilince bir kez çalar ve kapanır', async () => {
    const a = [price(770)]
    const at = (p: number) => src({ prices: async () => new Map([['NASDAQ:SNDK', p]]) })
    let r = await checkAlarms(a, {}, at(800), 1000)
    expect(r.fired).toHaveLength(0)
    expect(r.states.p).toMatchObject({ on: false, now: '800,00' })
    r = await checkAlarms(a, r.states, at(769.5), 2000)
    expect(r.fired).toHaveLength(1)
    expect(r.fired[0].text).toContain('770,00 altına indi')
    expect(r.states.p).toMatchObject({ on: true, done: true, firedAt: 2000 })
    r = await checkAlarms(a, r.states, at(700), 3000)
    expect(r.fired).toHaveLength(0) // kapandı
    expect(describe(a[0])).toBe('SNDK 770,00 altına inerse')
  })

  it('veri alınamazsa durum korunur, alarm yeniden çalmaz', async () => {
    const a: Alarm[] = [{ id: 's', created: 1, type: 'signal', symbol: 'BIST:THYAO', side: 'dip', level: 'confirmed' }]
    const prev = { s: { on: true, firedAt: 5 } }
    const r = await checkAlarms(a, prev, src({}), 10)
    expect(r.fired).toHaveLength(0)
    expect(r.states.s).toMatchObject({ on: true, firedAt: 5, error: 'geçmiş veri alınamadı' })
  })

  it('avantajlı fiyat: al sinyali gelince çalar, bozulup yeniden gelince yine çalar; BIST kapalıyken çalmaz', async () => {
    const gmstr = PREMIUM_PAIRS.find((p) => p.code === 'GMSTR.F')!
    const row = (prem: number) => ({ ...premiumRow(gmstr, 100 * (1 + prem), 30, 40, 100 / (30 * 40 / 31.1034768)) })
    const a: Alarm[] = [{ id: 'g', created: 1, type: 'premium', target: 'GMSTR.F' }, { id: 'x', created: 1, type: 'premium', target: 'any' }]
    const at = (prem: number, open = true) => src({ premiums: async () => ({ rows: [row(prem)], advices: [], open }) })
    let r = await checkAlarms(a, {}, at(-0.03))
    expect(r.fired.map((f) => f.alarm.id)).toEqual(['g', 'x'])
    expect(r.fired[0].title).toBe('GMSTR.F değerinin altında')
    r = await checkAlarms(a, r.states, at(-0.03))
    expect(r.fired).toHaveLength(0) // aynı sinyal sürüyor
    r = await checkAlarms(a, r.states, at(0.01))
    expect(r.states.g.on).toBe(false)
    r = await checkAlarms(a, r.states, at(-0.025, false))
    expect(r.fired).toHaveLength(0) // seans dışında sinyal sayılmaz
    r = await checkAlarms(a, r.states, at(-0.025))
    expect(r.fired).toHaveLength(2)
  })

  it('hisse sinyali: teyitli kural açıldığında çalar', async () => {
    // Her dipten sonra yükselen seri; son çubuklarda yeni bir sert düşüş (RSI eşiğin altında)
    const c: number[] = [100]
    for (let k = 0; k < 24; k++) {
      for (let i = 0; i < 6; i++) c.push(c.at(-1)! * 0.97)
      for (let i = 0; i < 16; i++) c.push(c.at(-1)! * 1.012)
      for (let i = 0; i < 40; i++) c.push(c.at(-1)! * (i % 2 ? 1.004 : 0.996))
    }
    const uni = { 'D|rsi:dip:30|any': { n: 5000, stocks: 400, diff: 0.06, z: 8 }, 'D|rsi:dip:25|any': { n: 5000, stocks: 400, diff: 0.06, z: 8 }, 'D|rsi:dip:35|any': { n: 5000, stocks: 400, diff: 0.06, z: 8 } }
    const calm = analyze({ D: { t: c.map((_, i) => i * 86400), c } }, uni)
    for (let i = 0; i < 6; i++) c.push(c.at(-1)! * 0.97)
    const dip = analyze({ D: { t: c.map((_, i) => i * 86400), c } }, uni)
    const a: Alarm[] = [{ id: 's', created: 1, type: 'signal', symbol: 'BIST:TEST', side: 'dip', level: 'confirmed' }, { id: 't', created: 1, type: 'signal', symbol: 'BIST:TEST', side: 'top', level: 'confirmed' }]
    let r = await checkAlarms(a, {}, src({ analysis: async () => calm }))
    expect(r.fired).toHaveLength(0)
    r = await checkAlarms(a, r.states, src({ analysis: async () => dip }))
    expect(r.fired.map((f) => f.alarm.id)).toEqual(['s'])
    expect(r.fired[0].text).toMatch(/TEST: Dip sinyali \(teyitli\)\. Kural: günlük veride /)
  })

  it('dışarıdan gelen veri doğrulanır', () => {
    expect(sanitizeAlarms([
      { id: 'a', created: 1, type: 'price', symbol: 'nasdaq:sndk', op: 'below', value: 5 },
      { id: 'b', created: 1, type: 'price', symbol: 'x', op: 'below', value: 5 },
      { id: 'c', created: 1, type: 'premium', target: '<script>' },
      { id: 'd', created: 1, type: 'premium', target: 'm2-bist' },
      { id: 'e', created: 1, type: 'signal', symbol: 'BIST:THYAO', side: 'both', level: 'promising' },
      null, 'x',
    ]).map((a) => a.id)).toEqual(['a', 'd', 'e'])
    expect(sanitizeAlarms('x')).toEqual([])
  })
})
