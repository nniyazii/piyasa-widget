import { describe, expect, it } from 'vitest'
import { agoLabel, customEvent, eventDefs, HORIZONS, joint, joints, onsets, prepare, recentStudies, sanitizeCustom, sentence, study, wilson, type OHLCV } from './study'

const bars = (c: number[], v?: number[]): OHLCV => ({ t: c.map((_, i) => 1_500_000_000 + i * 86400), o: c.map((x, i) => (i ? c[i - 1] : x)), h: c.map((x, i) => Math.max(x, i ? c[i - 1] : x)), l: c.map((x, i) => Math.min(x, i ? c[i - 1] : x)), c, v })
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
const D = eventDefs('D')
const def = (id: string) => D.find((d) => d.id === id)!
/** Sakin seyir; her [period] günde bir sert düşüş ve ardından toparlanma */
function cyclic(cycles: number, tail = 0): number[] {
  const c = [100]; const r = rng(9)
  for (let k = 0; k < cycles; k++) {
    for (let i = 0; i < 150; i++) c.push(c.at(-1)! * (i % 2 ? 1.004 : 0.9961) * (1 + (r() - 0.5) * 0.0004))
    for (let i = 0; i < 5; i++) c.push(c.at(-1)! * 0.955)
    for (let i = 0; i < 25; i++) c.push(c.at(-1)! * 1.012)
  }
  for (let i = 0; i < 150; i++) c.push(c.at(-1)! * (i % 2 ? 1.004 : 0.9961) * (1 + (r() - 0.5) * 0.0004))
  for (let i = 0; i < tail; i++) c.push(c.at(-1)! * 0.955)
  return c
}

describe('olay incelemesi', () => {
  it('olay, durumun başladığı mumdur; aynı olay yakın aralıkla yeniden sayılmaz', () => {
    const x = prepare(bars(cyclic(10)), 'D')
    const on = onsets(x, def('rsi-30'))
    expect(on.length).toBe(10)
    for (const i of on) { expect(x.rsi[i]).toBeLessThan(30); expect(x.rsi[i - 1]).toBeGreaterThanOrEqual(30) }
    for (let k = 1; k < on.length; k++) expect(on[k] - on[k - 1]).toBeGreaterThanOrEqual(15)
    expect(onsets(x, def('vol-sell'))).toEqual([]) // hacim yok
  })

  it('her dipten sonra yükselen seride RSI 30 olayı belirgin biçimde olumlu', () => {
    const x = prepare(bars(cyclic(12)), 'D')
    const s = study(x, def('rsi-30'))
    expect(s.onsets.length).toBe(12)
    const m = s.stats[1] // 21 gün
    expect(m.n).toBe(12)
    expect(m.up).toBeGreaterThan(0.9)
    expect(m.up).toBeGreaterThan(m.base + 0.12)
    expect(m.consistent).toBe(true)
    expect(m.clear).toBe(true)
    expect(m.avgUp).toBeGreaterThan(0)
    expect(m.lo).toBeLessThan(m.up); expect(m.hi).toBeGreaterThanOrEqual(m.up)
    expect(s.recent).toBeUndefined() // son 15 günde olmadı
    expect(s.view).toBe(s.stats)
    expect(s.best?.clear).toBe(true)
    expect(s.outcomes.get(s.onsets[0])!.length).toBe(HORIZONS.D.length)
  })

  it('son dönemde olduysa olasılıklar bugünden sonrası içindir ve bu seferki örnek hariç tutulur', () => {
    const x = prepare(bars(cyclic(12, 5)), 'D')
    const s = study(x, def('rsi-30'))
    expect(s.recent).toBeDefined()
    expect(s.recent!.elapsed).toBeLessThanOrEqual(4)
    expect(s.recent!.stats[1].n).toBe(12) // 13 gerçekleşme, sonuncusu hariç
    expect(s.view).toBe(s.recent!.stats)
    expect(s.recent!.current.length).toBe(s.recent!.elapsed + 1)
    expect(s.recent!.paths.length).toBe(12)
    const list = recentStudies(x, D)
    expect(list.some((r) => r.def.id === 'rsi-30')).toBe(true)
    expect(list.every((r) => r.recent)).toBe(true)
    expect(sentence('Deneme', s)).toMatch(/^Deneme RSI 30’un altına indi \(aşırı satım\) \(RSI \d+\)$/)
  })

  it('rastgele yürüyüşte olaylar belirgin çıkmaz (çoğunlukla)', () => {
    let clear = 0, total = 0
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const r = rng(seed); const c = [100]
      for (let i = 0; i < 2500; i++) c.push(c[i] * (1 + (r() - 0.5) * 0.03))
      const x = prepare(bars(c), 'D')
      for (const d of D) { const s = study(x, d); for (const h of s.stats) { total++; if (h.clear) clear++ } }
    }
    expect(clear / total).toBeLessThan(0.05)
  })

  it('iki olay birlikte: ortak geçmiş ayrıca ölçülür', () => {
    const x = prepare(bars(cyclic(12, 5)), 'D')
    const rec = recentStudies(x, D)
    const a = rec.find((s) => s.def.id === 'rsi-30')!, b = rec.find((s) => s.def.id === 'drop-n') ?? rec.find((s) => s.def.id !== 'rsi-30')!
    const j = joint(x, a, b)
    expect(j).toBeDefined()
    expect(j!.anchors.length).toBeGreaterThanOrEqual(5)
    expect(j!.stats.length).toBe(4)
    expect(joints(x, rec).length).toBeGreaterThan(0)
  })

  it('hacimli olaylar yalnızca hacim varken; kendi olayım tetik ve ek durumla çalışır', () => {
    const c = cyclic(8)
    const v = c.map((_, i) => (i > 0 && c[i] / c[i - 1] < 0.96 ? 5000 : 1000))
    const x = prepare(bars(c, v), 'D')
    expect(onsets(x, def('vol-sell')).length).toBeGreaterThanOrEqual(6)
    const mine = customEvent({ id: 'a', name: '', trigger: { ind: 'rsi', op: 'below', level: 35 }, when: { ind: 'dd', op: 'below', level: -10 } })
    const on = onsets(x, mine)
    expect(on.length).toBeGreaterThan(0)
    for (const i of on) { expect(x.rsi[i]).toBeLessThan(35); expect(x.dd[i]).toBeLessThan(-0.1) }
    expect(mine.label).toBe('RSI (14) 35 altına indi; o sırada Zirveden uzaklık -10 altında')
    expect(sanitizeCustom([{ id: 'a', name: 'x', trigger: { ind: 'rsi', op: 'below', level: 30 } }, { id: 'b', trigger: { ind: 'hack', op: 'below', level: 1 } }, null]).map((s) => s.id)).toEqual(['a'])
  })

  it('aylık ve haftalık: vadeler ve etiketler zaman dilimine göre', () => {
    const r = rng(4); const c = [100]
    for (let i = 0; i < 400; i++) c.push(c[i] * (1 + (r() - 0.48) * 0.08))
    const x = prepare(bars(c), 'M')
    const s = study(x, eventDefs('M').find((d) => d.id === 'trend-down')!)
    expect(s.stats.map((h) => h.label)).toEqual(['1 ay', '3 ay', '6 ay', '12 ay'])
    expect(s.onsets.length).toBeGreaterThan(5)
    expect(agoLabel('M', 0)).toBe('bu ay'); expect(agoLabel('W', 3)).toBe('3 hafta önce'); expect(agoLabel('D', 0)).toBe('son işlem günü')
    const [lo, hi] = wilson(9, 12); expect(lo).toBeGreaterThan(0.55); expect(hi).toBeLessThan(0.9)
  })
})
