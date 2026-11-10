import { describe, expect, it } from 'vitest'
import { parseChart, yahooSymbol } from './history'
import { fromImport, sanitize, defaultState } from './store'
import { normalizeCode, textPattern } from './tv'

describe('Yahoo geçmişi', () => {
  it('BIST çubukları doğru aya düşer (yerel gece yarısı = önceki gün 21:00 UTC)', () => {
    const body = { chart: { result: [{ timestamp: [Date.UTC(2025, 10, 30, 21) / 1000, Date.UTC(2025, 11, 31, 21) / 1000], indicators: { quote: [{ low: [10, null], high: [12, 13], close: [11, 12.5] }] } }] } }
    const bars = parseChart(body)
    expect(bars.map((b) => new Date(b.time * 1000).toISOString().slice(0, 7))).toEqual(['2025-12', '2026-01'])
    expect(bars[1].low).toBeUndefined()
    // ABD (05:00 UTC) ve Londra (00:00 UTC) damgaları da aynı aya
    const us = parseChart({ chart: { result: [{ timestamp: [Date.UTC(2025, 11, 1, 5) / 1000], indicators: { quote: [{ close: [1] }] } }] } })
    expect(new Date(us[0].time * 1000).toISOString().slice(0, 10)).toBe('2025-12-01')
    expect(parseChart({ chart: { result: [] } })).toEqual([])
  })
  it('TradingView → Yahoo sembolleri', () => {
    expect(yahooSymbol('BIST:THYAO')).toBe('THYAO.IS')
    expect(yahooSymbol('NYSE:BRK.B')).toBe('BRK-B')
    expect(yahooSymbol('FX:USDTRY')).toBe('USDTRY=X')
    expect(yahooSymbol('ECONOMICS:TRHPI')).toBeUndefined()
  })
})

describe('arama kodları', () => {
  it('BIST/Yahoo yazımları sadeleşir', () => {
    expect(normalizeCode('ALTIN.S1')).toBe('ALTIN')
    expect(normalizeCode('gmstr.f')).toBe('GMSTR')
    expect(normalizeCode('thyao.is')).toBe('THYAO')
    expect(normalizeCode('BTC-USD')).toBe('BTCUSD')
    expect(normalizeCode('bist 100')).toBeUndefined()
    expect(textPattern('altın')).toBe('altin|gold')
  })
})

describe('durum dosyası', () => {
  it('bozuk ya da eksik kayıt varsayılana tamamlanır', () => {
    expect(sanitize(null).instruments.length).toBe(defaultState().instruments.length)
    const s = sanitize({ instruments: [{ key: 'X', symbol: 'BIST:X', name: 'X', category: 'TR', decimals: 2, prefix: '', suffix: '₺' }], settings: { theme: 'dark' } })
    expect(s.instruments).toHaveLength(1)
    expect(s.settings.theme).toBe('dark')
    expect(s.settings.refreshSeconds).toBe(30)
    expect(s.screens.length).toBe(15)
  })
  it('web dışa aktarımı ve Android durum dosyası içe aktarılır', () => {
    const web = fromImport({ app: 'piyasa', format: 1, state: defaultState() })
    expect(web?.formulas.length).toBe(8)
    const android = fromImport({
      instruments: [
        { key: 'USDTRY', name: 'Dolar/TL', symbol: 'FX:USDTRY', source: 'TRADINGVIEW', category: 'FX', decimals: 4, tvSymbol: 'FX:USDTRY' },
        { key: 'TCMB_USD', name: 'TCMB Dolar', symbol: 'USD:ForexSelling', source: 'TCMB', category: 'FX' },
      ],
      formulas: [{ key: 'GRAM_ALTIN', name: 'Gram Altın', expression: 'ONS * USDTRY / OZ', decimals: 2, suffix: '₺' }],
      widgets: { 12: { title: 'Ana ekran', keys: ['USDTRY', '#:Altın', 'GRAM_ALTIN'] } },
    })
    expect(android?.instruments.map((i) => i.key)).toEqual(['USDTRY']) // TCMB web'de yok
    expect(android?.boards[0].title).toBe('Ana ekran')
    expect(android?.boards[0].keys).toEqual(['USDTRY', '#:Altın', 'GRAM_ALTIN'])
    expect(fromImport({ hello: 1 })).toBeUndefined()
  })
})
