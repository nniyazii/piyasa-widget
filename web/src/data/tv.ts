/**
 * TradingView tarayıcı (scanner) servisi: tarayıcıdan doğrudan erişilir (CORS açık), anahtar gerektirmez.
 * - Fiyatlar: tüm semboller tek istekte
 * - Arama: kod, ad ya da Türkçe kelimeyle tüm pazarlarda
 * - Tarama: dinamik listeler için evren + filtre
 */
import type { SearchHit } from '../core/catalog'
import type { Instrument, Quote } from '../core/models'

const BASE = 'https://scanner.tradingview.com'

export interface ScanRow { s: string; d: unknown[] }

export async function scan(market: string, body: unknown, signal?: AbortSignal): Promise<ScanRow[]> {
  // text/plain: tarayıcı ön kontrol (preflight) isteği göndermez
  const res = await fetch(`${BASE}/${market}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(body),
    // Yanıt gelmezse tarama sonsuza dek "sürüyor" kalmasın
    signal: signal ?? AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`TradingView yanıt vermedi (${res.status})`)
  const json = (await res.json()) as { data?: ScanRow[] }
  if (!Array.isArray(json.data)) throw new Error('TradingView: beklenmeyen yanıt')
  return json.data
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)

const QUOTE_COLUMNS = ['close', 'change', 'open', 'high', 'low', 'currency', 'update_mode']

/** Enstrüman anahtarı → fiyat. Aynı sembolü paylaşan anahtarlar aynı fiyatı alır. */
export async function quotes(instruments: Instrument[], signal?: AbortSignal): Promise<Record<string, Quote>> {
  const symbols = [...new Set(instruments.map((i) => i.symbol.toUpperCase()))]
  const now = Date.now()
  const bySymbol = new Map<string, Quote>()
  for (let i = 0; i < symbols.length; i += 200) {
    const chunk = symbols.slice(i, i + 200)
    const rows = await scan('global', { symbols: { tickers: chunk }, columns: QUOTE_COLUMNS }, signal)
    for (const r of rows) {
      const [close, change, open, high, low, currency, mode] = r.d
      const price = num(close)
      if (price == null) continue
      const ch = num(change)
      bySymbol.set(r.s.toUpperCase(), {
        price,
        prevClose: ch != null && ch > -100 ? price / (1 + ch / 100) : undefined,
        open: num(open), high: num(high), low: num(low),
        time: now,
        currency: str(currency),
        delayed: typeof mode === 'string' && mode.startsWith('delayed'),
      })
    }
  }
  const out: Record<string, Quote> = {}
  for (const ins of instruments) {
    const q = bySymbol.get(ins.symbol.toUpperCase())
    if (q) out[ins.key] = q
  }
  return out
}

// ------------------------------------------------------------------ arama

const SEARCH_COLUMNS = ['name', 'description', 'type', 'exchange', 'close', 'change', 'pricescale', 'currency']

/** Kesin kod eşleşmesinde denenecek borsalar (öncelik sırasıyla). */
const EXCHANGES = [
  'BIST', 'NASDAQ', 'NYSE', 'AMEX', 'FX', 'OANDA', 'TVC', 'SP', 'DJ', 'CBOE', 'ECONOMICS',
  'FX_IDC', 'COMEX', 'NYMEX', 'BITSTAMP', 'BINANCE', 'COINBASE', 'XETR', 'LSE',
]

const f = (left: string, operation: string, right: unknown) => ({ left, operation, right })
const MARKETS: { market: string; range: number; sort?: string; extra?: unknown[] }[] = [
  { market: 'turkey', range: 8, sort: 'volume', extra: [f('type', 'in_range', ['stock', 'fund', 'dr', 'index', 'structured'])] },
  { market: 'cfd', range: 5, extra: [f('exchange', 'in_range', ['OANDA', 'TVC', 'FX', 'CAPITALCOM'])] },
  { market: 'forex', range: 4, extra: [f('exchange', 'in_range', ['FX', 'FX_IDC', 'OANDA'])] },
  { market: 'america', range: 6, sort: 'market_cap_basic', extra: [f('is_primary', 'equal', true)] },
  { market: 'economics2', range: 5 },
  { market: 'crypto', range: 4, sort: '24h_vol|5', extra: [f('type', 'equal', 'spot'), f('exchange', 'in_range', ['BINANCE', 'COINBASE', 'BITSTAMP', 'KRAKEN', 'BTCTURK'])] },
]

const SYNONYMS: [string, string][] = [
  ['altin', 'gold'], ['gumus', 'silver'], ['petrol', 'oil'], ['dogalgaz', 'natural gas'], ['bakir', 'copper'],
  ['platin', 'platinum'], ['paladyum', 'palladium'], ['dolar', 'usd'], ['avro', 'eur'], ['sterlin', 'gbp'],
  ['konut', 'house price'], ['enflasyon', 'inflation'], ['faiz', 'interest rate'], ['issizlik', 'unemployment'],
  ['buyume', 'gdp'], ['turkiye', 'turkey'], ['abd', 'united states'], ['amerika', 'united states'],
  ['kripto', 'bitcoin'], ['fon', 'fund'], ['sertifika', 'sertifikasi'],
]

export function fold(s: string): string {
  return s.toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ç/g, 'c').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .normalize('NFD').replace(/\p{M}+/gu, '')
}

/** BIST/Yahoo/TradingView tarzı kodu sade tickere çevirir: ALTIN.S1 → ALTIN, THYAO.IS → THYAO. */
export function normalizeCode(input: string): string | undefined {
  let s = input.trim().toUpperCase().replace(/\s*:\s*/g, ':')
  if (/\s/.test(s)) return undefined
  s = s.includes(':') ? s.slice(s.indexOf(':') + 1) : s
  s = s.replace(/\.(S\d*|F|E|IS|R|V)$/, '')
  if (s.endsWith('=X')) s = s.slice(0, -2)
  if (/^[A-Z0-9]{1,6}-(USD|USDT|TRY|EUR)$/.test(s)) s = s.replace('-', '')
  return /^[A-Z0-9_!.]{1,20}$/.test(s) ? s : undefined
}

export function textPattern(input: string): string | undefined {
  const folded = fold(input).replace(/[^a-z0-9 ]/g, ' ').trim().replace(/\s+/g, ' ')
  if (folded.length < 2) return undefined
  const terms = new Set([folded])
  const code = normalizeCode(input)?.toLowerCase()
  if (code && code !== folded.replace(/ /g, '')) terms.add(code)
  for (const [tr, en] of SYNONYMS) if (folded.includes(tr)) terms.add(en)
  return [...terms].join('|')
}

const TYPE_LABELS: Record<string, string> = {
  stock: 'Hisse', fund: 'Fon', dr: 'Sertifika', structured: 'Yapılandırılmış', index: 'Endeks', forex: 'Döviz',
  commodity: 'Emtia', cfd: 'Emtia', futures: 'Vadeli', spot: 'Kripto', crypto: 'Kripto', economic: 'Ekonomik gösterge', bond: 'Tahvil',
}

function toHit(r: ScanRow): SearchHit {
  const [name, description, type, exchange, close, change, pricescale, currency] = r.d
  return {
    symbol: r.s,
    ticker: str(name) ?? r.s.split(':').pop()!,
    name: str(description) ?? str(name) ?? r.s,
    type: str(type),
    typeLabel: TYPE_LABELS[str(type) ?? ''] ?? str(type),
    exchange: str(exchange),
    price: num(close),
    change: num(change),
    pricescale: num(pricescale),
    currency: str(currency),
  }
}

/**
 * "altın", "ALTIN.S1", "gmstr.f", "trhpi", "BIST:THYAO", "apple", "bitcoin" …
 * Önce kesin kod eşleşmeleri, sonra pazar pazar ad araması; sonuçlar fiyatlarıyla gelir.
 */
export async function search(query: string, signal?: AbortSignal): Promise<SearchHit[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const code = normalizeCode(q)
  const pattern = textPattern(q)
  const direct = q.includes(':') ? [q.toUpperCase().replace(/\s/g, '')] : code ? EXCHANGES.map((e) => `${e}:${code}`) : []
  const exact = direct.length
    ? scan('global', { symbols: { tickers: direct }, columns: SEARCH_COLUMNS }, signal)
      .then((rows) => rows.sort((a, b) => rank(a) - rank(b)))
      .catch(() => [] as ScanRow[])
    : Promise.resolve([] as ScanRow[])
  const markets = pattern
    ? MARKETS.map((m) => scan(m.market, {
      filter: [{ left: 'name,description', operation: 'match', right: pattern }, ...(m.extra ?? [])],
      columns: SEARCH_COLUMNS,
      range: [0, m.range],
      ...(m.sort ? { sort: { sortBy: m.sort, sortOrder: 'desc' } } : {}),
    }, signal).catch(() => [] as ScanRow[]))
    : []
  const rows = [...(await exact), ...(await Promise.all(markets)).flat()]
  const seen = new Set<string>()
  return rows
    .filter((r) => (seen.has(r.s) ? false : (seen.add(r.s), true)))
    .filter((r) => !r.s.endsWith('.P'))
    .slice(0, 30)
    .map(toHit)
}

function rank(r: ScanRow) {
  const i = EXCHANGES.indexOf(r.s.split(':')[0])
  return i < 0 ? 99 : i
}
