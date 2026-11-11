/**
 * Avantajlı fiyatlar: altın ve gümüşe dayalı borsa ürünlerinin, içlerindeki madenin değerine göre
 * primli mi iskontolu mu işlem gördüğü.
 *
 *   Sertifika (ALTIN.S1): içerik sabittir (0,01 gr) → fark doğrudan gram altına göre.
 *   Borsa yatırım fonları: pay başına maden miktarı sabit değildir (yönetim ücretiyle yavaşça azalır),
 *   bu yüzden "olağan" miktar son 20 işlem gününün ortancasından bulunur → fark bu düzeye göre.
 */
export interface Series { days: Int32Array; close: Float64Array }

export type Metal = 'GOLD' | 'SILVER'
export const OZ = 31.1034768
export const METALS: Record<Metal, { symbol: string; label: string; unit: string }> = {
  GOLD: { symbol: 'OANDA:XAUUSD', label: 'gram altın', unit: 'gr altın' },
  SILVER: { symbol: 'TVC:SILVER', label: 'gram gümüş', unit: 'gr gümüş' },
}
export const USDTRY = 'FX:USDTRY'

export interface PremiumPair {
  symbol: string
  /** Borsa kodu (kullanıcının bildiği yazımla) */
  code: string
  name: string
  metal: Metal
  /** Pay başına sabit maden miktarı (gram); yoksa geçmişten bulunur */
  grams?: number
}

export const PREMIUM_PAIRS: PremiumPair[] = [
  { symbol: 'BIST:ALTIN', code: 'ALTIN.S1', name: 'Darphane Altın Sertifikası', metal: 'GOLD', grams: 0.01 },
  { symbol: 'BIST:GLDTR', code: 'GLDTR.F', name: 'Altın Fonu (GoldIST)', metal: 'GOLD' },
  { symbol: 'BIST:ZGOLD', code: 'ZGOLD.F', name: 'Ziraat Altın Katılım Fonu', metal: 'GOLD' },
  { symbol: 'BIST:ISGLK', code: 'ISGLK.F', name: 'İş Portföy Altın Katılım Fonu', metal: 'GOLD' },
  { symbol: 'BIST:GMSTR', code: 'GMSTR.F', name: 'Gümüş Fonu', metal: 'SILVER' },
]

/** Sinyal eşikleri (oran): sertifika gram altının altında; fon olağan düzeyinin en az %2 altında / üstünde */
export const FUND_BUY = -0.02
export const FUND_HIGH = 0.02
export const TYPICAL_DAYS = 20

export type Signal = 'buy' | 'normal' | 'high' | 'unknown'

export interface PremiumRow {
  pair: PremiumPair
  price?: number
  /** 1 gram madenin TL değeri */
  gram?: number
  /** Pay başına gram: sabit ya da olağan */
  grams?: number
  basis: 'fixed' | 'typical'
  /** İçindeki madenin değeri (TL) */
  fair?: number
  /** (fiyat ÷ değer − 1), oran */
  premium?: number
  signal: Signal
}

const at = (s: Series, day: number) => {
  let lo = 0, hi = s.days.length - 1, r = -1
  while (lo <= hi) { const m = (lo + hi) >> 1; if (s.days[m] <= day) { r = m; lo = m + 1 } else hi = m - 1 }
  return r < 0 || day - s.days[r] > 4 ? undefined : s.close[r]
}

/** Pay başına olağan maden miktarı: son [days] işlem gününde (kapanış ÷ gram fiyatı) ortancası. */
export function typicalGrams(fund: Series | undefined, metalUsd: Series | undefined, usdTry: Series | undefined, days = TYPICAL_DAYS): number | undefined {
  if (!fund || !metalUsd || !usdTry) return undefined
  const r: number[] = []
  for (let i = fund.days.length - 1; i >= 0 && r.length < days; i--) {
    const m = at(metalUsd, fund.days[i]), fx = at(usdTry, fund.days[i])
    if (m && fx && fund.close[i] > 0) r.push(fund.close[i] / (m * fx / OZ))
  }
  if (r.length < Math.min(10, days)) return undefined
  r.sort((a, b) => a - b)
  return r.length % 2 ? r[(r.length - 1) / 2] : (r[r.length / 2 - 1] + r[r.length / 2]) / 2
}

export function premiumRow(pair: PremiumPair, price: number | undefined, metalUsd: number | undefined, usdTry: number | undefined, typical?: number): PremiumRow {
  const basis = pair.grams != null ? 'fixed' : 'typical'
  const grams = pair.grams ?? typical
  const gram = metalUsd && usdTry ? metalUsd * usdTry / OZ : undefined
  const fair = gram != null && grams != null ? gram * grams : undefined
  const premium = price != null && fair ? price / fair - 1 : undefined
  const signal: Signal = premium == null ? 'unknown'
    : basis === 'fixed' ? (premium <= 0 ? 'buy' : 'normal')
      : premium <= FUND_BUY ? 'buy' : premium >= FUND_HIGH ? 'high' : 'normal'
  return { pair, price, gram, grams, basis, fair, premium, signal }
}

/** BIST pay piyasası açık mı (hafta içi 10:00–18:10; veriler 15 dk gecikmeli geldiği için 18:30'a kadar). Tatiller bilinmez. */
export function bistOpen(now = new Date()): boolean {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now)
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? ''
  if (['Sat', 'Sun'].includes(get('weekday'))) return false
  const min = Number(get('hour')) * 60 + Number(get('minute'))
  return min >= 10 * 60 && min <= 18 * 60 + 30
}
