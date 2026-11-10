import { describe, expect, it } from 'vitest'
import { backtestSupport, runBacktest, supportSummary, type BtSymbol, type Series } from './backtest'
import type { Screen } from './screener'

const START = 19000 // epoch gün
const series = (closes: number[], step = 1): Series => ({
  days: Int32Array.from(closes.map((_, i) => START + i * step)),
  close: Float64Array.from(closes),
})
const screen = (o: Partial<Screen>): Screen => ({
  id: 't', name: 't', universe: 'MY_LIST', category: null, currency: 'LOCAL', conditions: [], matchAll: true, sort: 'CLOSEST', limit: 30, onlyStocks: false, ...o,
})
const sym = (symbol: string, closes: number[], now: BtSymbol['now'] = {}): BtSymbol => ({ symbol, name: symbol.split(':')[1], currency: 'TRY', series: series(closes), now })

// 250 gün 100, 11 gün 80 (düşüş), sonra yine 100
const dip = [...Array(250).fill(100), ...Array(11).fill(80), ...Array(150).fill(100)]

describe('geçmişte test', () => {
  it('girişi, kalma süresini, çıkışı ve sonrasını bulur', () => {
    const r = runBacktest({
      screen: screen({ conditions: [{ left: 'PRICE', op: 'LTE', right: 'SMA50', value: -10 }] }),
      symbols: [sym('BIST:AAA', dip), sym('BIST:BBB', Array(411).fill(50))],
      startDay: START + 200, endDay: START + 410,
    })
    expect(r.tested).toBe(2)
    expect(r.episodes).toHaveLength(1)
    const e = r.episodes[0]
    expect(e.symbol).toBe('BIST:AAA')
    expect(e.entryDay).toBe(START + 250)
    expect(e.exitDay).toBe(START + 261)
    expect(e.tradingDays).toBe(11)
    expect(e.returnIn).toBeCloseTo(0.25, 12) // 80 → 100
    expect(e.worstIn).toBe(0)
    expect(e.afterEntry[0]).toBe(0) // 1 hafta sonra hâlâ 80
    expect(e.afterEntry[1]).toBeCloseTo(0.25, 12) // 1 ay sonra 100
    expect(e.afterExit[1]).toBe(0) // çıkıştan sonra yatay
    expect(r.stay.median).toBe(11)
    expect(r.distinct).toBe(1)
    expect(r.currentMembers).toEqual([])
    // Eşit ağırlıklı portföy: düşüşte alınır, toparlanmada +%25 ile çıkılır
    expect(r.curve.at(-1)!.list).toBeCloseTo(1.25, 12)
    expect(r.portfolio.total).toBeCloseTo(0.25, 12)
  })

  it('endekse göre fark ve hâlâ listede olanlar', () => {
    const rising = Array.from({ length: 300 }, (_, i) => 100 + i) // sürekli yükselen
    const bench = series(Array.from({ length: 300 }, (_, i) => 1000 + i * 5)) // %0,5/gün civarı
    const r = runBacktest({
      screen: screen({ conditions: [{ left: 'PRICE', op: 'GT', right: 'SMA20', value: 0 }] }),
      symbols: [sym('BIST:UP', rising)],
      startDay: START + 100, endDay: START + 299,
      benchmark: { symbol: 'BIST:XU100', name: 'BIST 100', series: bench },
    })
    expect(r.episodes).toHaveLength(1)
    expect(r.episodes[0].exitDay).toBeUndefined() // hâlâ listede
    expect(r.currentMembers).toEqual(['BIST:UP'])
    const m = r.afterEntry[1] // 1 ay
    expect(m.n).toBe(1)
    expect(m.mean).toBeCloseTo(221 / 200 - 1, 9) // 100. günde 200 → 21 işlem günü sonra 221
    expect(m.benchMean).toBeDefined()
    expect(m.excessMean).toBeCloseTo(m.mean! - m.benchMean!, 12)
  })

  it('piyasa değeri o günün fiyatıyla ölçeklenir; geçmişi bilinmeyenler sabit', () => {
    // Bugün 100 (MCAP 10 mlr); fiyat 40'tan 100'e çıktı → başta 4 mlr, eşik 5 mlr
    const closes = Array.from({ length: 200 }, (_, i) => 40 + (60 * i) / 199)
    const r = runBacktest({
      screen: screen({ conditions: [{ left: 'MCAP', op: 'GT', right: null, value: 5e9 }, { left: 'ROE', op: 'GT', right: null, value: 10 }] }),
      symbols: [sym('BIST:M', closes, { MCAP: 10e9, ROE: 20 })],
      startDay: START, endDay: START + 199,
    })
    const e = r.episodes[0]
    // 40 + 60·i/199 > 50 → i > 33,2: 34. günden itibaren
    expect(e.entryDay).toBe(START + 34)
    expect(r.notes.some((n) => n.includes('sabit'))).toBe(true)
  })

  it('F/K: o gün açıklanmış yıllık kârla (75 gün gecikme)', () => {
    // Mali yıl sonu: START+100. gün; kâr 10 → o tarihten 75 gün sonra F/K = fiyat / 10
    const fyEnd = (START + 100) * 86400
    const closes = Array(300).fill(50)
    const s: BtSymbol = { ...sym('BIST:PE', closes), epsFy: [10, 2], fyEnd }
    const r = runBacktest({
      screen: screen({ conditions: [{ left: 'PE', op: 'LT', right: null, value: 8 }] }),
      symbols: [s], startDay: START, endDay: START + 299,
    })
    // Önceki yılın kârı (2) ile F/K 25; yeni kâr açıklanınca 5 → listeye girer
    expect(r.episodes).toHaveLength(1)
    expect(r.episodes[0].entryDay).toBe(START + 175)
  })

  it('USD modunda kur o günün kuruyla', () => {
    const closes = Array(100).fill(100) // TL fiyat sabit
    const fx = series(Array.from({ length: 100 }, (_, i) => (i < 50 ? 50 : 200))) // kur 4 katı
    const r = runBacktest({
      screen: screen({ currency: 'USD', conditions: [{ left: 'PRICE', op: 'LT', right: null, value: 1 }] }),
      symbols: [sym('BIST:FX', closes)], startDay: START, endDay: START + 99, usdTry: fx,
    })
    // 100/50 = 2 $ (değil), 100/200 = 0,5 $ (evet)
    expect(r.episodes[0].entryDay).toBe(START + 50)
  })

  it('alanların geçmişte nasıl hesaplandığı', () => {
    expect(backtestSupport('SMA200').level).toBe('exact')
    expect(backtestSupport('LOW_5Y').level).toBe('approx')
    expect(backtestSupport('ROE').level).toBe('constant')
    expect(supportSummary(screen({ conditions: [{ left: 'PE', op: 'LTE', right: 'PE_5Y_AVG', value: -50 }] })).map((x) => x.id)).toEqual(['PE', 'PE_5Y_AVG'])
  })
})
