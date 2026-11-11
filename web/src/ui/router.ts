import { useSyncExternalStore } from 'react'

/**
 * Karma (hash) yönlendirme: her statik barındırmada çalışır, sunucu yapılandırması gerekmez.
 *   #/                 Piyasalar (liste)        #/?s=USDTRY   seçili satır
 *   #/panolar          Panolar                  #/pano/:id     tam ekran pano
 *   #/listeler         Dinamik listeler         #/listeler/:id liste sonucu
 *   #/sozluk           Terimler sözlüğü         #/sozluk/:id   terime git
 *   #/ayarlar          Ayarlar
 */
export interface Route { path: string[]; query: URLSearchParams }

function parse(): Route {
  const h = location.hash.replace(/^#\/?/, '')
  const [p, q = ''] = h.split('?')
  return { path: p.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q) }
}

let current = parse()
const listeners = new Set<() => void>()
window.addEventListener('hashchange', () => {
  current = parse()
  listeners.forEach((l) => l())
})

export function useRoute(): Route {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => current)
}

export function href(path: string, query?: Record<string, string | undefined>) {
  const q = query ? Object.entries(query).filter(([, v]) => v != null && v !== '') : []
  return '#/' + path.replace(/^\//, '') + (q.length ? '?' + new URLSearchParams(q as [string, string][]).toString() : '')
}

export function navigate(path: string, query?: Record<string, string | undefined>, replace = false) {
  const h = href(path, query)
  if (replace) history.replaceState(null, '', h)
  else history.pushState(null, '', h)
  current = parse()
  listeners.forEach((l) => l())
}

/** Seçili satırı adreste tutar (paylaşılabilir, geri tuşu kapatır). */
export function setQuery(key: string, value: string | undefined, replace = false) {
  const q = new URLSearchParams(current.query)
  if (value == null) q.delete(key)
  else q.set(key, value)
  navigate(current.path.join('/'), Object.fromEntries(q), replace)
}
