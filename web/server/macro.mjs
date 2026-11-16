/**
 * Makro analiz verisi: uzun dönem aylık seriler (TradingView).
 * Çıktı: { generated, series: { KOD: [[yıl*12+ay, değer], …] } }
 * Varlıklar ve sürücüler aynı dosyada; alınamayan seri atlanır (analiz elindekiyle çalışır).
 */
import { monthKey } from './ratios.mjs'
import { tvBars } from './tv.mjs'

export const MACRO_SYMBOLS = {
  // Varlıklar
  GOLD: 'TVC:GOLD', SILVER: 'TVC:SILVER', OIL: 'TVC:UKOIL', GAS: 'NYMEX:NG1!', COPPER: 'COMEX:HG1!',
  SPX: 'TVC:SPX', NDX: 'TVC:NDX', XU100: 'BIST:XU100', USDTRY: 'FX_IDC:USDTRY', EURUSD: 'FX:EURUSD', BTC: 'BITSTAMP:BTCUSD',
  // Sürücüler
  DXY: 'TVC:DXY', VIX: 'TVC:VIX', US10Y: 'TVC:US10Y', US02Y: 'TVC:US02Y', US3M: 'TVC:US03MY',
  USCPI: 'ECONOMICS:USIRYY', USCORE: 'ECONOMICS:USCIR', USM2: 'ECONOMICS:USM2', FED: 'ECONOMICS:USINTR', ISM: 'ECONOMICS:USBCOI',
  USUR: 'ECONOMICS:USUR', HY: 'FRED:BAMLH0A0HYM2', FEDBS: 'FRED:WALCL',
  TRCPI: 'ECONOMICS:TRIRYY', TRRATE: 'ECONOMICS:TRINTR', TRM2: 'ECONOMICS:TRM2', TRFER: 'ECONOMICS:TRFER', TR10Y: 'TVC:TR10Y',
}

export async function macroSeries() {
  const r = await tvBars(Object.values(MACRO_SYMBOLS), { resolution: '1M', count: 720 })
  const series = {}
  for (const [k, s] of Object.entries(MACRO_SYMBOLS)) {
    const bars = r.get(s)
    if (!bars?.length) continue
    // Aynı aya iki çubuk düşerse sonuncusu geçerli
    const m = new Map()
    for (const b of bars) if (Number.isFinite(b.c)) m.set(monthKey(b.t), Number(b.c.toPrecision(7)))
    series[k] = [...m].sort((a, b) => a[0] - b[0])
  }
  if (!series.GOLD || !series.DXY || !series.US10Y) throw new Error('temel makro seriler alınamadı')
  return { generated: Date.now(), series }
}
