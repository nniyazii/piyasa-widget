/** Avantajlı fiyatlar ve önerilerin ham veriden hesabı (uygulama ve sunucudaki alarm kontrolü ortak kullanır). */
import { advices, moneyAdvices, type Advice, type RatioData } from './advice'
import { METALS, PREMIUM_PAIRS, premiumRow, typicalGrams, USDTRY, type PremiumRow, type Series } from './premium'

export const XU100 = 'BIST:XU100'
/** Günlük geçmişi gereken semboller */
export const PREMIUM_SYMBOLS = [...PREMIUM_PAIRS.map((p) => p.symbol), ...Object.values(METALS).map((m) => m.symbol), USDTRY]
/** Canlı fiyatı gereken semboller */
export const PREMIUM_QUOTES = [...PREMIUM_SYMBOLS, XU100]

export function buildPremiums(price: Map<string, number | undefined>, daily: Map<string, Series>, long?: RatioData): { rows: PremiumRow[]; advices: Advice[]; money: Advice[]; fx?: number } {
  const fx = price.get(USDTRY)
  const rows = PREMIUM_PAIRS.map((p) => {
    const m = METALS[p.metal].symbol
    const typical = p.grams == null ? typicalGrams(daily.get(p.symbol), daily.get(m), daily.get(USDTRY)) : undefined
    return premiumRow(p, price.get(p.symbol), price.get(m), fx, typical)
  })
  const live = { gold: price.get(METALS.GOLD.symbol), silver: price.get(METALS.SILVER.symbol), usdTry: fx, xu100: price.get(XU100) }
  return { rows, advices: long ? advices(long, live) : [], money: long ? moneyAdvices(long, live) : [], fx }
}
