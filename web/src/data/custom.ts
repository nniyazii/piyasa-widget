/** Kullanıcının tanımladığı olaylar (yerel depolama). */
import { useSyncExternalStore } from 'react'
import { sanitizeCustom, type CustomSpec } from '../core/study'

const KEY = 'piyasa.olaylar.v1'
let list: CustomSpec[] = (() => { try { return sanitizeCustom(JSON.parse(localStorage.getItem(KEY) ?? '[]')) } catch { return [] } })()
const listeners = new Set<() => void>()
const save = (next: CustomSpec[]) => { list = next; try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* depolama kapalı */ }; listeners.forEach((l) => l()) }
export const useCustomEvents = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => list)
export const getCustomEvents = () => list
export const customActions = {
  add(s: Omit<CustomSpec, 'id'>): CustomSpec { const spec = { ...s, id: Math.random().toString(36).slice(2, 10) }; save([spec, ...list].slice(0, 20)); return spec },
  remove(id: string) { save(list.filter((x) => x.id !== id)) },
}
