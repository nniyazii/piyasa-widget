/**
 * Listelerin güvenilirlik skoru: hazır listeler için her gün CI'da hesaplanan kopya (data/scores.json),
 * kullanıcının kendi testleri için bu tarayıcıda saklanan sonuç. Skor yalnızca koşullar aynıysa gösterilir.
 */
import { useEffect, useState } from 'react'
import type { Reliability } from '../core/backtest'
import type { Screen } from '../core/screener'

export interface ScoreEntry {
  rel: Reliability
  /** Testin kapsadığı yıl */
  years: number
  /** Hesaplandığı an (ms) */
  at: number
  source: 'published' | 'local'
  /** Tüm dönem portföy getirileri (oran) ve endeks */
  portfolios?: { list?: number; hold1m?: number; hold3m?: number; bench?: number }
}

/** Skoru etkileyen tanım: koşullar, evren, para birimi… (ad ve sıralama hariç) */
export function fingerprint(s: Pick<Screen, 'universe' | 'currency' | 'category' | 'onlyStocks' | 'matchAll' | 'conditions'>): string {
  const c = s.conditions.map((x) => [x.left, x.op, x.right ?? '', x.value])
  return JSON.stringify([s.universe, s.currency, s.category ?? '', !!s.onlyStocks, !!s.matchAll, c])
}

interface Published { generated: number; years: number; scores: Record<string, Omit<ScoreEntry, 'source' | 'at' | 'years'>> }

let published: Promise<Published | undefined> | undefined
function loadPublished() {
  published ??= fetch('data/scores.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? (r.json() as Promise<Published>) : undefined))
    .catch(() => undefined)
  return published
}

const KEY = 'piyasa.reliability.v1'
type LocalMap = Record<string, Omit<ScoreEntry, 'source'>>
function readLocal(): LocalMap {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as LocalMap } catch { return {} }
}
const listeners = new Set<() => void>()

/** Kullanıcının testinden çıkan skoru saklar (en uzun dönem ya da en yeni olan kalır). */
export function saveLocalScore(screen: Screen, entry: Omit<ScoreEntry, 'source'>) {
  if (entry.rel.score == null && entry.rel.label !== 'Yetersiz veri') return
  const map = readLocal()
  const fp = fingerprint(screen)
  const prev = map[fp]
  if (prev && prev.years > entry.years && Date.now() - prev.at < 30 * 86400_000) return
  map[fp] = entry
  const keys = Object.keys(map)
  if (keys.length > 200) for (const k of keys.sort((a, b) => map[a].at - map[b].at).slice(0, keys.length - 200)) delete map[k]
  try { localStorage.setItem(KEY, JSON.stringify(map)) } catch { /* depolama dolu: yok say */ }
  listeners.forEach((f) => f())
}

/** Bu listenin bilinen skoru: kendi testin (daha yeni ya da daha uzun dönemse) ya da yayımlanan. */
export function useReliability(screen: Screen | undefined): ScoreEntry | undefined {
  const [pub, setPub] = useState<Published | undefined>()
  const [, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    void loadPublished().then((p) => alive && setPub(p))
    const f = () => setTick((t) => t + 1)
    listeners.add(f)
    return () => { alive = false; listeners.delete(f) }
  }, [])
  if (!screen) return undefined
  const fp = fingerprint(screen)
  const local = readLocal()[fp]
  const p = pub?.scores[fp]
  const fromPub: ScoreEntry | undefined = p && pub ? { ...p, years: pub.years, at: pub.generated, source: 'published' } : undefined
  const fromLocal: ScoreEntry | undefined = local ? { ...local, source: 'local' } : undefined
  if (fromPub && fromLocal) return fromLocal.years >= fromPub.years ? fromLocal : fromPub
  return fromLocal ?? fromPub
}
