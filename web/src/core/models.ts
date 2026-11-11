import type { Screen, ScreenResult } from './screener'

export type Category = 'FX' | 'COMMODITY' | 'TR' | 'US' | 'CRYPTO' | 'ECONOMY' | 'WORLD'

/** Sıra = listedeki gruplama sırası. */
export const CATEGORIES: { id: Category; label: string; short: string }[] = [
  { id: 'FX', label: 'Döviz', short: 'FX' },
  { id: 'COMMODITY', label: 'Emtia', short: 'EMT' },
  { id: 'TR', label: 'Türkiye', short: 'TR' },
  { id: 'US', label: 'Amerika', short: 'ABD' },
  { id: 'CRYPTO', label: 'Kripto', short: 'KRP' },
  { id: 'ECONOMY', label: 'Ekonomi', short: 'EKO' },
  { id: 'WORLD', label: 'Dünya', short: 'DÜN' },
]

export const categoryLabel = (c: Category) => CATEGORIES.find((x) => x.id === c)?.label ?? c

export interface Instrument {
  /** Formüllerde kullanılan benzersiz anahtar (USDTRY, ONS …). */
  key: string
  name: string
  /** TradingView sembolü: "BIST:ALTIN", "ECONOMICS:TRHPI". */
  symbol: string
  category: Category
  decimals: number
  prefix: string
  suffix: string
  /** "Spot", "Vadeli" … */
  note?: string
}

export interface Formula {
  key: string
  name: string
  expression: string
  decimals: number
  prefix: string
  suffix: string
}

export interface Quote {
  price: number
  prevClose?: number
  open?: number
  high?: number
  low?: number
  /** epoch ms */
  time: number
  currency?: string
  /** TradingView'da gecikmeli (BIST ~15 dk). */
  delayed?: boolean
}

export type ChangeStyle = 'pill' | 'text' | 'hidden'
export type Density = 'compact' | 'normal' | 'comfortable'

/**
 * Pano kartı: Android widget'ının web karşılığı. Aynı içerik modeli:
 * gösterge/formül anahtarları, bölümler ("#:Başlık") ve dinamik listeler ("@:id").
 */
export interface Board {
  id: string
  title: string
  keys: string[]
  density: Density
  changeStyle: ChangeStyle
  /** Yazı ölçeği 0.85 … 1.3 */
  textScale: number
  /** Gün içi aralık çubuğu. */
  showRange: boolean
  showSubtitle: boolean
  /** Dinamik liste girişlerinde en fazla satır. */
  screenRows: number
  /** Izgarada kapladığı genişlik. */
  span: 1 | 2
}

export const SECTION_PREFIX = '#:'
export const SCREEN_PREFIX = '@:'
export const isSection = (k: string) => k.startsWith(SECTION_PREFIX)
export const isScreenEntry = (k: string) => k.startsWith(SCREEN_PREFIX)
export const sectionTitle = (k: string) => k.slice(SECTION_PREFIX.length)
export const sectionEntry = (title: string) => SECTION_PREFIX + title.trim()
export const screenEntry = (id: string) => SCREEN_PREFIX + id
export const screenIdOf = (k: string) => k.slice(SCREEN_PREFIX.length)

export type Theme = 'system' | 'light' | 'dark'

export interface Settings {
  theme: Theme
  /** Canlı yenileme aralığı (saniye). 0 = yalnızca elle. */
  refreshSeconds: number
  /** Fiyat değişiminde rakam vurgusu. */
  tickFlash: boolean
  /** Dinamik listeler sayfasındaki sıralama (yoksa kullanıcının kendi sırası). */
  screenSort?: ScreenListSort
}

export type ScreenListSort = 'manual' | 'score' | 'matches' | 'name'

export interface AppState {
  version: number
  instruments: Instrument[]
  formulas: Formula[]
  screens: Screen[]
  boards: Board[]
  settings: Settings
  /** İlk açılış ipucu kapatıldı mı. */
  welcomed: boolean
  /** Hazır listelerin hangi sürümüne göre kaydedildi (yeni hazırlar ve güncellemeler bir kez uygulanır). */
  templates?: number
}

/** Çalışma anı verisi (kalıcı değil ya da ayrı önbellek). */
export interface LiveData {
  quotes: Record<string, Quote>
  lastRefresh: number
  refreshing: boolean
  error?: string
  screenResults: Record<string, ScreenResult>
  screensRunning: Record<string, boolean>
  /** "Hepsini tara" sürerken ilerleme */
  scanAll?: { done: number; total: number }
}

export const newId = (prefix: string) => prefix + '_' + Math.random().toString(36).slice(2, 9)

export function defaultBoard(partial: Partial<Board> = {}): Board {
  return {
    id: newId('b'),
    title: 'Pano',
    keys: [],
    density: 'normal',
    changeStyle: 'pill',
    textScale: 1,
    showRange: true,
    showSubtitle: false,
    screenRows: 5,
    span: 1,
    ...partial,
  }
}

export function itemKeys(board: Board) {
  return board.keys.filter((k) => !isSection(k) && !isScreenEntry(k))
}

/** Bir öğeyi listede taşır. */
export function move<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) return list
  const out = list.slice()
  const [x] = out.splice(from, 1)
  out.splice(to, 0, x)
  return out
}

/**
 * Bir alt kümenin (ör. tek kategori) sırasını değiştirir; alt kümenin kapladığı konumlar
 * ve diğer öğeler yerinde kalır.
 */
export function reorderSubset<T, K>(list: T[], order: K[], key: (t: T) => K): T[] {
  const byKey = new Map(list.map((x) => [key(x), x]))
  const wanted = [...new Set(order)].filter((k) => byKey.has(k))
  const set = new Set(wanted)
  const queue = wanted.map((k) => byKey.get(k)!)
  return list.map((x) => (set.has(key(x)) ? queue.shift()! : x))
}
