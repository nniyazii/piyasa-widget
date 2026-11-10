import { suggestKey, uniqueKey } from './formula'
import type { Category, Formula, Instrument } from './models'

const t = (key: string, name: string, symbol: string, category: Category, o: Partial<Instrument> = {}): Instrument => ({
  key, name, symbol, category, decimals: 2, prefix: '', suffix: '', ...o,
})

/** Hazır katalog: TradingView sembolleri (TradingView'da görülenle birebir). */
export const CATALOG: Instrument[] = [
  // Amerika
  t('SPX', 'S&P 500', 'SP:SPX', 'US'),
  t('NASDAQ', 'Nasdaq', 'NASDAQ:IXIC', 'US'),
  t('DOW', 'Dow Jones', 'DJ:DJI', 'US'),
  t('RUSSELL', 'Russell 2000', 'TVC:RUT', 'US'),
  t('VIX', 'VIX Korku Endeksi', 'TVC:VIX', 'US'),
  t('US10Y', 'ABD 10 Yıllık Tahvil', 'TVC:US10Y', 'US', { suffix: '%', note: 'Faiz' }),
  t('AAPL', 'Apple', 'NASDAQ:AAPL', 'US', { prefix: '$' }),
  t('MSFT', 'Microsoft', 'NASDAQ:MSFT', 'US', { prefix: '$' }),
  t('NVDA', 'Nvidia', 'NASDAQ:NVDA', 'US', { prefix: '$' }),
  t('GOOGL', 'Alphabet', 'NASDAQ:GOOGL', 'US', { prefix: '$' }),
  t('AMZN', 'Amazon', 'NASDAQ:AMZN', 'US', { prefix: '$' }),
  t('META', 'Meta', 'NASDAQ:META', 'US', { prefix: '$' }),
  t('TSLA', 'Tesla', 'NASDAQ:TSLA', 'US', { prefix: '$' }),
  // Türkiye
  t('XU100', 'BIST 100', 'BIST:XU100', 'TR'),
  t('XU030', 'BIST 30', 'BIST:XU030', 'TR'),
  t('XBANK', 'BIST Banka', 'BIST:XBANK', 'TR'),
  t('THYAO', 'THY', 'BIST:THYAO', 'TR', { suffix: '₺' }),
  t('ASELS', 'Aselsan', 'BIST:ASELS', 'TR', { suffix: '₺' }),
  t('GARAN', 'Garanti BBVA', 'BIST:GARAN', 'TR', { suffix: '₺' }),
  t('AKBNK', 'Akbank', 'BIST:AKBNK', 'TR', { suffix: '₺' }),
  t('KCHOL', 'Koç Holding', 'BIST:KCHOL', 'TR', { suffix: '₺' }),
  t('TUPRS', 'Tüpraş', 'BIST:TUPRS', 'TR', { suffix: '₺' }),
  t('BIMAS', 'BİM', 'BIST:BIMAS', 'TR', { suffix: '₺' }),
  t('EREGL', 'Ereğli', 'BIST:EREGL', 'TR', { suffix: '₺' }),
  t('FROTO', 'Ford Otosan', 'BIST:FROTO', 'TR', { suffix: '₺' }),
  t('SISE', 'Şişecam', 'BIST:SISE', 'TR', { suffix: '₺' }),
  t('ALTIN', 'Darphane Altın Sertifikası', 'BIST:ALTIN', 'TR', { suffix: '₺', note: 'ALTIN.S1, 0,01 gr' }),
  t('GLDTR', 'Altın Fonu', 'BIST:GLDTR', 'TR', { suffix: '₺', note: 'GoldIST BYF' }),
  t('GMSTR', 'Gümüş Fonu', 'BIST:GMSTR', 'TR', { suffix: '₺', note: 'GMSTR.F BYF' }),
  // Emtia
  t('ONS', 'Ons Altın', 'OANDA:XAUUSD', 'COMMODITY', { prefix: '$', note: 'Spot' }),
  t('GUMUS', 'Ons Gümüş', 'TVC:SILVER', 'COMMODITY', { prefix: '$', note: 'Spot' }),
  t('PLATIN', 'Platin', 'TVC:PLATINUM', 'COMMODITY', { prefix: '$', note: 'Spot' }),
  t('PALADYUM', 'Paladyum', 'TVC:PALLADIUM', 'COMMODITY', { prefix: '$', note: 'Spot' }),
  t('BAKIR', 'Bakır', 'COMEX:HG1!', 'COMMODITY', { decimals: 3, prefix: '$', note: 'Vadeli' }),
  t('BRENT', 'Brent Petrol', 'FX:UKOIL', 'COMMODITY', { prefix: '$' }),
  t('WTI', 'WTI Petrol', 'FX:USOIL', 'COMMODITY', { prefix: '$' }),
  t('DOGALGAZ', 'Doğalgaz', 'NYMEX:NG1!', 'COMMODITY', { decimals: 3, prefix: '$', note: 'Vadeli' }),
  // Döviz
  t('USDTRY', 'Dolar/TL', 'FX:USDTRY', 'FX', { decimals: 4 }),
  t('EURTRY', 'Euro/TL', 'FX:EURTRY', 'FX', { decimals: 4 }),
  t('GBPTRY', 'Sterlin/TL', 'FX_IDC:GBPTRY', 'FX', { decimals: 4 }),
  t('CHFTRY', 'Frank/TL', 'FX_IDC:CHFTRY', 'FX', { decimals: 4 }),
  t('EURUSD', 'EUR/USD', 'FX:EURUSD', 'FX', { decimals: 4 }),
  t('GBPUSD', 'GBP/USD', 'FX:GBPUSD', 'FX', { decimals: 4 }),
  t('USDJPY', 'USD/JPY', 'FX:USDJPY', 'FX', { decimals: 3 }),
  t('DXY', 'Dolar Endeksi', 'TVC:DXY', 'FX'),
  // Kripto
  t('BTC', 'Bitcoin', 'BITSTAMP:BTCUSD', 'CRYPTO', { decimals: 0, prefix: '$' }),
  t('BTCTRY', 'Bitcoin/TL', 'BINANCE:BTCTRY', 'CRYPTO', { decimals: 0, suffix: '₺' }),
  t('ETH', 'Ethereum', 'BITSTAMP:ETHUSD', 'CRYPTO', { decimals: 0, prefix: '$' }),
  t('SOL', 'Solana', 'COINBASE:SOLUSD', 'CRYPTO', { prefix: '$' }),
  // Ekonomi
  t('TR_ENF', 'TÜFE (yıllık)', 'ECONOMICS:TRIRYY', 'ECONOMY', { suffix: '%', note: 'Türkiye' }),
  t('TR_FAIZ', 'TCMB Politika Faizi', 'ECONOMICS:TRINTR', 'ECONOMY', { suffix: '%', note: 'Türkiye' }),
  t('TR_KONUT', 'Konut Fiyat Endeksi', 'ECONOMICS:TRHPI', 'ECONOMY', { note: 'Türkiye' }),
  t('TR_ISSIZ', 'İşsizlik Oranı', 'ECONOMICS:TRUR', 'ECONOMY', { decimals: 1, suffix: '%', note: 'Türkiye' }),
  t('US_ENF', 'ABD TÜFE (yıllık)', 'ECONOMICS:USIRYY', 'ECONOMY', { decimals: 1, suffix: '%', note: 'ABD' }),
  t('US_FAIZ', 'Fed Faizi', 'ECONOMICS:USINTR', 'ECONOMY', { suffix: '%', note: 'ABD' }),
]

/** Katalog araması için Türkçe eş anlamlılar. */
export const KEYWORDS: Record<string, string> = {
  ONS: 'altın gold xau', GUMUS: 'gümüş silver xag', ALTIN: 'altın sertifika darphane gold',
  GLDTR: 'altın fon gold etf', GMSTR: 'gümüş fon silver etf', BRENT: 'petrol oil', WTI: 'petrol oil',
  DOGALGAZ: 'gaz natural gas', BAKIR: 'copper', USDTRY: 'dolar usd', EURTRY: 'euro avro eur',
  TR_ENF: 'enflasyon tüfe inflation', TR_KONUT: 'konut ev house trhpi', TR_FAIZ: 'faiz interest',
  BTC: 'bitcoin kripto', BTCTRY: 'bitcoin kripto',
}

const DEFAULT_KEYS = [
  'USDTRY', 'EURTRY', 'EURUSD', 'DXY',
  'ONS', 'GUMUS', 'BRENT',
  'XU100', 'XU030', 'ALTIN',
  'SPX', 'NASDAQ', 'DOW', 'US10Y',
  'BTC',
  'TR_ENF', 'TR_FAIZ',
]

export const defaultInstruments = (): Instrument[] =>
  DEFAULT_KEYS.map((k) => CATALOG.find((i) => i.key === k)!).map((i) => ({ ...i }))

/**
 * Hazır hesaplamalar (doğrulanmış tanımlar):
 * 1 troy ons = 31,1034768 gr · çeyrek 1,75 gr 22 ayar → 1,6067 gr has · 1 ALTIN.S1 = 0,01 gr
 */
export const defaultFormulas = (): Formula[] => [
  { key: 'GRAM_ALTIN', name: 'Gram Altın', expression: 'ONS * USDTRY / OZ', decimals: 2, prefix: '', suffix: '₺' },
  { key: 'CEYREK', name: 'Çeyrek Altın (has)', expression: 'GRAM_ALTIN * 1.6067', decimals: 0, prefix: '', suffix: '₺' },
  { key: 'GRAM_GUMUS', name: 'Gram Gümüş', expression: 'GUMUS * USDTRY / OZ', decimals: 2, prefix: '', suffix: '₺' },
  { key: 'SERTIFIKA_PRIM', name: 'Sertifika Primi', expression: 'pct(ALTIN * 100; GRAM_ALTIN)', decimals: 2, prefix: '', suffix: '%' },
  { key: 'BIST_USD', name: 'BIST 100 ($)', expression: 'XU100 / USDTRY', decimals: 2, prefix: '$', suffix: '' },
  { key: 'ALTIN_GUMUS', name: 'Altın/Gümüş Rasyosu', expression: 'ONS / GUMUS', decimals: 2, prefix: '', suffix: '' },
  { key: 'SEPET', name: 'Döviz Sepeti', expression: '(USDTRY + EURTRY) / 2', decimals: 4, prefix: '', suffix: '₺' },
  { key: 'REEL_FAIZ', name: 'Reel Faiz', expression: 'TR_FAIZ - TR_ENF', decimals: 2, prefix: '', suffix: '%' },
]

const CRYPTO_EXCHANGES = new Set(['BINANCE', 'COINBASE', 'BITSTAMP', 'KRAKEN', 'BTCTURK', 'BYBIT', 'OKX', 'BITFINEX', 'CRYPTOCAP', 'PARIBU'])
const US_EXCHANGES = new Set(['NASDAQ', 'NYSE', 'AMEX', 'CBOE', 'SP', 'DJ', 'OTC', 'BATS', 'ARCA'])
const COMMODITY_EXCHANGES = new Set(['COMEX', 'NYMEX', 'CBOT', 'ICEEUR', 'ICEUS', 'MCX'])

export interface SearchHit {
  symbol: string
  name: string
  ticker: string
  type?: string
  typeLabel?: string
  exchange?: string
  price?: number
  change?: number
  pricescale?: number
  currency?: string
}

/** TradingView arama sonucundan enstrüman: kategori, ondalık, birim ve anahtar otomatik. */
export function instrumentFromHit(hit: SearchHit, existingKeys: Iterable<string>): Instrument {
  const known = CATALOG.find((i) => i.symbol.toUpperCase() === hit.symbol.toUpperCase())
  if (known) return { ...known, key: uniqueKey(known.key, existingKeys) }
  const exchange = hit.exchange ?? hit.symbol.split(':')[0]
  const ticker = hit.ticker || hit.symbol.split(':').pop()!
  const type = hit.type
  let category: Category
  if (type === 'economic' || exchange === 'ECONOMICS') category = 'ECONOMY'
  else if (exchange === 'BIST') category = 'TR'
  else if (type === 'forex') category = 'FX'
  else if (type === 'spot' || type === 'crypto' || CRYPTO_EXCHANGES.has(exchange)) category = 'CRYPTO'
  else if (type === 'commodity' || type === 'futures' || COMMODITY_EXCHANGES.has(exchange)) category = 'COMMODITY'
  else if (US_EXCHANGES.has(exchange) || (exchange === 'TVC' && ticker.startsWith('US'))) category = 'US'
  else if (exchange === 'OANDA' || (exchange === 'TVC' && type === 'cfd')) category = 'COMMODITY'
  else category = 'WORLD'
  const scaleDecimals = hit.pricescale && hit.pricescale >= 1 ? Math.trunc(Math.log10(hit.pricescale)) : undefined
  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
  const decimals =
    category === 'FX' ? clamp(scaleDecimals ?? 4, 2, 4)
      : category === 'CRYPTO' && (hit.price ?? 0) >= 1000 ? 0
        : category === 'ECONOMY' ? 2
          : clamp(scaleDecimals ?? 2, 0, 6)
  const priced = ['stock', 'fund', 'dr', 'structured', 'spot', 'crypto', 'commodity', 'futures', 'cfd'].includes(type ?? '') ||
    category === 'COMMODITY' || category === 'CRYPTO'
  const cur = hit.currency
  const prefix = !priced ? '' : cur === 'USD' || cur === 'USDT' || cur === 'USDC' ? '$' : cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : ''
  const suffix = !priced ? '' : cur === 'TRY' ? '₺' : !cur || ['USD', 'USDT', 'USDC', 'EUR', 'GBP'].includes(cur) ? '' : cur
  return {
    key: uniqueKey(suggestKey(ticker.replace(/!/g, '')), existingKeys),
    name: prettyName(hit.name, ticker),
    symbol: hit.symbol.toUpperCase(),
    category,
    decimals,
    prefix,
    suffix,
    note: type === 'futures' ? 'Vadeli' : undefined,
  }
}

/** "DARPHANE ALTIN SERTIFIKASI" → "Darphane Altin Sertifikasi"; şirket ekleri kısaltılır. */
export function prettyName(raw: string | undefined, fallback: string): string {
  let s = (raw ?? '').trim()
  if (!s) return fallback
  if (s === s.toUpperCase() && /\p{L}/u.test(s) && s.length > 4) {
    s = s.toLowerCase().split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }
  s = s.replace(/\s+(A\.?S\.?|A\.O\.|T\.A\.S\.|Inc\.?|Corporation|Corp\.?|Ltd\.?|PLC|N\.V\.|Class [A-C]|S\.A\.)\.?(?=\s|,|$)/gi, '')
  // Türk şirket unvanlarının kuyruğu: "… Sanayi ve Ticaret Anonim Şirketi" → "…"
  const tail = /\s+(Anonim\s+[SŞ]irketi|Aktiengesellschaft|AG|SE|Holding\s+A\.?S\.?|ve\s+Ticaret|ve\s+Sanayi|Sanayi|Ticaret|Sanayii)\.?$/i
  for (let i = 0; i < 4 && tail.test(s) && s.replace(tail, '').trim().length >= 3; i++) s = s.replace(tail, '')
  s = s.replace(/\s+/g, ' ').trim().replace(/[,.]+$/, '')
  return s || fallback
}
