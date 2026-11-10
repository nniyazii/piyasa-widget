import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

// ------------------------------------------------------------------ menü

export interface MenuItem {
  label: string
  onSelect?: () => void
  href?: string
  danger?: boolean
  icon?: string
  divider?: boolean
  heading?: boolean
  disabled?: boolean
}

/** Bir düğmeye bağlı açılır menü: klavyeyle gezilir, dışarı tıklayınca/Esc ile kapanır. */
export function Menu({ anchor, items, onClose, align = 'end' }: { anchor: HTMLElement | null; items: MenuItem[]; onClose: () => void; align?: 'start' | 'end' }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    if (!anchor || !ref.current) return
    const a = anchor.getBoundingClientRect()
    const m = ref.current.getBoundingClientRect()
    let left = align === 'end' ? a.right - m.width : a.left
    left = Math.max(8, Math.min(left, window.innerWidth - m.width - 8))
    let top = a.bottom + 6
    if (top + m.height > window.innerHeight - 8) top = Math.max(8, a.top - m.height - 6)
    setPos({ left, top })
  }, [anchor, align])
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>('button:not([disabled]), a')
    first?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); anchor?.focus() }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const all = [...(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a') ?? [])]
        const i = all.indexOf(document.activeElement as HTMLElement)
        all[(i + (e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length]?.focus()
      }
    }
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor?.contains(e.target as Node)) onClose()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('resize', onClose)
    }
  }, [anchor, onClose])
  return createPortal(
    <div ref={ref} className="menu" role="menu" style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}>
      {items.map((it, i) =>
        it.divider ? <hr key={i} /> : it.heading ? <div key={i} className="label">{it.label}</div> : it.href ? (
          <a key={i} role="menuitem" href={it.href} target="_blank" rel="noreferrer" onClick={onClose}>
            {it.icon && <Icon name={it.icon} />}{it.label}
          </a>
        ) : (
          <button key={i} role="menuitem" className={it.danger ? 'danger' : undefined} disabled={it.disabled}
            onClick={(e) => { e.stopPropagation(); onClose(); it.onSelect?.() }}>
            {it.icon && <Icon name={it.icon} />}{it.label}
          </button>
        ),
      )}
    </div>,
    document.body,
  )
}

/** "⋯" düğmesi + menüsü. */
export function MoreButton({ items, label = 'Seçenekler', small, onOpenChange }: { items: MenuItem[]; label?: string; small?: boolean; onOpenChange?: (o: boolean) => void }) {
  const [el, setEl] = useState<HTMLButtonElement | null>(null)
  const [open, setOpen] = useState(false)
  const set = (o: boolean) => { setOpen(o); onOpenChange?.(o) }
  return (
    <>
      <button ref={setEl} className={'icon-btn' + (small ? ' small' : '')} aria-label={label} aria-haspopup="menu" aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); set(!open) }} onPointerDown={(e) => e.stopPropagation()}>
        <Icon name="more" />
      </button>
      {open && <Menu anchor={el} items={items} onClose={() => set(false)} />}
    </>
  )
}

// ------------------------------------------------------------------ pencere

/** Odak tuzaklı pencere; Esc ve arka plan tıklaması kapatır. */
export function Dialog({ title, onClose, children, footer, size, className, labelledBy, head = true }: {
  title?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode
  size?: 'small' | 'large'; className?: string; labelledBy?: string; head?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const el = ref.current
    if (el && !el.contains(document.activeElement)) {
      const auto = el.querySelector<HTMLElement>('[autofocus], input, select, textarea, button')
      auto?.focus({ preventScroll: true })
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); onClose() }
      if (e.key === 'Tab' && el) {
        const f = [...el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null)
        if (!f.length) return
        const first = f[0], last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prev?.focus?.({ preventScroll: true })
    }
  }, [onClose])
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy ?? 'dlg-title'} className={['dialog', size, className].filter(Boolean).join(' ')}>
        {head && (
          <div className="dialog-head">
            <h2 id="dlg-title">{title}</h2>
            <span className="spacer" />
            <button className="icon-btn" onClick={onClose} aria-label="Kapat"><Icon name="close" /></button>
          </div>
        )}
        {children}
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </>,
    document.body,
  )
}

// ------------------------------------------------------------------ bildirim

interface Toast { id: number; msg: string; action?: { label: string; run: () => void } }
const ToastCtx = createContext<(msg: string, action?: Toast['action']) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((msg: string, action?: Toast['action']) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-2), { id, msg, action }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 6000 : 3200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span className="msg">{t.msg}</span>
            {t.action && <button onClick={() => { t.action!.run(); setToasts((x) => x.filter((y) => y.id !== t.id)) }}>{t.action.label}</button>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

// ------------------------------------------------------------------ küçük denetimler

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="switch">
      <span className="text">{label}{hint && <small>{hint}</small>}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}
