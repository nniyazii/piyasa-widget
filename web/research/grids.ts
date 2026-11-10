/**
 * Hazır listelerin iyileştirilmesi: her liste için amacını koruyan bir parametre ızgarası.
 * Seçim yalnızca eğitim döneminde; karar kuralı: sınamada skor ≥ mevcut + 5 ve tümünde düşmüyor.
 */
import { type Condition } from '../src/core/screener'
import { C, MLR } from './grid'

const opt = (...xs: Condition[][]) => xs

export const GRIDS: Record<string, Condition[][][]> = {
  d_bist_5y_usd: [
    [5, 10, 15, 20].map((v) => [C('PRICE', 'LTE', 'LOW_5Y', v)]),
    opt([], [C('MCAP', 'GT', null, 5 * MLR)], [C('MCAP', 'GT', null, 20 * MLR)]),
    opt([], [C('PRICE', 'GT', 'SMA20', 0)], [C('RSI', 'GT', null, 35)]),
  ],
  d_bist_movers: [
    [2, 4, 6, 9].map((v) => [C('CHANGE', 'GTE', null, v)]),
    opt([C('MCAP', 'GT', null, 1 * MLR)], [C('MCAP', 'GT', null, 5 * MLR)], [C('MCAP', 'GT', null, 20 * MLR)]),
    opt([], [C('PRICE', 'GT', 'SMA200', 0)]),
  ],
  d_bist_oversold_big: [
    [25, 30, 35].map((v) => [C('RSI', 'LT', null, v)]),
    opt([C('MCAP', 'GT', null, 10 * MLR)], [C('MCAP', 'GT', null, 50 * MLR)]),
    opt([], [C('PRICE', 'GT', 'SMA200', 0)], [C('PRICE', 'GT', 'SMA200', -10)]),
  ],
  d_bist_trend_cheap: [
    [8, 10, 15].map((v) => [C('PE', 'LT', null, v), C('PE', 'GT', null, 0)]),
    opt([C('PRICE', 'GT', 'SMA200', 0), C('SMA50', 'GT', 'SMA200', 0)], [C('PRICE', 'GT', 'SMA200', 0)], [C('PRICE', 'GT', 'SMA50', 0), C('SMA50', 'GT', 'SMA200', 0)]),
    opt([C('MCAP', 'GT', null, 10 * MLR)], [C('MCAP', 'GT', null, 30 * MLR)]),
  ],
  d_bist_52w_high: [
    [2, 5, 10].map((v) => [C('PRICE', 'GTE', 'HIGH_52W', -v)]),
    opt([C('MCAP', 'GT', null, 5 * MLR)], [C('MCAP', 'GT', null, 20 * MLR)], [C('MCAP', 'GT', null, 50 * MLR)]),
    opt([], [C('SMA50', 'GT', 'SMA200', 0)]),
  ],
  d_us_megacap_dip: [
    [5, 15, 25].map((v) => [C('PRICE', 'LTE', 'LOW_52W', v)]),
    opt([C('MCAP', 'GT', null, 50 * MLR)], [C('MCAP', 'GT', null, 100 * MLR)]),
    opt([], [C('PRICE', 'GT', 'SMA20', 0)], [C('RSI', 'GT', null, 40)]),
  ],
  d_bist_pe_hist_cheap: [
    [-30, -40, -50].map((v) => [C('PE', 'LTE', 'PE_5Y_AVG', v), C('PE', 'GT', null, 0)]),
    opt([C('MCAP', 'GT', null, 10 * MLR)], [C('MCAP', 'GT', null, 50 * MLR)]),
    opt([], [C('PRICE', 'GT', 'SMA200', 0)]),
  ],
  d_us_pe_hist_cheap: [
    [-15, -25, -35].map((v) => [C('PE', 'LTE', 'PE_5Y_AVG', v), C('PE', 'GT', null, 0)]),
    opt([C('MCAP', 'GT', null, 50 * MLR)], [C('MCAP', 'GT', null, 100 * MLR)]),
    opt([], [C('PRICE', 'GT', 'SMA200', 0)]),
  ],
  d_bist_fwd_growth: [
    [-20, -30, -40].map((v) => [C('FWD_PE', 'LTE', 'PE', v), C('FWD_PE', 'GT', null, 0), C('PE', 'GT', null, 0)]),
    [10, 15, 20].map((v) => [C('PE', 'LT', null, v)]),
    opt([C('MCAP', 'GT', null, 10 * MLR)], [C('MCAP', 'GT', null, 20 * MLR)]),
  ],
  d_bist_below_book: [
    [0.8, 1, 1.2].map((v) => [C('PB', 'LT', null, v), C('PB', 'GT', null, 0)]),
    opt([], [C('ROE', 'GT', null, 10)], [C('ROE', 'GT', null, 20)]),
    opt([C('MCAP', 'GT', null, 10 * MLR)], [C('MCAP', 'GT', null, 30 * MLR)]),
  ],
  d_bist_dividend: [
    [4, 6, 8].map((v) => [C('DIV_YIELD', 'GTE', null, v)]),
    opt([C('MCAP', 'GT', null, 5 * MLR)], [C('MCAP', 'GT', null, 20 * MLR)]),
    opt([], [C('PRICE', 'GT', 'SMA200', 0)]),
  ],
  d_us_quality: [
    [15, 20, 25].map((v) => [C('ROE', 'GT', null, v)]),
    [20, 25, 35].map((v) => [C('PE', 'GT', null, 0), C('PE', 'LT', null, v)]),
    opt([C('NET_MARGIN', 'GT', null, 15), C('DEBT_EQ', 'LT', null, 1)], [C('DEBT_EQ', 'LT', null, 1)]),
    opt([C('MCAP', 'GT', null, 100 * MLR)], [C('MCAP', 'GT', null, 50 * MLR)]),
  ],
  d_us_growth_dip: [
    [10, 15, 20].map((v) => [C('EPS_CAGR_5Y', 'GT', null, v)]),
    opt([C('PRICE', 'LT', 'SMA200', 0)], [C('PRICE', 'LT', 'SMA50', 0), C('PRICE', 'GT', 'SMA200', 0)], [C('RSI', 'LT', null, 40), C('PRICE', 'GT', 'SMA200', 0)]),
    opt([C('MCAP', 'GT', null, 50 * MLR)], [C('MCAP', 'GT', null, 100 * MLR)]),
  ],
}

