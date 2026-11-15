/**
 * Uzun dönem aylık kapanışlar (öneriler için): konut fiyat endeksi, ons altın, ons gümüş, Dolar/TL.
 * Çıktı: { generated, series: { HPI|GOLD|SILVER|USDTRY|USM2|TRM2|XU100: [[yıl*12+ay, kapanış], …] } }
 * USM2, TRM2: ABD ve Türkiye M2 para arzı; XU100: BIST 100.
 */
import { tvBars } from './tv.mjs'

export const RATIO_SYMBOLS = { HPI: 'ECONOMICS:TRHPI', GOLD: 'OANDA:XAUUSD', SILVER: 'TVC:SILVER', USDTRY: 'FX:USDTRY' }
/** Para arzı analizleri için; alınamazsa diğer öneriler yine çalışır */
export const OPTIONAL_SYMBOLS = { USM2: 'ECONOMICS:USM2', TRM2: 'ECONOMICS:TRM2', XU100: 'BIST:XU100' }

/** Ay anahtarı: çubuk zamanı ay başına yakın olur; +12 saat, saat dilimi kaymasını ayın içine alır */
export const monthKey = (t) => { const d = new Date((t + 43200) * 1000); return d.getUTCFullYear() * 12 + d.getUTCMonth() }

export async function longRatios() {
  const r = await tvBars([...Object.values(RATIO_SYMBOLS), ...Object.values(OPTIONAL_SYMBOLS)], { resolution: '1M', count: 400 })
  const series = {}
  for (const [k, s] of Object.entries(RATIO_SYMBOLS)) {
    const bars = r.get(s)
    if (!bars?.length) throw new Error(`${s} alınamadı`)
    series[k] = bars.filter((b) => b.c > 0).map((b) => [monthKey(b.t), b.c])
  }
  for (const [k, s] of Object.entries(OPTIONAL_SYMBOLS)) {
    const bars = r.get(s)
    if (bars?.length) series[k] = bars.filter((b) => b.c > 0).map((b) => [monthKey(b.t), b.c])
  }
  return { generated: Date.now(), series }
}
