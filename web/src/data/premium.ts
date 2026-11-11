/**
 * Avantajlı fiyatlar verisi: canlı fiyatlar (TradingView) ve pay başına olağan maden miktarı için
 * günlük kapanış geçmişi. Sayfalar arasında paylaşılır; 60 saniyeden eskiyse yenilenir.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { advices, type Advice, type RatioData } from '../core/advice'
import { bistOpen, METALS, PREMIUM_PAIRS, premiumRow, typicalGrams, USDTRY, type PremiumRow } from '../core/premium'
import { dailyCloses } from './daily'
import { scan } from './tv'

export interface BankQuote { bid: number; ask: number }
export interface BanksData { generated: number; banks: BankEntry[]; physical?: BankEntry[] }
export interface BankEntry { id: string; name: string; gold?: BankQuote; silver?: BankQuote }

export interface PremiumState { rows: PremiumRow[]; advices: Advice[]; banks?: BanksData; time: number; open: boolean; loading: boolean; error?: string }

let state: PremiumState = { rows: [], advices: [], time: 0, open: bistOpen(), loading: false }
const listeners = new Set<() => void>()
const set = (p: Partial<PremiumState>) => { state = { ...state, ...p }; listeners.forEach((l) => l()) }

let ratios: Promise<RatioData | undefined> | undefined
/** Uzun dönem aylık seriler: statik kopya, yoksa sunucu */
function loadRatios() {
  ratios ??= (async () => {
    for (const url of ['data/ratios.json', 'api/ratios']) {
      try {
        const r = await fetch(url, { cache: 'no-cache' })
        if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) return (await r.json()) as RatioData
      } catch { /* sıradaki kaynak */ }
    }
    ratios = undefined // sonraki yenilemede yeniden denensin
    return undefined
  })()
  return ratios
}

/** Banka alış/satış fiyatları: yarım saatte bir yenilenen kopya, sunucuda canlı */
async function loadBanks(): Promise<BanksData | undefined> {
  for (const url of ['data/banks.json', 'api/banks']) {
    try {
      const r = await fetch(url, { cache: 'no-cache' })
      if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) return (await r.json()) as BanksData
    } catch { /* sıradaki kaynak */ }
  }
  return undefined
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

export async function refreshPremiums(): Promise<void> {
  if (state.loading) return
  set({ loading: true })
  try {
    const metals = Object.values(METALS).map((m) => m.symbol)
    const symbols = [...PREMIUM_PAIRS.map((p) => p.symbol), ...metals, USDTRY]
    const [quotes, daily, long, banks] = await Promise.all([
      scan('global', { symbols: { tickers: symbols }, columns: ['close'] }),
      // Geçmiş yoksa (bu yayında günlük veri yok) sertifika yine hesaplanır, fonlar "bilinmiyor" kalır
      dailyCloses(symbols).catch(() => new Map()),
      loadRatios(),
      loadBanks(),
    ])
    const price = new Map(quotes.map((r) => [r.s.toUpperCase(), num(r.d[0])]))
    const fx = price.get(USDTRY)
    const rows = PREMIUM_PAIRS.map((p) => {
      const m = METALS[p.metal].symbol
      const typical = p.grams == null ? typicalGrams(daily.get(p.symbol), daily.get(m), daily.get(USDTRY)) : undefined
      return premiumRow(p, price.get(p.symbol), price.get(m), fx, typical)
    })
    const adv = long ? advices(long, { gold: price.get(METALS.GOLD.symbol), silver: price.get(METALS.SILVER.symbol), usdTry: fx }) : []
    set({ rows, advices: adv, banks: banks ?? state.banks, time: Date.now(), open: bistOpen(), loading: false, error: fx == null ? 'Fiyatlar alınamadı' : undefined })
  } catch (e) {
    set({ loading: false, error: navigator.onLine === false ? 'Çevrimdışısınız' : (e as Error).message || 'Fiyatlar alınamadı' })
  }
}

/** Avantajlı fiyatlar; ekranda olduğu sürece dakikada bir yenilenir. */
export function usePremiums(): PremiumState {
  const s = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => state)
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible' && Date.now() - state.time > 55_000) void refreshPremiums() }
    tick()
    const t = setInterval(tick, 60_000)
    return () => clearInterval(t)
  }, [])
  return s
}

/** Al sinyali veren sayısı (BIST kapalıyken sinyal sayılmaz) */
export const buyCount = (s: PremiumState) => (s.open ? s.rows.filter((r) => r.signal === 'buy').length : 0)
