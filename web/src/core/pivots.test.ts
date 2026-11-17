import { describe, expect, it } from 'vitest'
import { assess, baseFeatures, pivots, probability, rollMax, rollMin, scaledFeatures, scaleOf, SCALES, vectorOf, zoneLabels, type PivotEntry } from './pivots'
import type { OHLCV } from './study'

/** Dalgalı seri: 100 günlük döngüyle inip çıkan fiyat (tabanlar ve tepeler belli) */
function wave(n = 900, period = 100): OHLCV {
  const c = Array.from({ length: n }, (_, i) => 100 + 20 * Math.sin((2 * Math.PI * i) / period) + (i % 2 ? 0.3 : -0.3))
  return { t: c.map((_, i) => 1.5e9 + i * 86400), o: c.map((x, i) => (i ? c[i - 1] : x)), h: c.map((x) => x + 0.5), l: c.map((x) => x - 0.5), c, v: c.map(() => 1000) }
}

describe('tepe ve taban', () => {
  it('kayan en küçük ve en büyük', () => {
    expect([...rollMin([5, 3, 4, 1, 2, 6], 3)]).toEqual([5, 3, 3, 1, 1, 1])
    expect([...rollMax([5, 3, 4, 1, 2, 6], 2)]).toEqual([5, 5, 4, 4, 2, 6])
    expect([...rollMin([5, 3, 4, 1, 2, 6], Infinity)]).toEqual([5, 3, 3, 1, 1, 1])
  })

  it('aylık hassasiyette dalganın dipleri taban, tepeleri tepe olarak bulunur', () => {
    const b = wave(), sc = scaleOf('M')
    const lows = pivots(b, sc, 'low'), highs = pivots(b, sc, 'high')
    // 100 günlük döngü: dip 75, 175, …; tepe 25, 125, … (ilk 260 gün ısınma)
    expect(lows.confirmed.length).toBeGreaterThanOrEqual(5)
    const off = (i: number, at: number) => { const d = (((i - at) % 100) + 100) % 100; return Math.min(d, 100 - d) }
    for (const i of lows.confirmed) expect(off(i, 75)).toBeLessThanOrEqual(2)
    for (const i of highs.confirmed) expect(off(i, 25)).toBeLessThanOrEqual(2)
    // Teyit süresi dolmamış son dönüş "bekleyen"dir; teyitlilerin hepsi sondan en az fwd gün önce
    for (const i of lows.confirmed) expect(i + sc.fwd).toBeLessThan(b.t.length)
    // Daha kaba hassasiyet daha az dönüş bulur
    expect(pivots(b, scaleOf('Y'), 'low').confirmed.length).toBeLessThanOrEqual(lows.confirmed.length)
  })

  it('özellikler yalnızca o güne kadarki veriyi kullanır', () => {
    const b = wave(), cut = 600
    const head: OHLCV = { t: b.t.slice(0, cut), o: b.o.slice(0, cut), h: b.h.slice(0, cut), l: b.l.slice(0, cut), c: b.c.slice(0, cut), v: b.v!.slice(0, cut) }
    const full = baseFeatures(b), part = baseFeatures(head)
    for (let k = 0; k < full.f.length; k++) { const a = full.f[k][cut - 1], c = part.f[k][cut - 1]; if (Number.isNaN(a)) expect(Number.isNaN(c)).toBe(true); else expect(c).toBeCloseTo(a, 9) }
    const sc = scaleOf('Q')
    expect(scaledFeatures(part, sc).nearLow[cut - 1]).toBeCloseTo(scaledFeatures(full, sc).nearLow[cut - 1], 9)
  })

  it('bölge etiketi: dönüş gününün çevresi 1, teyit süresi dolmamış günler etiketsiz', () => {
    const b = wave(), sc = scaleOf('M'), x = baseFeatures(b)
    const y = zoneLabels(x, sc, 'low')
    const p = pivots(b, sc, 'low').confirmed.filter((i) => i >= 320)[0]
    expect(y[p]).toBe(1)
    expect(y[p + 30]).toBe(0)
    expect(y[b.t.length - 1]).toBe(-1)
    expect(y[10]).toBe(-1)
  })

  it('bugüne uygulama: örüntüye uyan gün aday olur, tetik fiyatı adaylığa götürür', () => {
    // Elle kurulmuş model: RSI düşük ve fiyat pencere dibine yakınsa taban
    const b = wave(900), sc = scaleOf('M')
    const entry: PivotEntry = { model: { ids: ['rsi', 'nearLow'], mu: [50, 0.15], sd: [15, 0.1], w: [-1.6, -1.6], b: -3.4, base: 0.04 }, pivots: 10, gap: [90, 100, 110], feats: { rsi: [25, 30, 35, 50], nearLow: [0, 0.01, 0.03, 0.15] } }
    const at = (end: number) => assess({ t: b.t.slice(0, end), o: b.o.slice(0, end), h: b.h.slice(0, end), l: b.l.slice(0, end), c: b.c.slice(0, end), v: b.v!.slice(0, end) }, {}, sc, 'low', entry)
    const bottom = at(776), top = at(826) // dip 775, tepe 825
    expect(bottom.level).toBe('candidate')
    expect(bottom.ratio).toBeGreaterThan(top.ratio * 5)
    expect(top.level).toBe('none')
    expect(top.trigger).toBeDefined()
    expect(top.trigger!.change).toBeLessThan(0) // taban için fiyatın inmesi gerekir
    expect(bottom.trigger).toBeUndefined()
    expect(bottom.factors[0].contrib).toBeGreaterThan(0)
    expect(bottom.own.count).toBeGreaterThan(3)
    expect(bottom.tested).toBe(false) // sınama sonucu yok
    // Olasılık hesabı vektörle tutarlı
    const x = baseFeatures(b), near = scaledFeatures(x, sc)
    expect(probability(entry.model, vectorOf(entry.model, x, near, 775))).toBeGreaterThan(0.2)
    expect(SCALES.map((s) => s.id)).toEqual(['M', 'Q', 'H', 'Y', 'Y5', 'ALL'])
  })
})
