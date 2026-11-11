/**
 * Avantajlı fiyatlar verisi: canlı fiyatlar (TradingView) ve pay başına olağan maden miktarı için
 * günlük kapanış geçmişi. Sayfalar arasında paylaşılır; 60 saniyeden eskiyse yenilenir.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { bistOpen, METALS, PREMIUM_PAIRS, premiumRow, typicalGrams, USDTRY, type PremiumRow } from '../core/premium'
import { dailyCloses } from './daily'
import { scan } from './tv'

export interface PremiumState { rows: PremiumRow[]; time: number; open: boolean; loading: boolean; error?: string }

let state: PremiumState = { rows: [], time: 0, open: bistOpen(), loading: false }
const listeners = new Set<() => void>()
const set = (p: Partial<PremiumState>) => { state = { ...state, ...p }; listeners.forEach((l) => l()) }

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

export async function refreshPremiums(): Promise<void> {
  if (state.loading) return
  set({ loading: true })
  try {
    const metals = Object.values(METALS).map((m) => m.symbol)
    const symbols = [...PREMIUM_PAIRS.map((p) => p.symbol), ...metals, USDTRY]
    const [quotes, daily] = await Promise.all([
      scan('global', { symbols: { tickers: symbols }, columns: ['close'] }),
      // Geçmiş yoksa (bu yayında günlük veri yok) sertifika yine hesaplanır, fonlar "bilinmiyor" kalır
      dailyCloses(symbols).catch(() => new Map()),
    ])
    const price = new Map(quotes.map((r) => [r.s.toUpperCase(), num(r.d[0])]))
    const fx = price.get(USDTRY)
    const rows = PREMIUM_PAIRS.map((p) => {
      const m = METALS[p.metal].symbol
      const typical = p.grams == null ? typicalGrams(daily.get(p.symbol), daily.get(m), daily.get(USDTRY)) : undefined
      return premiumRow(p, price.get(p.symbol), price.get(m), fx, typical)
    })
    set({ rows, time: Date.now(), open: bistOpen(), loading: false, error: fx == null ? 'Fiyatlar alınamadı' : undefined })
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
