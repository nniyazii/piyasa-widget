import { describe, expect, it } from 'vitest'
import { defaultFormulas, defaultInstruments, instrumentFromHit, prettyName } from './catalog'
import { displayItem, FormulaEngine } from './engine'
import * as Fmt from './format'
import { evaluate, isValidKey, parse, render, suggestKey, tokenize, variables } from './formula'
import { move, reorderSubset, type Formula, type Quote } from './models'
import { symbolFor } from './tradingview'

const ev = (s: string, vars: Record<string, number> = {}) => evaluate(parse(s), (n) => {
  if (n in vars) return vars[n]
  throw new Error('?' + n)
})

const quotes: Record<string, Quote> = {
  ONS: { price: 4046.1, prevClose: 4021.2, time: 0 },
  USDTRY: { price: 50.15, prevClose: 50.129, time: 0 },
  EURTRY: { price: 58.04, prevClose: 57.91, time: 0 },
  GUMUS: { price: 48.51, prevClose: 48.1, time: 0 },
  XU100: { price: 10812.45, prevClose: 10852.6, time: 0 },
  ALTIN: { price: 71.34, prevClose: 70.9, time: 0 },
  TR_FAIZ: { price: 36, prevClose: 37, time: 0 },
  TR_ENF: { price: 29.77, prevClose: 29.73, time: 0 },
}
const ctx = { instruments: defaultInstruments(), formulas: defaultFormulas(), quotes }

describe('formül dili', () => {
  it('öncelik ve işaretler', () => {
    expect(ev('1 + 2 * 3')).toBe(7)
    expect(ev('(1 + 2) * 3')).toBe(9)
    expect(ev('-2^2')).toBe(-4)
    expect(ev('2^3^2')).toBe(512)
    expect(ev('10 / 4')).toBe(2.5)
    expect(ev('1.5e3')).toBe(1500)
    expect(ev('--6')).toBe(6)
    expect(ev('6 × 2 ÷ 4 − 1')).toBe(2)
  })
  it('değişkenler büyük/küçük harf duyarsız, fonksiyonlar', () => {
    expect(ev('usdtry * 2', { USDTRY: 5 })).toBe(10)
    expect(ev('max(1, 3, 2)')).toBe(3)
    expect(ev('min(1; 3; 2)')).toBe(1)
    expect(ev('avg(1, 3)')).toBe(2)
    expect(ev('round(PI, 2)')).toBe(3.14)
    expect(ev('pct(110, 100)')).toBeCloseTo(10, 9)
    expect(ev('OZ')).toBe(31.1034768)
  })
  it('anlaşılır hatalar', () => {
    expect(() => ev('1 / 0')).toThrow(/Sıfıra/)
    expect(() => ev('(1 + 2')).toThrow(/bekleniyordu/)
    expect(() => ev('foo(1)')).toThrow(/Bilinmeyen fonksiyon/)
    expect(() => ev('1 + * 2')).toThrow(/Beklenmeyen/)
    expect(() => ev('  ')).toThrow(/boş/)
  })
  it('anahtar önerisi ve geçerlilik', () => {
    expect(suggestKey('Gram Altın')).toBe('GRAM_ALTIN')
    expect(suggestKey('Çeyrek altın')).toBe('CEYREK_ALTIN')
    expect(isValidKey('USDTRY')).toBe(true)
    expect(isValidKey('OZ')).toBe(false)
    expect(isValidKey('1ABC')).toBe(false)
  })
  it('parçalara ayırma hesap makinesi gibi', () => {
    expect(tokenize('ons×usdtry÷oz')).toEqual(['ONS', '*', 'USDTRY', '/', 'OZ'])
    expect(tokenize('pct(ALTIN * 100, GRAM_ALTIN)')).toEqual(['pct(', 'ALTIN', '*', '100', ';', 'GRAM_ALTIN', ')'])
    expect(render(['ONS', '*', 'USDTRY', '/', 'OZ'])).toBe('ONS * USDTRY / OZ')
    expect([...variables(parse('ONS * USDTRY / OZ'))]).toEqual(['ONS', 'USDTRY'])
  })
})

describe('hesap motoru', () => {
  const e = new FormulaEngine(ctx)
  it('gram altın, çeyrek ve önceki kapanış', () => {
    const r = e.evaluateKey('GRAM_ALTIN')
    expect(r.error).toBeUndefined()
    expect(r.value!).toBeCloseTo((4046.1 * 50.15) / 31.1034768, 9)
    expect(r.prev!).toBeCloseTo((4021.2 * 50.129) / 31.1034768, 9)
    expect(e.evaluateKey('CEYREK').value!).toBeCloseTo(r.value! * 1.6067, 9)
  })
  it('döngü ve bilinmeyen değişken', () => {
    const f: Formula[] = [
      { key: 'A', name: 'A', expression: 'B + 1', decimals: 2, prefix: '', suffix: '' },
      { key: 'B', name: 'B', expression: 'A + 1', decimals: 2, prefix: '', suffix: '' },
      { key: 'X', name: 'X', expression: 'XYZ * 2', decimals: 2, prefix: '', suffix: '' },
    ]
    const e2 = new FormulaEngine({ ...ctx, formulas: f })
    expect(e2.evaluateKey('A').error).toMatch(/^Döngüsel/)
    expect(e2.evaluateKey('X').error).toContain('XYZ')
  })
  it('varsayılan formüllerin hepsi hesaplanır', () => {
    for (const f of defaultFormulas()) {
      const r = e.evaluateKey(f.key)
      expect(r.error, f.name).toBeUndefined()
      expect(Number.isFinite(r.value), f.name).toBe(true)
    }
  })
  it('oranlarda puan farkı', () => {
    const real = displayItem(ctx, e, 'REEL_FAIZ')!
    expect(real.valueText).toBe('%6,23')
    expect(real.change.text).toBe('−1,04 p')
    expect(real.change.dir).toBe(-1)
    expect(displayItem(ctx, e, 'TR_ENF')!.change.text).toBe('+0,04 p')
    expect(displayItem(ctx, e, 'USDTRY')!.change.text).toBe('+%0,04')
  })
})

describe('biçimler', () => {
  it('Türkçe sayılar', () => {
    expect(Fmt.value(6523.1, 2, '', '₺')).toBe('6.523,10 ₺')
    expect(Fmt.value(4046.1, 2, '$')).toBe('$4.046,10')
    expect(Fmt.value(-2.5, 2, '', '%')).toBe('−%2,50')
    expect(Fmt.change(1.234)).toBe('+%1,23')
    expect(Fmt.change(-0.45)).toBe('−%0,45')
    expect(Fmt.change(0.001)).toBe('%0,00')
    expect(Fmt.number(-0.001, 2)).toBe('0,00')
    expect(Fmt.money(5e9)).toBe('5 mlr')
    expect(Fmt.money(1.2e12)).toBe('1,2 trn')
    expect(Fmt.parseInput('31,1')).toBe(31.1)
    expect(Fmt.parseInput('1.234,5')).toBe(1234.5)
    expect(Fmt.parseInput('abc')).toBeUndefined()
  })
})

describe('TradingView', () => {
  it('semboller ve spread ifadeleri', () => {
    expect(symbolFor(ctx, 'USDTRY')).toBe('FX:USDTRY')
    expect(symbolFor(ctx, 'GRAM_ALTIN')).toBe('OANDA:XAUUSD*FX:USDTRY/31.1034768')
    expect(symbolFor(ctx, 'CEYREK')).toBe('OANDA:XAUUSD*FX:USDTRY/31.1034768*1.6067')
    expect(symbolFor(ctx, 'SEPET')).toBe('(FX:USDTRY+FX:EURTRY)/2')
    expect(symbolFor(ctx, 'BIST_USD')).toBe('BIST:XU100/FX:USDTRY')
    const w = (expression: string) => ({ ...ctx, formulas: [...ctx.formulas, { key: 'T', name: 'T', expression, decimals: 2, prefix: '', suffix: '' }] })
    expect(symbolFor(w('USDTRY - (EURTRY - 1)'), 'T')).toBe('FX:USDTRY-(FX:EURTRY-1)')
    expect(symbolFor(w('-USDTRY * 2'), 'T')).toBe('-FX:USDTRY*2')
    // TradingView'da karşılığı olmayan fonksiyon: ilk enstrüman
    expect(symbolFor(w('pct(EURUSD, 1.10)'), 'T')).toBe('FX:EURUSD')
    expect(symbolFor(w('chg(GRAM_ALTIN)'), 'T')).toBe('OANDA:XAUUSD')
  })
  it('arama sonucundan enstrüman', () => {
    const ins = instrumentFromHit({ symbol: 'BIST:ASELS', name: 'ASELSAN ELEKTRONIK SANAYI VE TICARET A.S.', ticker: 'ASELS', type: 'stock', exchange: 'BIST', pricescale: 100, currency: 'TRY' }, [])
    expect(ins.category).toBe('TR')
    expect(ins.suffix).toBe('₺')
    expect(ins.decimals).toBe(2)
    expect(ins.key).toBe('ASELS')
    const fund = instrumentFromHit({ symbol: 'NASDAQ:AAPL', name: 'Apple Inc.', ticker: 'AAPL', type: 'stock', exchange: 'NASDAQ', pricescale: 100, currency: 'USD' }, ['AAPL'])
    expect(fund.prefix).toBe('$')
    expect(fund.key).toBe('AAPL_2')
    expect(instrumentFromHit({ symbol: 'ECONOMICS:TRHPI', name: 'Turkey House Price Index', ticker: 'TRHPI', type: 'economic' }, []).category).toBe('ECONOMY')
    expect(prettyName('DARPHANE ALTIN SERTIFIKASI', 'X')).toBe('Darphane Altin Sertifikasi')
    expect(prettyName('Apple Inc.', 'X')).toBe('Apple')
  })
})

describe('sıralama', () => {
  it('taşı ve alt küme', () => {
    expect(move(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(reorderSubset(['x1', 'y1', 'x2', 'y2', 'x3'], ['x3', 'x1', 'x2'], (s) => s)).toEqual(['x3', 'y1', 'x1', 'y2', 'x2'])
  })
})

describe('şirket adları', () => {
  it('unvan kuyruğu kısalır', () => {
    expect(prettyName('Dogus Otomotiv Servis ve Ticaret Anonim Sirketi', 'X')).toBe('Dogus Otomotiv Servis')
    expect(prettyName('Selcuk Ecza Deposu Ticaret ve Sanayi', 'X')).toBe('Selcuk Ecza Deposu')
    expect(prettyName('Ege Endustri ve Ticaret', 'X')).toBe('Ege Endustri')
    expect(prettyName('DO & CO Aktiengesellschaft', 'X')).toBe('DO & CO')
    expect(prettyName('Turk Hava Yollari A.O.', 'X')).toBe('Turk Hava Yollari')
  })
})
