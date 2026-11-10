import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { displayItem, FormulaEngine, type DisplayItem } from '../core/engine'
import type { Change } from '../core/format'
import type { AppState, LiveData, Quote } from '../core/models'
import { getState } from '../data/store'

/**
 * Fiyat: değer değişince yalnızca değişen rakamlar kısa süre yeşil/kırmızı yanar (döviz bürosu tabelası gibi).
 * Hizalama sağdan; önceki metinle karakter karakter karşılaştırılır.
 */
export const Price = memo(function Price({ text, value, className }: { text: string; value?: number; className?: string }) {
  const prev = useRef<{ text: string; value?: number }>({ text, value })
  const [flash, setFlash] = useState<{ from: number; dir: 'up' | 'down'; key: number } | null>(null)
  useEffect(() => {
    const p = prev.current
    prev.current = { text, value }
    if (!getState().settings.tickFlash) return
    if (p.text === text || p.value == null || value == null || p.value === value || text === '—' || p.text === '—') return
    // Uzunluk değiştiyse tüm sayı; aksi halde ilk farklı karakterden sona kadar
    let from = 0
    if (p.text.length === text.length) {
      while (from < text.length && p.text[from] === text[from]) from++
    }
    setFlash({ from, dir: value > p.value ? 'up' : 'down', key: Date.now() })
  }, [text, value])
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 1150)
    return () => clearTimeout(t)
  }, [flash])
  if (!flash) return <span className={'num ' + (className ?? '')}>{text}</span>
  // Birim (₺, $) yanmasın: yanan kısım son rakamda biter
  let end = text.length
  while (end > flash.from && !/\d/.test(text[end - 1])) end--
  return (
    <span className={'num ' + (className ?? '')} aria-label={text}>
      <span aria-hidden="true">{text.slice(0, flash.from)}</span>
      <span aria-hidden="true" key={flash.key} className={'tick ' + flash.dir}>{text.slice(flash.from, end)}</span>
      <span aria-hidden="true">{text.slice(end)}</span>
    </span>
  )
})

export function ChangeBadge({ change, style = 'pill' }: { change: Change; style?: 'pill' | 'text' | 'hidden' }) {
  if (style === 'hidden') return null
  const dir = change.dir > 0 ? ' up' : change.dir < 0 ? ' down' : ''
  const label = change.text === '—' ? 'Değişim yok' : `Günlük değişim ${change.text.replace('−', 'eksi ')}`
  return <span className={'chg num' + dir + (style === 'text' ? ' text' : '')} aria-label={label}>{change.text}</span>
}

/** Gün içi aralık: çizgi = düşük–yüksek, dikey işaret = açılış, nokta = güncel. */
export function RangeBar({ quote }: { quote?: Quote }) {
  const r = rangeOf(quote)
  if (!r) return <span className="range" aria-hidden="true" />
  const { pos, open } = r
  const from = Math.min(pos, open ?? pos)
  const to = Math.max(pos, open ?? pos)
  const dir = open == null ? '' : pos > open ? ' up' : pos < open ? ' down' : ''
  return (
    <span className="range" aria-hidden="true" title="Gün içi en düşük – en yüksek">
      <span className="track" />
      <span className={'span' + dir} style={{ left: `${from * 100}%`, width: `${(to - from) * 100}%` }} />
      {open != null && <span className="open" style={{ left: `${open * 100}%` }} />}
      <span className="now" style={{ left: `${pos * 100}%` }} />
    </span>
  )
}

export function rangeOf(q?: Quote) {
  if (!q || q.low == null || q.high == null || !(q.high > q.low)) return undefined
  const clamp = (v: number) => Math.min(1, Math.max(0, v))
  const w = q.high - q.low
  return { pos: clamp((q.price - q.low) / w), open: q.open != null ? clamp((q.open - q.low) / w) : undefined }
}

/** Liste/pano satırları: formül motoru durum + fiyatlarla bir kez kurulur. */
export function useItems(state: AppState, live: LiveData) {
  return useMemo(() => {
    const ctx = { instruments: state.instruments, formulas: state.formulas, quotes: live.quotes }
    const engine = new FormulaEngine(ctx)
    const cache = new Map<string, DisplayItem | undefined>()
    return {
      ctx,
      engine,
      get(key: string) {
        if (!cache.has(key)) cache.set(key, displayItem(ctx, engine, key))
        return cache.get(key)
      },
    }
  }, [state.instruments, state.formulas, live.quotes])
}

/** "Ons Altın × Dolar/TL ÷ OZ" */
export function prettyExpression(state: Pick<AppState, 'instruments' | 'formulas'>, expression: string, tokenize: (s: string) => string[]) {
  const tokens = tokenize(expression)
  const label = (t: string) => {
    if (t === '*') return '×'
    if (t === '/') return '÷'
    if (t === '-') return '−'
    if (t === ';') return ';'
    if (/^[\d.]/.test(t)) return t.replace('.', ',')
    if (t.endsWith('(')) return FN_LABELS[t] ?? t
    return state.instruments.find((i) => i.key === t)?.name ?? state.formulas.find((f) => f.key === t)?.name ?? t
  }
  let s = ''
  tokens.forEach((t, i) => {
    const prev = tokens[i - 1]
    const glue = prev === undefined || prev === '(' || prev.endsWith('(') || t === ')' || t === ';'
    if (!glue) s += ' '
    s += label(t)
  })
  return s
}

export const FN_LABELS: Record<string, string> = {
  'pct(': '% fark(', 'chg(': 'günlük %(', 'prev(': 'önceki(', 'avg(': 'ortalama(', 'min(': 'en küçük(',
  'max(': 'en büyük(', 'round(': 'yuvarla(', 'abs(': 'mutlak(', 'sum(': 'toplam(', 'sqrt(': 'karekök(',
}
