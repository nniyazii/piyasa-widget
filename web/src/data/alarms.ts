/**
 * Alarm deposu, uygulama açıkken kontrol ve merkezi eşitleme.
 *   Yerel      localStorage; uygulama açıkken dakikada bir kontrol, tarayıcı bildirimi.
 *   Merkezi    GitHub deposunun "alarms" dalındaki alarms.json (kişisel erişim anahtarıyla yazılır).
 *              GitHub Actions 10 dakikada bir kontrol eder; çalan alarm için depoda bir kayıt açar,
 *              GitHub da bunu e-posta ve mobil bildirim olarak iletir. Sonuçlar "alarms-state" dalındadır.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { checkAlarms, newId, sanitizeAlarms, type Alarm, type Fired, type Source, type States } from '../core/alarms'
import { analyze, type Analysis } from '../core/signals'
import { loadBars, withLive } from './bars'
import { getPremiums, refreshPremiums } from './premium'
import { scan } from './tv'

declare const __REPO__: string
export const REPO = __REPO__
const KEY = 'piyasa.alarms.v1'
const TOKEN_KEY = 'piyasa.github.token'
const API = `https://api.github.com/repos/${REPO}`

export interface LogEntry { t: number; title: string; text: string }
export interface ServerState { checked: number; states: States; log: LogEntry[] }
export type SyncStatus = 'off' | 'ok' | 'syncing' | 'error'
export interface AlarmStore {
  alarms: Alarm[]; states: States; log: LogEntry[]
  /** Alarm listesinin son değiştiği an (eşitlemede hangisi yeni) */
  updated: number
  checked: number
  sync: SyncStatus; syncError?: string
  server?: ServerState
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
function load(): AlarmStore {
  const empty: AlarmStore = { alarms: [], states: {}, log: [], updated: 0, checked: 0, sync: 'off' }
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (!raw) return empty
    return { ...empty, alarms: sanitizeAlarms(raw.alarms), states: raw.states ?? {}, log: Array.isArray(raw.log) ? raw.log.slice(0, 30) : [], updated: num(raw.updated) ?? 0 }
  } catch { return empty }
}
let store = load()
const listeners = new Set<() => void>()
function set(p: Partial<AlarmStore>, persist = true) {
  store = { ...store, ...p }
  if (persist) try { localStorage.setItem(KEY, JSON.stringify({ alarms: store.alarms, states: store.states, log: store.log, updated: store.updated })) } catch { /* depolama kapalı */ }
  listeners.forEach((l) => l())
}
export const useAlarms = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => store)
export const getAlarms = () => store

// ------------------------------------------------------------------ merkezi eşitleme (GitHub)

export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) ?? '' } catch { return '' } }
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
const unb64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, '')), (c) => c.charCodeAt(0)))
const gh = (path: string, init: RequestInit = {}) => fetch(API + path, { ...init, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${getToken()}`, 'X-GitHub-Api-Version': '2022-11-28', ...(init.headers ?? {}) }, cache: 'no-store' })

async function remoteRead(): Promise<{ alarms: Alarm[]; updated: number; sha?: string }> {
  const r = await gh('/contents/alarms.json?ref=alarms')
  if (r.status === 404) return { alarms: [], updated: 0 }
  if (r.status === 401 || r.status === 403) throw new Error('Anahtar geçersiz ya da bu depoya yazma izni yok')
  if (!r.ok) throw new Error(`GitHub yanıt vermedi (${r.status})`)
  const j = (await r.json()) as { content: string; sha: string }
  const body = JSON.parse(unb64(j.content)) as { alarms?: unknown; updated?: number }
  return { alarms: sanitizeAlarms(body.alarms), updated: num(body.updated) ?? 0, sha: j.sha }
}

async function ensureBranch() {
  const r = await gh('/git/ref/heads/alarms')
  if (r.ok) return
  const main = await gh('/git/ref/heads/main')
  if (!main.ok) throw new Error('Depoya erişilemedi; anahtarın bu depo için verildiğinden emin ol')
  const sha = ((await main.json()) as { object: { sha: string } }).object.sha
  const c = await gh('/git/refs', { method: 'POST', body: JSON.stringify({ ref: 'refs/heads/alarms', sha }) })
  if (!c.ok && c.status !== 422) throw new Error('Alarm dalı oluşturulamadı; anahtara "Contents: Read and write" izni ver')
}

async function remoteWrite(sha?: string) {
  const content = b64(JSON.stringify({ updated: store.updated, alarms: store.alarms }, null, 1))
  const r = await gh('/contents/alarms.json', { method: 'PUT', body: JSON.stringify({ message: 'Alarmlar', branch: 'alarms', content, ...(sha ? { sha } : {}) }) })
  if (r.status === 404 || r.status === 422) {
    // Dal yok ya da dosya başka cihazdan değişti: bir kez toparla ve yeniden dene
    await ensureBranch()
    const again = await remoteRead()
    const r2 = await gh('/contents/alarms.json', { method: 'PUT', body: JSON.stringify({ message: 'Alarmlar', branch: 'alarms', content, ...(again.sha ? { sha: again.sha } : {}) }) })
    if (!r2.ok) throw new Error(r2.status === 403 ? 'Anahtarın yazma izni yok ("Contents: Read and write" gerekli)' : `Kaydedilemedi (${r2.status})`)
  } else if (!r.ok) throw new Error(r.status === 403 ? 'Anahtarın yazma izni yok ("Contents: Read and write" gerekli)' : `Kaydedilemedi (${r.status})`)
}

let syncing: Promise<void> | undefined
/** İki yönlü eşitle: hangisi daha yeni ise o geçerli. */
export function syncAlarms(): Promise<void> {
  if (!getToken()) { set({ sync: 'off', syncError: undefined }, false); return Promise.resolve() }
  syncing ??= (async () => {
    set({ sync: 'syncing' }, false)
    try {
      const remote = await remoteRead()
      if (remote.updated > store.updated) set({ alarms: remote.alarms, updated: remote.updated })
      else if (store.updated > remote.updated || !remote.sha) await remoteWrite(remote.sha)
      set({ sync: 'ok', syncError: undefined }, false)
    } catch (e) { set({ sync: 'error', syncError: (e as Error).message }, false) }
    syncing = undefined
  })()
  return syncing
}

export async function setToken(token: string): Promise<void> {
  try { if (token) localStorage.setItem(TOKEN_KEY, token.trim()); else localStorage.removeItem(TOKEN_KEY) } catch { /* depolama kapalı */ }
  await syncAlarms()
}

/** Sunucudaki son kontrolün sonucu (herkese açık dosya; anahtar gerekmez) */
export async function loadServerState(): Promise<void> {
  try {
    const r = await fetch(`https://raw.githubusercontent.com/${REPO}/alarms-state/state.json`, { cache: 'no-store' })
    if (!r.ok) return
    const j = (await r.json()) as ServerState
    if (num(j.checked)) set({ server: { checked: j.checked, states: j.states ?? {}, log: Array.isArray(j.log) ? j.log.slice(0, 30) : [] } }, false)
  } catch { /* henüz yok */ }
}

// ------------------------------------------------------------------ işlemler

const changed = (alarms: Alarm[], states = store.states) => { set({ alarms, states, updated: Date.now() }); void syncAlarms() }
type NewAlarm = Alarm extends infer A ? (A extends Alarm ? Omit<A, 'id' | 'created'> : never) : never
export const alarmActions = {
  add(a: NewAlarm): Alarm {
    const alarm = { ...a, id: newId(), created: Date.now() } as Alarm
    changed([alarm, ...store.alarms].slice(0, 50))
    void runAlarmCheck(true)
    return alarm
  },
  remove(id: string) { const { [id]: _, ...rest } = store.states; changed(store.alarms.filter((a) => a.id !== id), rest) },
  /** Çalıp kapanmış alarmı yeniden kur */
  rearm(id: string) {
    const a = store.alarms.find((x) => x.id === id)
    if (!a) return
    const { [id]: _, ...rest } = store.states
    // Sunucu da yeniden kursun diye yeni kimlik verilir
    changed(store.alarms.map((x) => (x.id === id ? { ...x, id: newId(), created: Date.now() } : x)), rest)
  },
}

// ------------------------------------------------------------------ uygulama açıkken kontrol

const analysisCache = new Map<string, { t: number; a?: Analysis }>()
const clientSource: Source = {
  async prices(symbols) {
    const rows = await scan('global', { symbols: { tickers: symbols }, columns: ['close'] })
    return new Map(rows.flatMap((r) => (typeof r.d[0] === 'number' ? [[r.s.toUpperCase(), r.d[0] as number] as const] : [])))
  },
  async premiums() {
    if (Date.now() - getPremiums().time > 55_000) await refreshPremiums()
    const p = getPremiums()
    if (!p.rows.length) throw new Error('fiyatlar alınamadı')
    return { rows: p.rows, advices: [...p.advices, ...p.money], open: p.open }
  },
  async analysis(symbol) {
    // Geçmiş veri ağırdır: sembol başına 10 dakikada bir
    const hit = analysisCache.get(symbol)
    if (hit && Date.now() - hit.t < 10 * 60_000) return hit.a
    const [data, live] = await Promise.all([
      loadBars(symbol),
      scan('global', { symbols: { tickers: [symbol] }, columns: ['close'] }).then((r) => (typeof r[0]?.d[0] === 'number' ? (r[0].d[0] as number) : undefined)).catch(() => undefined),
    ])
    const a = data ? analyze(data.source === 'snapshot' ? withLive(data.frames, live) : data.frames) : undefined
    analysisCache.set(symbol, { t: Date.now(), a })
    return a
  },
}

let running = false
let onFired: ((f: Fired) => void) | undefined
export async function runAlarmCheck(force = false): Promise<void> {
  if (running || !store.alarms.length) return
  if (!force && Date.now() - store.checked < 55_000) return
  running = true
  try {
    const { states, fired } = await checkAlarms(store.alarms, store.states, clientSource)
    const log = [...fired.map((f) => ({ t: Date.now(), title: f.title, text: f.text })), ...store.log].slice(0, 30)
    set({ states, log, checked: Date.now() })
    for (const f of fired) { notify(f); onFired?.(f) }
  } finally { running = false }
}

export const notifyPermission = (): NotificationPermission | 'unsupported' => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
export async function askNotifyPermission() {
  if (typeof Notification === 'undefined') return 'unsupported' as const
  const p = await Notification.requestPermission()
  listeners.forEach((l) => l())
  return p
}
function notify(f: Fired) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    const opts = { body: f.text, tag: 'piyasa-' + f.alarm.id, icon: 'icon-192.png' }
    // Telefonda bildirim yalnızca servis çalışanı üzerinden gösterilebilir
    if (navigator.serviceWorker?.controller) void navigator.serviceWorker.ready.then((r) => r.showNotification(f.title, opts))
    else new Notification(f.title, opts)
  } catch { /* bildirim gösterilemedi */ }
}

/** Uygulama açık olduğu sürece alarmları dakikada bir kontrol eder. */
export function useAlarmRunner(toast: (text: string) => void) {
  useEffect(() => {
    onFired = (f) => toast('Alarm: ' + f.title)
    void syncAlarms().then(() => runAlarmCheck())
    const t = setInterval(() => { if (document.visibilityState === 'visible') void runAlarmCheck() }, 60_000)
    return () => { clearInterval(t); onFired = undefined }
  }, [])
}
