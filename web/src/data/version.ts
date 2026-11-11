/**
 * Yeni sürüm denetimi: açık kalan sekme eski kodla yeni veriyi okuyabilir (veri yarım saatte bir yenilenir).
 * Yayındaki version.json bu yapının kimliğinden farklıysa kullanıcıya "Yenile" önerilir.
 */
import { useEffect, useState } from 'react'

declare const __BUILD__: string

export function useNewVersion(): boolean {
  const [stale, setStale] = useState(false)
  useEffect(() => {
    if (!import.meta.env.PROD) return
    let stop = false
    const check = async () => {
      if (stop || document.visibilityState !== 'visible') return
      try {
        const r = await fetch('version.json', { cache: 'no-store' })
        if (!r.ok) return
        const { build } = (await r.json()) as { build?: string }
        if (build && build !== __BUILD__) { setStale(true); stop = true }
      } catch { /* çevrimdışı: sonra yeniden */ }
    }
    const t = setInterval(check, 3 * 60_000)
    document.addEventListener('visibilitychange', check)
    return () => { stop = true; clearInterval(t); document.removeEventListener('visibilitychange', check) }
  }, [])
  return stale
}
