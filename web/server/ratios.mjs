/**
 * Uzun dönem aylık kapanışlar (öneriler için): konut fiyat endeksi, ons altın, ons gümüş, Dolar/TL.
 * Çıktı: { generated, series: { HPI|GOLD|SILVER|USDTRY: [[yıl*12+ay, kapanış], …] } }
 */
import { tvBars } from './tv.mjs'

export const RATIO_SYMBOLS = { HPI: 'ECONOMICS:TRHPI', GOLD: 'OANDA:XAUUSD', SILVER: 'TVC:SILVER', USDTRY: 'FX:USDTRY' }

/** Ay anahtarı: çubuk zamanı ay başına yakın olur; +12 saat, saat dilimi kaymasını ayın içine alır */
export const monthKey = (t) => { const d = new Date((t + 43200) * 1000); return d.getUTCFullYear() * 12 + d.getUTCMonth() }

export async function longRatios() {
  const r = await tvBars(Object.values(RATIO_SYMBOLS), { resolution: '1M', count: 400 })
  const series = {}
  for (const [k, s] of Object.entries(RATIO_SYMBOLS)) {
    const bars = r.get(s)
    if (!bars?.length) throw new Error(`${s} alınamadı`)
    series[k] = bars.filter((b) => b.c > 0).map((b) => [monthKey(b.t), b.c])
  }
  return { generated: Date.now(), series }
}
