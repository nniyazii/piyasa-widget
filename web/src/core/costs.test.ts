import { describe, expect, it } from 'vitest'
import { bankRoute, breakEven, certRoute, evaluate, fundRoute } from './costs'

const s = { amount: 100_000, years: 1, annualGrowth: 0.3, commission: 0.001 }

describe('banka mı, fon mu', () => {
  it('banka: makas ve binde 2 BSMV; kazançtan vergi yok', () => {
    // Alış 98, satış 102 → orta 100; makas her yönde %2
    const r = evaluate(bankRoute('b', 'Banka', { bid: 98, ask: 102 }), s)
    const net = 100_000 / 1.02 / 1.002 * 1.3 * 0.98
    expect(r.net).toBeCloseTo(net, 6)
    expect(r.ideal).toBe(130_000)
    expect(r.parts.gainTax).toBe(0)
    expect(r.parts.commission).toBe(0)
    expect(r.parts.spread + r.parts.buyTax).toBeCloseTo(130_000 - net, 6)
    expect(r.cost).toBeCloseTo(130_000 - net, 6)
  })
  it('fon: komisyon (+%5 BSMV), yönetim gideri ve kazançtan %17,5 stopaj', () => {
    const r = evaluate(fundRoute('f', 'Fon', 0.005, 0.001), s)
    const c = 0.001 * 1.05
    const gross = 100_000 / 1.001 / (1 + c) * 1.3 * 0.995 * 0.999 * (1 - c)
    expect(r.parts.gainTax).toBeCloseTo(0.175 * (gross - 100_000), 6)
    expect(r.net).toBeCloseTo(gross - 0.175 * (gross - 100_000), 6)
    const p = r.parts
    expect(p.spread + p.buyTax + p.commission + p.fee + p.gainTax).toBeCloseTo(r.cost, 6)
  })
  it('zararda stopaj yok; sertifikada hiç yok', () => {
    expect(evaluate(fundRoute('f', 'Fon', 0.005, 0.001), { ...s, annualGrowth: -0.1 }).parts.gainTax).toBe(0)
    expect(evaluate(certRoute('c', 'Sertifika', 0.001), s).parts.gainTax).toBe(0)
  })
  it('başa baş: fiyat az artarsa fon, çok artarsa banka', () => {
    const bank = bankRoute('b', 'Banka', { bid: 98.7, ask: 101.3 }), fund = fundRoute('f', 'Fon', 0.005, 0.001)
    const g = breakEven(fund, bank, s)!
    expect(g).toBeGreaterThan(0.05)
    expect(g).toBeLessThan(0.3)
    expect(evaluate(fund, { ...s, annualGrowth: g - 0.02 }).net).toBeGreaterThan(evaluate(bank, { ...s, annualGrowth: g - 0.02 }).net)
    expect(evaluate(fund, { ...s, annualGrowth: g + 0.02 }).net).toBeLessThan(evaluate(bank, { ...s, annualGrowth: g + 0.02 }).net)
  })
})
