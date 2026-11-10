/**
 * Tarayıcıda kalıcı önbellek (IndexedDB): indirilen fiyat geçmişi sekme kapansa da saklanır.
 * Kullanılamıyorsa (gizli pencere, kapalı depolama) sessizce devre dışı kalır.
 */
const DB = 'piyasa'
const STORE = 'cache'

let dbp: Promise<IDBDatabase | null> | null = null
function db(): Promise<IDBDatabase | null> {
  dbp ??= new Promise((resolve) => {
    try {
      const r = indexedDB.open(DB, 1)
      r.onupgradeneeded = () => r.result.createObjectStore(STORE)
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => resolve(null)
      r.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbp
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const d = await db()
  if (!d) return undefined
  return new Promise((resolve) => {
    try {
      const r = d.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      r.onsuccess = () => resolve(r.result as T | undefined)
      r.onerror = () => resolve(undefined)
    } catch {
      resolve(undefined)
    }
  })
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const d = await db()
  if (!d) return
  await new Promise<void>((resolve) => {
    try {
      const tx = d.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
}

/** Toplam kullanılan yer ve kayıt sayısı (Ayarlar'da gösterilir). */
export async function idbStats(): Promise<{ entries: number; bytes?: number }> {
  const d = await db()
  if (!d) return { entries: 0 }
  const entries = await new Promise<number>((resolve) => {
    try {
      const r = d.transaction(STORE, 'readonly').objectStore(STORE).count()
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => resolve(0)
    } catch {
      resolve(0)
    }
  })
  const est = await navigator.storage?.estimate?.().catch(() => undefined)
  return { entries, bytes: est?.usage }
}

export async function idbClear(): Promise<void> {
  const d = await db()
  if (!d) return
  await new Promise<void>((resolve) => {
    try {
      const tx = d.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

/** Gün damgası (UTC): aynı gün içinde sunucudan yeniden istemeye gerek yok. */
export const dayStamp = () => new Date().toISOString().slice(0, 10)
