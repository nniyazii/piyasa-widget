import { useEffect, useMemo, useState } from 'react'
import * as Fmt from '../core/format'
import { orderedVariables, parse, tokenize, CONSTANTS } from '../core/formula'
import { CATEGORIES, type Category, type Instrument } from '../core/models'
import { isExactSpread, symbolFor } from '../core/tradingview'
import { actions, getState, useApp, useLive } from '../data/store'
import { Icon } from '../ui/Icon'
import { ChangeBadge, FN_LABELS, Price, rangeOf, useItems } from '../ui/market'
import { Dialog, MoreButton, useToast, type MenuItem } from '../ui/overlay'
import { setQuery } from '../ui/router'

export function Detail({ itemKey, onEditFormula }: { itemKey: string; onEditFormula: (k: string) => void }) {
  const state = useApp()
  const live = useLive()
  const items = useItems(state, live)
  const it = items.get(itemKey)
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const close = () => setQuery('s', undefined)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.dialog, .menu')) close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!it) {
    return (
      <aside className="detail" aria-label="Ayrıntı">
        <div className="detail-head"><div className="titles"><h2>Bulunamadı</h2></div>
          <button className="icon-btn" onClick={close} aria-label="Kapat"><Icon name="close" /></button></div>
        <p className="note">Bu satır listeden kaldırılmış olabilir.</p>
      </aside>
    )
  }

  const ins = state.instruments.find((i) => i.key === itemKey)
  const formula = state.formulas.find((f) => f.key === itemKey)
  const q = it.quote
  const symbol = symbolFor(state, itemKey)
  const exact = isExactSpread(state, itemKey)
  const fmt = (v?: number) => (v == null ? '—' : Fmt.value(v, it.decimals, it.prefix, it.suffix === '%' ? '' : it.suffix))

  const remove = () => {
    const before = getState()
    actions.removeKey(itemKey)
    close()
    toast(`${it.title} kaldırıldı`, { label: 'Geri al', run: () => actions.restore({ instruments: before.instruments, formulas: before.formulas, boards: before.boards }) })
  }
  const boardItems: MenuItem[] = state.boards.filter((b) => !b.keys.includes(itemKey)).map((b) => ({
    label: b.title, icon: 'boards',
    onSelect: () => { actions.upsertBoard({ ...b, keys: [...b.keys, itemKey] }); toast(`“${b.title}” panosuna eklendi`) },
  }))

  return (
    <aside className="detail" aria-label={`${it.title} ayrıntısı`}>
      <div className="detail-head">
        <div className="titles">
          <h2>{it.isFormula && <span className="fx-mark" style={{ marginRight: 8, verticalAlign: 3 }}>ƒ</span>}{it.title}</h2>
          <div className="symbol">{ins ? ins.symbol + (ins.note ? `, ${ins.note}` : '') : 'Hesaplama, ' + it.key}</div>
        </div>
        <MoreButton label="Diğer işlemler" items={[
          ...(ins ? [{ label: 'Adı ve biçimi düzenle', icon: 'edit', onSelect: () => setEditing(true) }] : []),
          ...(formula ? [{ label: 'Formülü düzenle', icon: 'edit', onSelect: () => onEditFormula(itemKey) }] : []),
          ...(boardItems.length ? [{ label: '', divider: true }, { label: 'Panoya ekle', heading: true }, ...boardItems] : []),
          { label: '', divider: true },
          { label: formula ? 'Formülü sil' : 'Listeden kaldır', icon: 'trash', danger: true, onSelect: remove },
        ]} />
        <button className="icon-btn" onClick={close} aria-label="Kapat"><Icon name="close" /></button>
      </div>

      <div className="big-price"><Price text={it.valueText} value={it.value} /></div>
      <div className="big-change">
        <ChangeBadge change={it.change} />
        <span>{it.change.unit === 'points' ? 'günlük puan farkı' : 'bugün'}</span>
        {q?.delayed && <span className="delayed">15 dk gecikmeli</span>}
      </div>
      {it.error && <p className="note" style={{ color: 'var(--down)' }}>{it.error}</p>}

      {q && rangeOf(q) && <WideRange low={q.low!} high={q.high!} open={q.open} price={q.price} fmt={fmt} />}

      {ins && q && (
        <div className="facts">
          <div className="fact"><span>Önceki kapanış</span><span className="num">{fmt(q.prevClose)}</span></div>
          <div className="fact"><span>Açılış</span><span className="num">{fmt(q.open)}</span></div>
          <div className="fact"><span>Gün içi düşük</span><span className="num">{fmt(q.low)}</span></div>
          <div className="fact"><span>Gün içi yüksek</span><span className="num">{fmt(q.high)}</span></div>
        </div>
      )}

      {formula && <FormulaBreakdown expression={formula.expression} />}

      {symbol && <Chart symbol={symbol} label={it.title} />}
      {formula && symbol && !exact && (
        <p className="note">Grafik formüldeki ilk sembolü gösteriyor; TradingView bu formüldeki fonksiyonları çizemiyor.</p>
      )}
      {formula && symbol && exact && <p className="note">Grafik, formülün TradingView karşılığı: {symbol}</p>}

      <div className="detail-actions">
        {it.url && <a className="btn" href={it.url} target="_blank" rel="noreferrer"><Icon name="external" />TradingView’da aç</a>}
        {formula && <button className="btn" onClick={() => onEditFormula(itemKey)}><Icon name="edit" />Formülü düzenle</button>}
      </div>
      {editing && ins && <InstrumentEditor ins={ins} onClose={() => setEditing(false)} />}
    </aside>
  )
}

function WideRange({ low, high, open, price, fmt }: { low: number; high: number; open?: number; price: number; fmt: (v?: number) => string }) {
  const w = high - low
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - low) / w) * 100))}%`
  return (
    <div className="range-wide" aria-label={`Gün içi aralık ${fmt(low)} ile ${fmt(high)} arası`}>
      <div className="bar">
        <span className="track" />
        {open != null && <span className="open" style={{ left: pos(open) }} title={`Açılış ${fmt(open)}`} />}
        <span className="now" style={{ left: pos(price) }} />
      </div>
      <div className="labels num"><span>{fmt(low)}</span><span>gün içi aralık</span><span>{fmt(high)}</span></div>
    </div>
  )
}

/** Formülün girdileri: her değişkenin güncel değeri ve günlük değişimi. */
function FormulaBreakdown({ expression }: { expression: string }) {
  const state = useApp()
  const live = useLive()
  const items = useItems(state, live)
  const vars = useMemo(() => {
    try { return [...new Set(orderedVariables(parse(expression)))] } catch { return [] }
  }, [expression])
  const tokens = tokenize(expression)
  return (
    <>
      <div className="expr" aria-label="Formül">
        {tokens.map((t, i) => {
          const op = ['*', '/', '+', '-', '^', '(', ')', ';'].includes(t)
          const label = t === '*' ? '×' : t === '/' ? '÷' : t === '-' ? '−' : t.endsWith('(') ? FN_LABELS[t] ?? t
            : /^[\d.]/.test(t) ? t.replace('.', ',') : items.get(t)?.title ?? t
          return <span key={i} className={op ? 'op' : undefined}>{label}{' '}</span>
        })}
      </div>
      <ul className="breakdown">
        {vars.map((v) => {
          if (v in CONSTANTS) return <li key={v}><span>{v === 'OZ' ? 'OZ (1 troy ons, gram)' : v}</span><span className="num">{Fmt.number(CONSTANTS[v], 7)}</span></li>
          const it = items.get(v)
          return (
            <li key={v}>
              <span>{it?.title ?? v}</span>
              <span className="num">{it?.valueText ?? 'tanımsız'} <span style={{ color: 'var(--ink-3)', marginLeft: 6 }}>{it?.change.text}</span></span>
            </li>
          )
        })}
      </ul>
    </>
  )
}

/** TradingView'un resmi gömülü grafiği (yalnızca grafik; fiyat başlığını biz gösteriyoruz). */
function Chart({ symbol, label }: { symbol: string; label: string }) {
  const theme = useEffectiveTheme()
  const [loaded, setLoaded] = useState(false)
  // Formüller (spread: A*B/C) TradingView'da yalnızca günlük ve üstü aralıkta çizilir
  const spread = /[*/+\-()]/.test(symbol.replace(/^-/, ''))
  const src = useMemo(() => {
    const dark = theme === 'dark'
    const cfg = {
      symbols: [[label, `${symbol}|${spread ? '3M' : '1M'}`]],
      chartOnly: true, width: '100%', height: '100%', locale: 'tr', colorTheme: theme, autosize: true,
      showVolume: false, showMA: false, hideDateRanges: false, hideMarketStatus: true, hideSymbolLogo: true,
      scalePosition: 'right', scaleMode: 'Normal', fontFamily: 'Archivo, system-ui, sans-serif', fontSize: '10',
      noTimeScale: false, valuesTracking: '1', changeMode: 'price-and-percent', chartType: 'area', lineWidth: 2, lineType: 0,
      dateRanges: spread ? ['1m|1D', '3m|1D', '12m|1D', '60m|1W', 'all|1M'] : ['1d|15', '1m|30', '3m|60', '12m|1D', '60m|1W', 'all|1M'],
      isTransparent: false,
      backgroundColor: dark ? '#1c2127' : '#ffffff',
      gridLineColor: dark ? 'rgba(232,235,238,0.06)' : 'rgba(26,30,35,0.06)',
      lineColor: dark ? '#e8ebee' : '#1a1e23',
      topColor: dark ? 'rgba(232,235,238,0.14)' : 'rgba(26,30,35,0.10)',
      bottomColor: 'rgba(0,0,0,0)',
    }
    return 'https://www.tradingview-widget.com/embed-widget/symbol-overview/?locale=tr#' + encodeURIComponent(JSON.stringify(cfg))
  }, [symbol, label, theme, spread])
  useEffect(() => setLoaded(false), [src])
  return (
    <div className="chart">
      {!loaded && <div className="chart-msg">Grafik yükleniyor…</div>}
      <iframe key={src} title={`${label} grafiği (TradingView)`} src={src} loading="lazy" onLoad={() => setLoaded(true)}
        referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-popups" />
    </div>
  )
}

export function useEffectiveTheme(): 'light' | 'dark' {
  const theme = useApp().settings.theme
  const [sys, setSys] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const m = matchMedia('(prefers-color-scheme: dark)')
    const on = () => setSys(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return theme === 'system' ? (sys ? 'dark' : 'light') : theme
}

function InstrumentEditor({ ins, onClose }: { ins: Instrument; onClose: () => void }) {
  const [name, setName] = useState(ins.name)
  const [decimals, setDecimals] = useState(ins.decimals)
  const [unit, setUnit] = useState(ins.prefix ? 'p:' + ins.prefix : ins.suffix ? 's:' + ins.suffix : '')
  const [category, setCategory] = useState<Category>(ins.category)
  const save = () => {
    const prefix = unit.startsWith('p:') ? unit.slice(2) : ''
    const suffix = unit.startsWith('s:') ? unit.slice(2) : ''
    actions.updateInstrument(ins.key, { name: name.trim() || ins.name, decimals, prefix, suffix, category })
    onClose()
  }
  return (
    <Dialog title="Adı ve biçimi düzenle" size="small" onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Vazgeç</button><button className="btn primary" onClick={save}>Kaydet</button></>}>
      <div className="dialog-body">
        <div className="field"><label htmlFor="in-name">Ad</label><input id="in-name" className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} /></div>
        <div className="field"><span className="label">Birim</span>
          <div className="chips">
            {[['', 'Yok'], ['s:₺', '₺'], ['p:$', '$'], ['p:€', '€'], ['s:%', '%']].map(([v, l]) => (
              <button key={v} className="chip" aria-pressed={unit === v} onClick={() => setUnit(v)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="field"><span className="label">Ondalık basamak</span>
          <div className="chips">{[0, 1, 2, 3, 4].map((d) => <button key={d} className="chip" aria-pressed={decimals === d} onClick={() => setDecimals(d)}>{d}</button>)}</div>
        </div>
        <div className="field"><label htmlFor="in-cat">Grup</label>
          <select id="in-cat" className="select" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <p className="note">Formüllerde kullanılan kod: <b>{ins.key}</b> (değişmez).</p>
      </div>
    </Dialog>
  )
}
