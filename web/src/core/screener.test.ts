import { describe, expect, it } from 'vitest'
import {
  derived, describe as describeCondition, evaluate, historyStats, metricText, peAverage, preFilter, SCREEN_TEMPLATES,
  serverFilters, valueOf, type Bar, type Condition, type FieldId, type HistoryStats, type Row, type Screen,
} from './screener'

const ts = (y: number, m: number) => Date.UTC(y, m - 1, 1) / 1000
const row = (symbol: string, currency: string, values: Partial<Record<FieldId, number>>): Row =>
  ({ symbol, name: symbol.split(':')[1], currency, pricescale: 100, values })
const screen = (o: Partial<Screen>): Screen => ({
  id: 's', name: 'x', universe: 'BIST', category: null, currency: 'LOCAL', conditions: [], matchAll: true, sort: 'CLOSEST', limit: 30, onlyStocks: false, ...o,
})
const C = (left: FieldId, op: Condition['op'], right: FieldId | null, value: number): Condition => ({ left, op, right, value })

describe('tarama motoru', () => {
  it('5 yıllık dip/zirve, her ay o ayın kuruyla', () => {
    const bars: Bar[] = [{ time: ts(2022, 1), low: 10, high: 12, close: 11 }, { time: ts(2024, 1), low: 10, high: 12, close: 11 }, { time: ts(2026, 1), low: 20, high: 24, close: 22 }]
    const fx: Bar[] = [{ time: ts(2022, 1), close: 10 }, { time: ts(2024, 1), close: 20 }, { time: ts(2026, 1), close: 40 }]
    expect(historyStats(bars)).toEqual({ low: 10, high: 24 })
    const usd = historyStats(bars, fx)
    expect(usd.low).toBeCloseTo(0.5, 12)
    expect(usd.high).toBeCloseTo(1.2, 12)
    // since: eski çubuklar atlanır
    expect(historyStats(bars, null, ts(2023, 1)).high).toBe(24)
    expect(historyStats(bars, null, ts(2025, 1)).low).toBe(20)
  })

  it('USD cinsinden 5 yıllık dibe yakın (kullanıcının örneği)', () => {
    const s = screen({ currency: 'USD', conditions: [C('PRICE', 'LTE', 'LOW_5Y', 10)] })
    const rows = [row('BIST:AAA', 'TRY', { PRICE: 26 }), row('BIST:BBB', 'TRY', { PRICE: 40 }), row('BIST:CCC', 'TRY', { PRICE: 50 }), row('BIST:DDD', 'TRY', { PRICE: 10 })]
    const h = new Map<string, HistoryStats>([['BIST:AAA', { low: 0.5, high: 2 }], ['BIST:BBB', { low: 0.5, high: 2 }], ['BIST:CCC', { low: 0.95, high: 3 }]])
    const r = evaluate(rows, s, 50, h)
    expect(r.rows.map((x) => x.symbol)).toEqual(['BIST:AAA', 'BIST:CCC'])
    expect(r.rows[0].price).toBeCloseTo(0.52, 12)
    expect(r.rows[0].currency).toBe('USD')
  })

  it('200 günlük ortalamanın altında ya da en fazla %5 üstünde', () => {
    const s = screen({ universe: 'MY_LIST', conditions: [C('PRICE', 'LT', 'SMA200', 5)] })
    const rows = [
      row('NASDAQ:A', 'USD', { PRICE: 90, SMA200: 100 }), row('NASDAQ:B', 'USD', { PRICE: 104, SMA200: 100 }),
      row('NASDAQ:C', 'USD', { PRICE: 106, SMA200: 100 }), row('NASDAQ:D', 'USD', { PRICE: 100.5 }),
    ]
    expect(evaluate(rows, s, undefined, new Map()).rows.map((x) => x.symbol)).toEqual(['NASDAQ:B', 'NASDAQ:A'])
  })

  it('sayısal koşullarda en uç önce; "herhangi biri"', () => {
    const rsi = screen({ conditions: [C('RSI', 'LT', null, 30)] })
    const rows = [row('BIST:A', 'TRY', { RSI: 25 }), row('BIST:B', 'TRY', { RSI: 12 }), row('BIST:C', 'TRY', { RSI: 45 })]
    expect(evaluate(rows, rsi, undefined, new Map()).rows.map((x) => x.symbol)).toEqual(['BIST:B', 'BIST:A'])
    const any = { ...rsi, conditions: [...rsi.conditions, C('RSI', 'GT', null, 40)], matchAll: false, sort: 'NAME' as const }
    expect(evaluate(rows, any, undefined, new Map()).rows.map((x) => x.name)).toEqual(['A', 'B', 'C'])
  })

  it('USD modunda fiyat alanları çevrilir, kur yoksa değer yok', () => {
    const s = screen({ currency: 'USD', conditions: [C('PRICE', 'GT', 'SMA200', 0), C('PRICE', 'LT', null, 1)] })
    const rows = [row('BIST:A', 'TRY', { PRICE: 40, SMA200: 30 }), row('BIST:B', 'TRY', { PRICE: 60, SMA200: 30 })]
    const r = evaluate(rows, s, 50, new Map())
    expect(r.rows.map((x) => x.symbol)).toEqual(['BIST:A'])
    expect(r.rows[0].price).toBeCloseTo(0.8, 12)
    expect(valueOf(rows[0], 'PRICE', s, undefined, new Map())).toBeUndefined()
  })

  it('ön eleme geçmiş koşullarını atlar', () => {
    const s = screen({ conditions: [C('PRICE', 'LTE', 'LOW_5Y', 10), C('MCAP', 'GT', null, 1e9)] })
    expect(preFilter(row('BIST:A', 'TRY', { PRICE: 1, MCAP: 2e9 }), s, undefined)).toBe(true)
    expect(preFilter(row('BIST:B', 'TRY', { PRICE: 1, MCAP: 5e8 }), s, undefined)).toBe(false)
  })

  it('sunucu filtreleri yalnızca TradingView’un yapabildikleri', () => {
    const s = screen({ currency: 'USD', conditions: [
      C('RSI', 'LT', null, 30), C('PRICE', 'GT', 'SMA200', 0), C('PRICE', 'LT', 'SMA200', 5), C('PRICE', 'LT', null, 1), C('PRICE', 'LTE', 'LOW_5Y', 10),
    ] })
    expect(serverFilters(s)).toEqual([
      { left: 'RSI', operation: 'less', right: 30 },
      { left: 'close', operation: 'greater', right: 'SMA200' },
    ])
    expect(serverFilters({ ...s, matchAll: false })).toEqual([])
  })

  it('5 yıllık ortalama F/K mali yıl sonu fiyatlarıyla', () => {
    const dec = (y: number) => Date.UTC(y, 11, 1) / 1000
    const bars: Bar[] = [[2021, 20], [2022, 40], [2023, 30], [2024, 50], [2025, 100]]
      .flatMap(([y, c]) => [{ time: ts(y, 6), close: 999 }, { time: dec(y), close: c }])
    const fyEnd = Date.UTC(2025, 11, 31) / 1000
    expect(peAverage(bars, [10, 5, -1, 4, 0.01, 3], fyEnd)).toBeCloseTo(10, 12)
    expect(peAverage(bars, [10, -5, -1, 4, -2], fyEnd)).toBeUndefined()
    expect(peAverage(bars, [10, 5, 4], undefined)).toBeUndefined()
  })

  it('türetilen temel alanlar', () => {
    const d = derived(120, [12, 10, 9, 8, 7, 6], [150, 100], 15)
    expect(d.EPS_GROWTH_1Y).toBeCloseTo(20, 9)
    expect(d.EPS_CAGR_5Y).toBeCloseTo((2 ** 0.2 - 1) * 100, 9)
    expect(d.REV_GROWTH_1Y).toBeCloseTo(50, 9)
    expect(d.FWD_PE).toBeCloseTo(8, 9)
    const loss = derived(10, [1, -2, 1, 1, 1, -1], [], -0.5)
    expect(loss.EPS_GROWTH_1Y).toBeUndefined()
    expect(loss.FWD_PE).toBeUndefined()
  })

  it('F/K yarıya inenler: en derin iskonto önce', () => {
    const s = SCREEN_TEMPLATES.find((x) => x.id === 'd_my_pe_half')!
    const rows = [row('BIST:A', 'TRY', { PRICE: 10, PE: 4 }), row('BIST:B', 'TRY', { PRICE: 10, PE: 6 }), row('NASDAQ:C', 'USD', { PRICE: 10, PE: 9 }), row('NASDAQ:D', 'USD', { PRICE: 10, PE: -3 })]
    const h = new Map<string, HistoryStats>([['BIST:A', { peAvg: 10 }], ['BIST:B', { peAvg: 10 }], ['NASDAQ:C', { peAvg: 30 }], ['NASDAQ:D', { peAvg: 10 }]])
    const r = evaluate(rows, s, undefined, h)
    expect(r.rows.map((x) => x.symbol)).toEqual(['NASDAQ:C', 'BIST:A'])
    expect(metricText(r.rows[0], s)).toBe('5 yıllık ortalama F/K: %70,0 altında')
  })

  it('koşullar sade Türkçeyle', () => {
    expect(describeCondition(C('PRICE', 'LTE', 'LOW_5Y', 10))).toBe('Fiyat ≤ 5 yıl en düşük +%10')
    expect(describeCondition(C('PRICE', 'GTE', 'ATH', -3))).toBe('Fiyat ≥ Tüm zamanların en yükseği −%3')
    expect(describeCondition(C('RSI', 'LT', null, 30))).toBe('RSI (14) < 30')
    expect(describeCondition(C('MCAP', 'GT', null, 5e9))).toBe('Piyasa değeri > 5 mlr')
  })

  it('hazır listeler tutarlı', () => {
    expect(SCREEN_TEMPLATES).toHaveLength(15)
    expect(new Set(SCREEN_TEMPLATES.map((s) => s.id)).size).toBe(15)
    SCREEN_TEMPLATES.filter((s) => s.universe !== 'MY_LIST' && s.id !== 'd_bist_5y_usd').forEach((s) =>
      expect(s.conditions.some((c) => c.left === 'MCAP' && c.op === 'GT'), s.name).toBe(true))
  })
})
