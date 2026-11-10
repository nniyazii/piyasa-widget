/** Türkçe sayı biçimleri: 6.524,16 ₺ · $4.046,10 · %29,77 · −%0,80 · +0,50 p */

const cache = new Map<number, Intl.NumberFormat>()

function nf(decimals: number) {
  const d = Math.min(8, Math.max(0, Math.trunc(decimals)))
  let f = cache.get(d)
  if (!f) {
    f = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: true })
    cache.set(d, f)
  }
  return f
}

const MINUS = '−'

/** Gruplu sayı; eksi işareti tipografik (−). */
export function number(v: number, decimals: number): string {
  const s = nf(decimals).format(Math.abs(v))
  // −0,00 yazılmasın
  return (v < 0 && /[1-9]/.test(s) ? MINUS : '') + s
}

export function value(v: number, decimals: number, prefix = '', suffix = ''): string {
  // Türkçede yüzde işareti sayıdan önce: %29,77 · −%2,50
  if (suffix === '%') return (v < 0 ? MINUS : '') + '%' + number(Math.abs(v), decimals)
  if (prefix && v < 0) return MINUS + prefix + number(Math.abs(v), decimals) + (suffix ? ' ' + suffix : '')
  return prefix + number(v, decimals) + (suffix ? ' ' + suffix : '')
}

const sign = (v: number) => (v > 0.005 ? '+' : v < -0.005 ? MINUS : '')

/** "+%1,23" / "−%0,45" */
export function change(pct: number | undefined | null): string {
  if (pct == null || !Number.isFinite(pct)) return '—'
  return sign(pct) + '%' + number(Math.abs(pct), 2)
}

/** Puan farkı: "+0,50 p" */
export function points(diff: number | undefined | null): string {
  if (diff == null || !Number.isFinite(diff)) return '—'
  return sign(diff) + number(Math.abs(diff), 2) + ' p'
}

export interface Change {
  value?: number
  text: string
  /** 1 yükseliş, -1 düşüş, 0 yatay/bilinmiyor */
  dir: -1 | 0 | 1
  unit: 'pct' | 'points'
}

/**
 * Günlük değişim. Fiyatlarda yüzde; birimi % olan oranlarda (faiz, enflasyon, prim)
 * yüzdenin yüzdesi yanıltıcı olduğundan puan farkı.
 */
export function changeFor(v: number | undefined, prev: number | undefined, suffix: string): Change {
  if (v == null || prev == null) return { text: '—', dir: 0, unit: 'pct' }
  if (suffix === '%') {
    const d = v - prev
    return { value: d, text: points(d), dir: d > 0.005 ? 1 : d < -0.005 ? -1 : 0, unit: 'points' }
  }
  if (prev === 0) return { text: '—', dir: 0, unit: 'pct' }
  const pct = (v / prev - 1) * 100
  return { value: pct, text: change(pct), dir: pct > 0.005 ? 1 : pct < -0.005 ? -1 : 0, unit: 'pct' }
}

/** Büyük tutarlar kısa: 5 mlr · 1,2 trn · 800 mn */
export function money(v: number): string {
  const a = Math.abs(v)
  const n = (x: number) => number(x, x % 1 === 0 || Math.abs(x) >= 100 ? 0 : 1)
  if (a >= 1e12) return n(v / 1e12) + ' trn'
  if (a >= 1e9) return n(v / 1e9) + ' mlr'
  if (a >= 1e6) return n(v / 1e6) + ' mn'
  return n(v)
}

/** Kullanıcı girişi: "31,1" → 31.1; "1.234,5" → 1234.5. Geçersizse undefined. */
export function parseInput(input: string): number | undefined {
  let s = input.trim().replace(/\s/g, '').replace('−', '-')
  if (!s) return undefined
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(',', '.')
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return undefined
  return Number(s)
}

const timeFmt = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' })
const dateTimeFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export const time = (ms: number) => timeFmt.format(ms)
export const dateTime = (ms: number) => dateTimeFmt.format(ms)

/** "az önce", "3 dk önce", "14:02" */
export function ago(ms: number, now = Date.now()): string {
  const s = Math.round((now - ms) / 1000)
  if (s < 45) return 'az önce'
  if (s < 3600) return `${Math.round(s / 60)} dk önce`
  return time(ms)
}

/** "THYAO" gibi kodlar için sembolün borsasız hali. */
export const ticker = (symbol: string) => symbol.split(':').pop() ?? symbol
