import { describe, expect, it } from 'vitest'
import { bistOpen, OZ, PREMIUM_PAIRS, premiumRow, typicalGrams, type Series } from './premium'

const ser = (closes: number[], start = 20000): Series => ({ days: Int32Array.from(closes.map((_, i) => start + i)), close: Float64Array.from(closes) })
const pair = (code: string) => PREMIUM_PAIRS.find((p) => p.code === code)!

describe('avantajlı fiyatlar', () => {
  it('sertifika: 0,01 gr altına göre prim; gram altının altındaysa al sinyali', () => {
    // 11 Kas 2026: ons 4057,965 $, dolar 50,22866 → gram altın 6553,2 ₺
    const r = premiumRow(pair('ALTIN.S1'), 71.34, 4057.965, 50.22866)
    expect(r.gram).toBeCloseTo(4057.965 * 50.22866 / OZ, 6)
    expect(r.fair).toBeCloseTo(65.532, 2)
    expect(r.premium).toBeCloseTo(71.34 / 65.532 - 1, 3) // ≈ +%8,9
    expect(r.signal).toBe('normal')
    expect(premiumRow(pair('ALTIN.S1'), 65.0, 4057.965, 50.22866).signal).toBe('buy')
  })
  it('fon: pay başına olağan miktar son 20 günün ortancası; %2 altı al, %2 üstü pahalı', () => {
    const metal = ser(Array(30).fill(50)), fx = ser(Array(30).fill(31.1034768)) // gram = 50 ₺
    const fund = ser([...Array(29).fill(300), 900]) // 6 gr; son gün uç değer ortancayı bozmaz
    const g = typicalGrams(fund, metal, fx)!
    expect(g).toBeCloseTo(6, 9)
    expect(premiumRow(pair('GMSTR.F'), 300, 50, 31.1034768, g).signal).toBe('normal')
    expect(premiumRow(pair('GMSTR.F'), 293, 50, 31.1034768, g).signal).toBe('buy')
    expect(premiumRow(pair('GMSTR.F'), 307, 50, 31.1034768, g).signal).toBe('high')
    expect(premiumRow(pair('GMSTR.F'), 300, 50, 31.1034768, undefined).signal).toBe('unknown')
    expect(typicalGrams(ser([300, 300]), metal, fx)).toBeUndefined() // geçmiş yetersiz
  })
  it('BIST seansı: hafta içi 10:00–18:30 (İstanbul)', () => {
    expect(bistOpen(new Date('2026-11-11T08:00:00Z'))).toBe(true) // Çarşamba 11:00
    expect(bistOpen(new Date('2026-11-11T06:30:00Z'))).toBe(false) // 09:30
    expect(bistOpen(new Date('2026-11-11T16:00:00Z'))).toBe(false) // 19:00
    expect(bistOpen(new Date('2026-11-14T09:00:00Z'))).toBe(false) // Cumartesi
  })
})
