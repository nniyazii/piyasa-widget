/**
 * Avantajlı fiyatlar verisi: canlı fiyatlar (TradingView) ve pay başına olağan maden miktarı için
 * günlük kapanış geçmişi. Sayfalar arasında paylaşılır; 60 saniyeden eskiyse yenilenir.
 */
import { useEffect, useSyncExternalStore } from 'react'
import type { Advice, RatioData } from '../core/advice'
import { bankSession } from '../core/costs'
import { bistOpen, type PremiumRow } from '../core/premium'
import { buildPremiums, PREMIUM_QUOTES, PREMIUM_SYMBOLS } from '../core/premiums'
import { dailyCloses } from './daily'
import { scan } from './tv'

export interface BankQuote { bid: number; ask: number }
export interface BanksData { generated: number; banks: BankEntry[]; physical?: BankEntry[]
  /** Fiyatlar banka mesaisinde mi okundu (yoksa makaslar olağandan geniştir) */
  session?: boolean
  /** Mesai dışındayken: mesai içindeki son fiyatlar */
  daytime?: { generated: number; banks: BankEntry[]; physical?: BankEntry[] }
  /** Karşılaştırmada mesai içi son fiyatlar kullanılıyor; canlı (mesai dışı) okuma zamanı */
  offHoursAt?: number
}

/** Mesai dışında okunmuşsa karşılaştırma mesai içindeki son fiyatlarla yapılır. */
export function effectiveBanks(d: BanksData): BanksData {
  // Alan yoksa (eski kopya) okuma zamanından bulunur
  const session = d.session ?? bankSession(d.generated)
  if (session) return { ...d, session: true }
  if (!d.daytime?.banks.length) return { ...d, session: false }
  return { ...d.daytime, session: true, offHoursAt: d.generated }
}
export interface BankEntry { id: string; name: string; gold?: BankQuote; silver?: BankQuote }

export interface PremiumState { rows: PremiumRow[]; advices: Advice[]; money: Advice[]; banks?: BanksData; time: number; open: boolean; loading: boolean; error?: string }

let state: PremiumState = { rows: [], advices: [], money: [], time: 0, open: bistOpen(), loading: false }
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
      if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) return effectiveBanks((await r.json()) as BanksData)
    } catch { /* sıradaki kaynak */ }
  }
  return undefined
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

export async function refreshPremiums(): Promise<void> {
  if (state.loading) return
  set({ loading: true })
  try {
    const [quotes, daily, long, banks] = await Promise.all([
      scan('global', { symbols: { tickers: PREMIUM_QUOTES }, columns: ['close'] }),
      // Geçmiş yoksa (bu yayında günlük veri yok) sertifika yine hesaplanır, fonlar "bilinmiyor" kalır
      dailyCloses(PREMIUM_SYMBOLS).catch(() => new Map()),
      loadRatios(),
      loadBanks(),
    ])
    const price = new Map(quotes.map((r) => [r.s.toUpperCase(), num(r.d[0])]))
    const b = buildPremiums(price, daily, long)
    set({ rows: b.rows, advices: b.advices, money: b.money, banks: banks ?? state.banks, time: Date.now(), open: bistOpen(), loading: false, error: b.fx == null ? 'Fiyatlar alınamadı' : undefined })
  } catch (e) {
    set({ loading: false, error: navigator.onLine === false ? 'Çevrimdışısınız' : (e as Error).message || 'Fiyatlar alınamadı' })
  }
}
export const getPremiums = () => state

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
