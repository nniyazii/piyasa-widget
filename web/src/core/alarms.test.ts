import { describe as group, expect, it } from 'vitest'
import { checkAlarms, describe, sanitizeAlarms, type Alarm, type Source } from './alarms'
import { PREMIUM_PAIRS, premiumRow } from './premium'
import { stockSetups, type SetupEvidence } from './setups'

const price = (_p: number): Alarm => ({ id: 'p', created: 1, type: 'price', symbol: 'NASDAQ:SNDK', op: 'below', value: 770 })
const src = (over: Partial<Source>): Source => ({
  prices: async () => new Map(), premiums: async () => ({ rows: [], advices: [], open: true }), ...over,
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
    const a: Alarm[] = [{ id: 's', created: 1, type: 'signal', symbol: 'BIST:THYAO', side: 'dip' }]
    const prev = { s: { on: true, firedAt: 5 } }
    const r = await checkAlarms(a, prev, src({}), 10)
    expect(r.fired).toHaveLength(0)
    expect(r.states.s).toMatchObject({ on: true, firedAt: 5, error: expect.stringContaining('alınamadı') })
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

  it('hisse sinyali: güçlü kurulum oluştuğunda çalar', async () => {
    const mk = (n: number) => { const c = [100]; for (let i = 0; i < 700; i++) c.push(c.at(-1)! * (i % 2 ? 1.004 : 0.997)); for (let i = 0; i < n; i++) c.push(c.at(-1)! * 0.96); return { t: c.map((_, i) => 1.42e9 + i * 86400), c } }
    const ev = { stocks: 500, periods: [[500, 0.8, 0.6, 0.6, 0.5, 0.1, 0.02], [500, 0.78, 0.6, 0.6, 0.5, 0.1, 0.02], [500, 0.75, 0.6, 0.6, 0.5, 0.1, 0.02]] } as SetupEvidence
    const table = { 'rsi30|any': ev }
    const a: Alarm[] = [{ id: 's', created: 1, type: 'signal', symbol: 'NASDAQ:TEST', side: 'dip' }, { id: 't', created: 1, type: 'signal', symbol: 'NASDAQ:TEST', side: 'top' }]
    let r = await checkAlarms(a, {}, src({ setups: async () => stockSetups(mk(0), undefined, table) }))
    expect(r.fired).toHaveLength(0)
    expect(r.states.s.now).toBe('güçlü kurulum yok')
    r = await checkAlarms(a, r.states, src({ setups: async () => stockSetups(mk(12), undefined, table) }))
    expect(r.fired.map((f) => f.alarm.id)).toEqual(['s'])
    expect(r.fired[0].title).toBe('TEST: güçlü dip kurulumu')
    expect(r.fired[0].text).toContain('RSI 30’un altında')
    expect(r.fired[0].text).toContain('%75 yukarıdaydı (her zaman %60)')
    // Hisse dışı sembolde kurulum yok: hata olarak işaretlenir, çalmaz
    r = await checkAlarms([a[0]], {}, src({ setups: async () => undefined }))
    expect(r.states.s.error).toContain('kurulum verisi alınamadı')
    expect(describe(a[0])).toBe('TEST için güçlü dip kurulumu oluşursa')
  })

  it('görünüm: görüş seçilen yöne döndüğünde çalar', async () => {
    const a: Alarm[] = [{ id: 'o', created: 1, type: 'outlook', asset: 'GOLD', to: 'up' }]
    const at = (stance: string) => src({ outlook: async () => ({ GOLD: { stance, conviction: 'orta', name: 'Altın', why: 'Lehine: trend.' } }) })
    let r = await checkAlarms(a, {}, at('Hafif olumsuz'))
    expect(r.fired).toHaveLength(0)
    expect(r.states.o.now).toBe('hafif olumsuz, güven orta')
    r = await checkAlarms(a, r.states, at('Nötr'))
    expect(r.fired).toHaveLength(0)
    r = await checkAlarms(a, r.states, at('Hafif olumlu'))
    expect(r.fired).toHaveLength(1)
    expect(r.fired[0].title).toBe('Altın görünümü: hafif olumlu')
    expect(describe(a[0])).toBe('Altın görünümü olumluya dönerse')
    expect(sanitizeAlarms([{ id: 'x', created: 1, type: 'outlook', asset: 'GOLD', to: 'down' }, { id: 'y', created: 1, type: 'outlook', asset: 'HACK', to: 'up' }]).map((x) => x.id)).toEqual(['x'])
  })

  it('olay: seçilen olay son mumlarda başladığında çalar, bildirimde olasılıklar yazar', async () => {
    // Uzun bir yükseliş, ardından sert düşüş: RSI 30'un altına iner
    const mk = (drop: number) => { const c = [100]; for (let i = 0; i < 400; i++) c.push(c.at(-1)! * (i % 90 > 80 ? 0.96 : i % 2 ? 1.006 : 0.998)); for (let i = 0; i < drop; i++) c.push(c.at(-1)! * 0.96); return { t: c.map((_, i) => 1.42e9 + i * 86400), o: c, h: c, l: c, c } }
    const a: Alarm[] = [{ id: 'e', created: 1, type: 'event', subject: 'GOLD', tf: 'D', event: 'rsi-30' }]
    const at = (drop: number) => src({ subject: async () => ({ short: 'Altın', frames: { D: mk(drop) } }) })
    let r = await checkAlarms(a, {}, at(0))
    expect(r.fired).toHaveLength(0)
    expect(r.states.e.on).toBe(false)
    let fired = 0
    let st = {}
    for (let k = 0; k <= 10; k++) { const q = await checkAlarms(a, st, at(k)); st = q.states; fired += q.fired.length; if (q.fired.length) { expect(q.fired[0].title).toMatch(/^Altın: RSI/); expect(q.fired[0].text).toContain('yukarıda olma oranı') } }
    expect(fired).toBe(1)
    expect(describe(a[0])).toContain('Altın, günlük veride')
    const none = await checkAlarms(a, {}, src({}))
    expect(none.states.e.error).toContain('alınamadı')
  })

  it('dışarıdan gelen veri doğrulanır', () => {
    expect(sanitizeAlarms([
      { id: 'a', created: 1, type: 'price', symbol: 'nasdaq:sndk', op: 'below', value: 5 },
      { id: 'b', created: 1, type: 'price', symbol: 'x', op: 'below', value: 5 },
      { id: 'c', created: 1, type: 'premium', target: '<script>' },
      { id: 'd', created: 1, type: 'premium', target: 'm2-bist' },
      { id: 'e', created: 1, type: 'signal', symbol: 'BIST:THYAO', side: 'both', level: 'promising' },
      { id: 'f', created: 1, type: 'event', subject: 'gold', tf: 'W', event: 'rsi-30' },
      { id: 'g', created: 1, type: 'event', subject: 'GOLD', tf: 'W', event: 'rsi-30', label: 'RSI <b>30' },
      { id: 'h', created: 1, type: 'event', subject: 'BIST:THYAO', tf: 'D', event: 'c:abc', usd: true, custom: { id: 'abc', name: '', trigger: { ind: 'rsi', op: 'below', level: 25 } } },
      { id: 'i', created: 1, type: 'event', subject: 'GOLD', tf: 'X', event: 'rsi-30' },
      { id: 'j', created: 1, type: 'event', subject: 'GOLD', tf: 'D', event: 'c:zzz' },
      null, 'x',
    ]).map((a) => a.id)).toEqual(['a', 'd', 'e', 'g', 'h'])
    expect(sanitizeAlarms('x')).toEqual([])
  })
})
