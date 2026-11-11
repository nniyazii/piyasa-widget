/**
 * Uygulama durumu: kalıcı (localStorage) + çalışma anı (fiyatlar, tarama sonuçları).
 * Bileşenler useApp() / useLive() ile abone olur; değişiklikler actions üzerinden yapılır.
 */
import { useSyncExternalStore } from 'react'
import { CATALOG, defaultFormulas, defaultInstruments } from '../core/catalog'
import {
  defaultBoard, reorderSubset, screenEntry, sectionEntry, isScreenEntry, screenIdOf,
  type AppState, type Board, type Category, type Formula, type Instrument, type LiveData, type Quote, type Settings,
} from '../core/models'
import { defaultScreens, TEMPLATES_REVISION, upgradeTemplates, type Screen, type ScreenResult } from '../core/screener'
import { runScreen } from './screens'
import { quotes as fetchQuotes } from './tv'

const STATE_KEY = 'piyasa.state.v1'
const QUOTES_KEY = 'piyasa.quotes.v1'
const SCREENS_KEY = 'piyasa.screens.v1'
export const STATE_VERSION = 1

export function defaultBoards(): Board[] {
  return [
    defaultBoard({
      id: 'b_altin_doviz', title: 'Altın ve döviz',
      keys: [sectionEntry('Altın'), 'GRAM_ALTIN', 'CEYREK', 'ONS', 'SERTIFIKA_PRIM', sectionEntry('Döviz'), 'USDTRY', 'EURTRY', 'SEPET'],
    }),
    defaultBoard({ id: 'b_borsalar', title: 'Borsalar', keys: ['XU100', 'XU030', 'BIST_USD', 'SPX', 'NASDAQ', 'US10Y'] }),
    defaultBoard({ id: 'b_firsat', title: '5 yıllık dibe yakın BIST ($)', keys: [screenEntry('d_bist_5y_usd')], screenRows: 6 }),
    defaultBoard({ id: 'b_temettu', title: 'Yüksek temettü verimli BIST', keys: [screenEntry('d_bist_dividend')], screenRows: 6 }),
  ]
}

export const defaultSettings = (): Settings => ({ theme: 'system', refreshSeconds: 30, tickFlash: true })

export function defaultState(): AppState {
  return {
    version: STATE_VERSION,
    instruments: defaultInstruments(),
    formulas: defaultFormulas(),
    screens: defaultScreens(),
    boards: defaultBoards(),
    settings: defaultSettings(),
    welcomed: false,
    templates: TEMPLATES_REVISION,
  }
}

function read<T>(key: string): T | undefined {
  try {
    const s = localStorage.getItem(key)
    return s ? (JSON.parse(s) as T) : undefined
  } catch {
    return undefined
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch { /* dolu ya da kapalı: oturum içinde çalışmaya devam */ }
}

/** Eksik alanları tamamlar; bozuk kayıtta varsayılana döner. */
export function sanitize(raw: unknown): AppState {
  const d = defaultState()
  if (!raw || typeof raw !== 'object') return d
  const s = raw as Partial<AppState>
  return {
    version: STATE_VERSION,
    instruments: Array.isArray(s.instruments) ? s.instruments.filter((i) => i?.key && i?.symbol) : d.instruments,
    formulas: Array.isArray(s.formulas) ? s.formulas.filter((f) => f?.key && f?.expression) : d.formulas,
    screens: Array.isArray(s.screens) ? upgradeTemplates(s.screens.filter((x) => x?.id && Array.isArray(x.conditions)), s.templates ?? 1) : d.screens,
    boards: Array.isArray(s.boards) ? s.boards.map((b) => ({ ...defaultBoard(), ...b })) : d.boards,
    settings: { ...d.settings, ...(s.settings ?? {}) },
    welcomed: !!s.welcomed,
    templates: TEMPLATES_REVISION,
  }
}

let state: AppState = sanitize(read(STATE_KEY))
let live: LiveData = {
  quotes: read<Record<string, Quote>>(QUOTES_KEY) ?? {},
  lastRefresh: 0,
  refreshing: false,
  screenResults: read<Record<string, ScreenResult>>(SCREENS_KEY) ?? {},
  screensRunning: {},
}
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

function setState(next: AppState) {
  state = next
  write(STATE_KEY, state)
  emit()
}
function setLive(patch: Partial<LiveData>) {
  live = { ...live, ...patch }
  emit()
}

export const getState = () => state
export const getLive = () => live
export const useApp = () => useSyncExternalStore(subscribe, getState)
export const useLive = () => useSyncExternalStore(subscribe, getLive)

// Başka sekmede değişirse eşitle
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STATE_KEY && e.newValue) {
      try { state = sanitize(JSON.parse(e.newValue)); emit() } catch { /* yoksay */ }
    }
  })
}

// ------------------------------------------------------------------ canlı veri

let quoteAbort: AbortController | null = null

export async function refreshQuotes() {
  if (live.refreshing) return
  const instruments = state.instruments
  if (!instruments.length) return
  quoteAbort?.abort()
  quoteAbort = new AbortController()
  setLive({ refreshing: true })
  try {
    const q = await fetchQuotes(instruments, quoteAbort.signal)
    const quotes = { ...live.quotes, ...q }
    write(QUOTES_KEY, quotes)
    setLive({ quotes, lastRefresh: Date.now(), refreshing: false, error: undefined })
  } catch (e) {
    if ((e as Error).name === 'AbortError') return setLive({ refreshing: false })
    setLive({
      refreshing: false,
      error: navigator.onLine === false ? 'Çevrimdışısınız; son bilinen fiyatlar gösteriliyor' : 'Fiyatlar alınamadı; birazdan yeniden denenecek',
    })
  }
}

/** Tek bir listeyi çalıştırır; hata olursa eski sonuçlar korunur. */
export async function refreshScreen(id: string, override?: Screen): Promise<ScreenResult | undefined> {
  const screen = override ?? state.screens.find((s) => s.id === id)
  if (!screen) return
  if (!override) setLive({ screensRunning: { ...live.screensRunning, [id]: true } })
  let result: ScreenResult
  try {
    result = await runScreen(screen, { instruments: state.instruments, usdTry: live.quotes.USDTRY?.price })
  } catch (e) {
    result = { time: Date.now(), rows: [], scanned: 0, error: (e as Error).message || 'Tarama yapılamadı' }
  }
  if (override) return result
  const prevRows = live.screenResults[id]?.rows ?? []
  if (result.error && prevRows.length) result = { ...result, rows: prevRows }
  const screenResults = { ...live.screenResults, [id]: result }
  write(SCREENS_KEY, screenResults)
  setLive({ screenResults, screensRunning: { ...live.screensRunning, [id]: false } })
  return result
}

const scanQueue: string[] = []
const scanning = new Set<string>()
let scanWorkers: Promise<void> | null = null
let manual: { left: Set<string>; total: number } | null = null

/**
 * Verilen listeleri (varsayılan: hepsi) en fazla 3 eşzamanlı tarar. Süren bir tarama varsa istenenler
 * kuyruğa eklenir; hiçbir istek yok sayılmaz. [byUser] ise ilerleme yayımlanır ve özet döner.
 */
export async function refreshScreens(ids = state.screens.map((s) => s.id), byUser = false): Promise<{ total: number; failed: number }> {
  for (const id of ids) if (!scanQueue.includes(id) && !scanning.has(id)) scanQueue.push(id)
  if (byUser) {
    manual = { left: new Set(ids), total: ids.length }
    setLive({ scanAll: { done: 0, total: ids.length } })
  }
  scanWorkers ??= Promise.all(Array.from({ length: 3 }, async () => {
    while (scanQueue.length) {
      const id = scanQueue.shift()!
      scanning.add(id)
      try {
        await refreshScreen(id)
      } finally {
        scanning.delete(id)
        if (manual?.left.delete(id)) setLive({ scanAll: { done: manual.total - manual.left.size, total: manual.total } })
      }
    }
  })).then(() => { scanWorkers = null })
  await scanWorkers
  if (byUser) {
    manual = null
    setLive({ scanAll: undefined })
  }
  return { total: ids.length, failed: ids.filter((id) => live.screenResults[id]?.error).length }
}

/** Ekranda görünen panolardaki ve listede kullanılan taramalar eskiyse çalıştırır. */
export function screensStale(maxAgeMs: number) {
  const now = Date.now()
  return state.screens.filter((s) => {
    const r = live.screenResults[s.id]
    return !r || now - r.time > maxAgeMs
  }).map((s) => s.id)
}

// ------------------------------------------------------------------ eylemler

const update = (fn: (s: AppState) => AppState) => setState(fn(state))

export const allKeys = (s: AppState = state) => [...s.instruments.map((i) => i.key), ...s.formulas.map((f) => f.key)]

export const actions = {
  addInstrument(ins: Instrument) {
    if (state.instruments.some((i) => i.symbol.toUpperCase() === ins.symbol.toUpperCase())) return
    update((s) => ({ ...s, instruments: [...s.instruments, ins] }))
    void refreshQuotesSoon()
  },
  removeKey(key: string) {
    update((s) => ({
      ...s,
      instruments: s.instruments.filter((i) => i.key !== key),
      formulas: s.formulas.filter((f) => f.key !== key),
      boards: s.boards.map((b) => ({ ...b, keys: b.keys.filter((k) => k !== key) })),
    }))
  },
  updateInstrument(key: string, patch: Partial<Instrument>) {
    update((s) => ({ ...s, instruments: s.instruments.map((i) => (i.key === key ? { ...i, ...patch, key: i.key } : i)) }))
  },
  /** [originalKey]: düzenlenen formülün eski anahtarı; değiştiyse panolar da güncellenir. */
  upsertFormula(f: Formula, originalKey?: string, needed: Instrument[] = []) {
    update((s) => {
      const instruments = [...s.instruments]
      for (const n of needed) if (!instruments.some((i) => i.key === n.key)) instruments.push(n)
      const formulas = [...s.formulas]
      const i = originalKey ? formulas.findIndex((x) => x.key === originalKey) : -1
      if (i >= 0) formulas[i] = f
      else formulas.push(f)
      const boards = originalKey && originalKey !== f.key
        ? s.boards.map((b) => ({ ...b, keys: b.keys.map((k) => (k === originalKey ? f.key : k)) }))
        : s.boards
      return { ...s, instruments, formulas, boards }
    })
    if (needed.length) void refreshQuotesSoon()
  },
  reorderGroup(groupId: string, keys: string[]) {
    update((s) => {
      if (groupId === 'formulas') return { ...s, formulas: reorderSubset(s.formulas, keys, (f) => f.key) }
      if (groupId === 'screens') return { ...s, screens: reorderSubset(s.screens, keys, (x) => x.id) }
      return { ...s, instruments: reorderSubset(s.instruments, keys, (i) => i.key) }
    })
  },
  moveToCategory(key: string, category: Category) {
    update((s) => ({ ...s, instruments: s.instruments.map((i) => (i.key === key ? { ...i, category } : i)) }))
  },

  // --- dinamik listeler
  upsertScreen(screen: Screen) {
    update((s) => {
      const list = [...s.screens]
      const i = list.findIndex((x) => x.id === screen.id)
      if (i >= 0) list[i] = screen
      else list.push(screen)
      return { ...s, screens: list }
    })
    void refreshScreen(screen.id)
  },
  deleteScreen(id: string) {
    update((s) => ({
      ...s,
      screens: s.screens.filter((x) => x.id !== id),
      boards: s.boards.map((b) => ({ ...b, keys: b.keys.filter((k) => !(isScreenEntry(k) && screenIdOf(k) === id)) }))
        .filter((b) => b.keys.length > 0),
    }))
    const { [id]: _, ...rest } = live.screenResults
    write(SCREENS_KEY, rest)
    setLive({ screenResults: rest })
  },

  // --- panolar
  upsertBoard(board: Board) {
    update((s) => {
      const list = [...s.boards]
      const i = list.findIndex((b) => b.id === board.id)
      if (i >= 0) list[i] = board
      else list.push(board)
      return { ...s, boards: list }
    })
  },
  deleteBoard(id: string) {
    update((s) => ({ ...s, boards: s.boards.filter((b) => b.id !== id) }))
  },
  setBoards(boards: Board[]) {
    update((s) => ({ ...s, boards }))
  },

  // --- ayarlar
  setSettings(patch: Partial<Settings>) {
    update((s) => ({ ...s, settings: { ...s.settings, ...patch } }))
  },
  /** Geri al: önceki listelerin bir kısmını geri yükler. */
  restore(patch: Partial<Pick<AppState, 'instruments' | 'formulas' | 'boards' | 'screens'>>) {
    update((s) => ({ ...s, ...patch }))
  },
  setWelcomed() {
    update((s) => ({ ...s, welcomed: true }))
  },
  /** Sembolleri ve formülleri hazır listeye döndürür; dinamik listeler ve panolar korunur, eksik hazırlar geri gelir. */
  resetList() {
    update((s) => {
      const screens = [...s.screens, ...defaultScreens().filter((d) => !s.screens.some((x) => x.id === d.id))]
      return { ...s, instruments: defaultInstruments(), formulas: defaultFormulas(), screens }
    })
    void refreshQuotesSoon()
  },
  resetAll() {
    setState(defaultState())
    live = { ...live, quotes: {}, screenResults: {} }
    write(QUOTES_KEY, {})
    write(SCREENS_KEY, {})
    void refreshQuotesSoon()
  },
  importState(raw: unknown): { ok: true; summary: string } | { ok: false; error: string } {
    const parsed = fromImport(raw)
    if (!parsed) return { ok: false, error: 'Dosya tanınmadı. Piyasa’dan dışa aktarılmış bir .json dosyası seçin.' }
    setState(parsed)
    void refreshQuotesSoon()
    return { ok: true, summary: `${parsed.instruments.length} sembol, ${parsed.formulas.length} formül, ${parsed.screens.length} dinamik liste, ${parsed.boards.length} pano` }
  },
}

let soon: ReturnType<typeof setTimeout> | null = null
function refreshQuotesSoon() {
  if (soon) clearTimeout(soon)
  soon = setTimeout(() => { soon = null; void refreshQuotes() }, 150)
}

export function exportState(): string {
  return JSON.stringify({ app: 'piyasa', format: STATE_VERSION, exported: new Date().toISOString(), state }, null, 2)
}

/** Web dışa aktarımı ya da Android uygulamasının durum dosyası. */
export function fromImport(raw: unknown): AppState | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const o = raw as Record<string, unknown>
  if (o.app === 'piyasa' && o.state) return sanitize(o.state)
  // Android AppState: instruments[{source, tvSymbol…}], formulas, screens, widgets{id: WidgetConfig}
  if (Array.isArray(o.instruments) && Array.isArray(o.formulas)) {
    const instruments: Instrument[] = (o.instruments as Record<string, unknown>[])
      .map((i): Instrument | undefined => {
        const symbol = (i.tvSymbol as string) || (i.source === 'TRADINGVIEW' ? (i.symbol as string) : '')
        const known = CATALOG.find((c) => c.key === i.key)
        if (!symbol && !known) return undefined
        return {
          key: String(i.key), name: String(i.name ?? i.key), symbol: (symbol || known!.symbol).toUpperCase(),
          category: (i.category as Category) ?? 'WORLD', decimals: Number(i.decimals ?? 2),
          prefix: String(i.prefix ?? ''), suffix: String(i.suffix ?? ''), note: (i.note as string | undefined) ?? undefined,
        }
      })
      .filter((i): i is Instrument => !!i)
    const widgets = (o.widgets ?? {}) as Record<string, { title?: string; keys?: string[]; screenRows?: number; showSubtitle?: boolean; textScale?: number }>
    const boards = Object.values(widgets).map((w, n) => defaultBoard({
      id: 'b_android_' + n, title: w.title ?? 'Pano', keys: w.keys ?? [], screenRows: w.screenRows ?? 5,
      showSubtitle: !!w.showSubtitle, textScale: w.textScale ?? 1,
    }))
    return sanitize({
      instruments,
      formulas: o.formulas,
      screens: Array.isArray(o.screens) ? o.screens : undefined,
      boards: boards.length ? boards : undefined,
    })
  }
  return undefined
}
