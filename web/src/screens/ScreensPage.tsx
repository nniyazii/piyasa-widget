import { closestCenter, DndContext, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useMemo, useRef, useState } from 'react'
import { instrumentFromHit } from '../core/catalog'
import * as Fmt from '../core/format'
import { CATEGORIES, defaultBoard, newId, screenEntry, type Category, type ScreenListSort } from '../core/models'
import {
  describe, field, FIELDS, metricText, OPS, SCREEN_TEMPLATES, SORTS, summary, units, UNIVERSES,
  type Condition, type FieldId, type Screen, type ScreenResult,
} from '../core/screener'
import { chartUrl } from '../core/tradingview'
import { useReliability, useScores } from '../data/reliability'
import { actions, allKeys, getState, refreshScreen, useApp, useLive } from '../data/store'
import { Icon } from '../ui/Icon'
import { ChangeBadge } from '../ui/market'
import { Dialog, MoreButton, Segmented, Switch, useToast } from '../ui/overlay'
import { CondChips } from '../ui/conds'
import { ReliabilityBadge } from '../ui/reliability'
import { navigate } from '../ui/router'
import { sensorsConfig } from './Watchlist'

export function ScreensIndex({ onNew }: { onNew: () => void }) {
  const state = useApp()
  const live = useLive()
  const sensors = useSensors(...sensorsConfig())
  const [order, setOrder] = useState<string[] | null>(null)
  const scoreOf = useScores()
  const sort: ScreenListSort = state.settings.screenSort ?? 'manual'
  const manualIds = order ?? state.screens.map((s) => s.id)
  // Sıralama yalnızca görünümü değiştirir; kullanıcının kendi sırası ("Sıram") saklı kalır
  const ids = sort === 'manual' ? manualIds : [...state.screens].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'tr')
    if (sort === 'matches') return (live.screenResults[b.id]?.rows.length ?? -1) - (live.screenResults[a.id]?.rows.length ?? -1)
    return (scoreOf(b)?.rel.score ?? -1) - (scoreOf(a)?.rel.score ?? -1)
  }).map((s) => s.id)
  const times = state.screens.map((s) => live.screenResults[s.id]?.time).filter((t): t is number => !!t)
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    if (sort !== 'manual') return
    const next = arrayMove(ids, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)))
    setOrder(next)
    actions.reorderGroup('screens', next)
    setTimeout(() => setOrder(null), 0)
  }
  if (!state.screens.length) {
    return (
      <div className="empty">
        <h2>Henüz dinamik liste yok</h2>
        <p>Koşulları bir kez kur, liste her yenilemede kendiliğinden güncellensin. Örneğin: F/K’sı 5 yıllık ortalamasının yarısına inen hisselerim.</p>
        <button className="btn primary" onClick={onNew}><Icon name="plus" />Dinamik liste oluştur</button>
      </div>
    )
  }
  return (
    <>
      <p className="lede">Koşullarla tanımlanan, kendiliğinden güncellenen listeler. Borsa İstanbul’u, ABD’yi ya da kendi listeni tarar; sonuçlar fiyat değiştikçe yeniden hesaplanır.</p>
      <div className="screen-tools">
        <Segmented value={sort} onChange={(screenSort) => actions.setSettings({ screenSort })} label="Sırala"
          options={[{ value: 'manual', label: 'Sıram' }, { value: 'score', label: 'Güvenilirlik' }, { value: 'matches', label: 'Eşleşme' }, { value: 'name', label: 'Ad' }]} />
        <span className="note" aria-live="polite">
          {live.scanAll ? `Taranıyor: ${live.scanAll.done} / ${live.scanAll.total}` : times.length ? `Son tarama ${Fmt.time(Math.min(...times))}` : 'Henüz taranmadı'}
          {sort === 'manual' ? '' : '. Sürükleyerek sıralamak için “Sıram”ı seç.'}
        </span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={sort !== 'manual'}>
          <ul className="screen-list">
            {ids.map((id) => {
              const s = state.screens.find((x) => x.id === id)
              return s ? <ScreenItem key={id} screen={s} result={live.screenResults[id]} running={!!live.screensRunning[id]} /> : null
            })}
          </ul>
        </SortableContext>
      </DndContext>
    </>
  )
}

function ScreenItem({ screen, result, running }: { screen: Screen; result?: ScreenResult; running: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: screen.id })
  const top = result?.rows.slice(0, 4).map((r) => r.name).join(', ')
  const rel = useReliability(screen)
  return (
    <li ref={setNodeRef} className={'screen-item' + (isDragging ? ' dragging' : '') + (running ? ' running' : '')} aria-busy={running || undefined} style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes} {...listeners} role="link" tabIndex={0}
      onClick={() => navigate(`listeler/${screen.id}`)} onKeyDown={(e) => e.key === 'Enter' && navigate(`listeler/${screen.id}`)}>
      <h3>{screen.name}{rel && <> <ReliabilityBadge entry={rel} /></>}</h3>
      <div className="cond">{screen.conditions.map(describe).join('; ')}</div>
      <div className="top">{running && !result ? 'Taranıyor…' : result?.error && !result.rows.length ? result.error : top || 'Şu an eşleşen yok'}</div>
      <div className="tally">
        <b className="num">{result ? result.rows.length : running ? '…' : '—'}</b>
        <small>{result ? 'eşleşme' : ''}</small>
      </div>
    </li>
  )
}

const pctText = (v: number) => (v >= 0 ? '+' : '−') + '%' + Fmt.number(Math.abs(v * 100), 0)
const bestPortfolio = (e: { portfolios?: { list?: number; hold1m?: number; hold3m?: number } }) => {
  const v = [e.portfolios?.list, e.portfolios?.hold1m, e.portfolios?.hold3m].filter((x): x is number => x != null)
  return v.length ? Math.max(...v) : undefined
}

export function ScreenView({ id, onEdit }: { id: string; onEdit: (s: Screen) => void }) {
  const state = useApp()
  const live = useLive()
  const toast = useToast()
  const screen = state.screens.find((s) => s.id === id)
  const result = live.screenResults[id]
  const running = !!live.screensRunning[id]
  const rel = useReliability(screen)
  const [col, setCol] = useState<{ key: 'name' | 'price' | 'change'; desc: boolean } | null>(null)
  useEffect(() => {
    if (screen && (!result || Date.now() - result.time > 5 * 60_000)) void refreshScreen(screen.id)
  }, [id])
  if (!screen) return <div className="empty"><h2>Liste bulunamadı</h2><p><a href="#/listeler">Dinamik listelere dön</a></p></div>
  const pin = () => {
    const b = defaultBoard({ id: newId('b'), title: screen.name, keys: [screenEntry(screen.id)], screenRows: 8 })
    actions.upsertBoard(b)
    toast(`“${screen.name}” panoya eklendi`, { label: 'Panolara git', run: () => navigate('panolar') })
  }
  const add = (symbol: string, name: string, currency?: string) => {
    if (state.instruments.some((i) => i.symbol === symbol)) return
    const ins = instrumentFromHit({ symbol, name, ticker: symbol.split(':')[1], type: 'stock', exchange: symbol.split(':')[0], currency }, allKeys())
    actions.addInstrument({ ...ins, name })
    toast(`${name} listene eklendi`)
  }
  // Sütun başlığına basınca o sütuna göre; aynı başlığa yeniden basınca ters, üçüncüde listenin kendi sırası
  const rows = !result || !col ? result?.rows ?? [] : [...result.rows].sort((a, b) => {
    const d = col.key === 'name' ? a.name.localeCompare(b.name, 'tr') : (a[col.key] ?? -Infinity) - (b[col.key] ?? -Infinity)
    return col.desc ? -d : d
  })
  const ariaSort = (k: NonNullable<typeof col>['key']) => (col?.key === k ? (col.desc ? 'descending' : 'ascending') : undefined)
  const sortBtn = (k: NonNullable<typeof col>['key'], label: string) => (
    <button className="sort" onClick={() => setCol((c) => (c?.key !== k ? { key: k, desc: k !== 'name' } : c.desc === (k !== 'name') ? { key: k, desc: !c.desc } : null))}>
      {label}{col?.key === k ? (col.desc ? ' ↓' : ' ↑') : ''}
    </button>
  )
  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '0 0 6px' }}>
        <CondChips conditions={screen.conditions} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', color: 'var(--ink-3)', fontSize: 13.5 }}>
        <span>{summary(screen)}{screen.matchAll ? '' : ', koşullardan herhangi biri'}</span>
        <span>{result ? `${result.rows.length} eşleşme, ${result.scanned} sembol tarandı, ${Fmt.dateTime(result.time)}` : running ? 'Taranıyor…' : 'Henüz taranmadı'}</span>
      </div>
      {result?.error && <p className="note" style={{ color: 'var(--down)' }}>{result.error}</p>}
      {result?.note && <p className="note">{result.note}</p>}
      {rel && (
        <p className="rel-line">
          <ReliabilityBadge entry={rel} />
          <span>
            {rel.source === 'published' ? `Son ${rel.years} yılın testine göre` : `Senin ${rel.years === 0.5 ? 'son 6 ay' : `son ${rel.years} yıl`} testine göre, ${Fmt.dateTime(rel.at)}`}
            {rel.portfolios?.bench != null && bestPortfolio(rel) != null && <>; en iyi portföy {pctText(bestPortfolio(rel)!)}, endeks {pctText(rel.portfolios.bench)}</>}.
          </span>
          <a href={`#/listeler/${screen.id}/test`}>Ayrıntı</a>
        </p>
      )}
      <div className="detail-actions" style={{ marginTop: 14 }}>
        <button className="btn" onClick={() => void refreshScreen(screen.id)} disabled={running}><Icon name="refresh" className={running ? 'spin' : undefined} />Yeniden tara</button>
        <button className="btn" onClick={() => onEdit(screen)}><Icon name="edit" />Düzenle</button>
        <button className="btn" onClick={pin}><Icon name="boards" />Panoya ekle</button>
        <a className="btn" href={`#/listeler/${screen.id}/test`}><Icon name="clock" />Geçmişte test et</a>
      </div>
      {result && result.rows.length === 0 && !result.error && <div className="empty"><h2>Şu an koşulları sağlayan yok</h2><p>Liste her yenilemede yeniden taranır; koşulları gevşetmek için Düzenle’ye bas.</p></div>}
      {result && result.rows.length > 0 && (
        <table className="result-table">
          <thead><tr>
            <th aria-sort={ariaSort('name')}>{sortBtn('name', 'Ad')}</th>
            <th className="hide-s" aria-sort={col ? undefined : 'other'}><button className="sort" onClick={() => setCol(null)} title="Listenin kendi sırası">Koşula göre</button></th>
            <th className="r" aria-sort={ariaSort('price')}>{sortBtn('price', 'Fiyat')}</th>
            <th className="r" aria-sort={ariaSort('change')}>{sortBtn('change', 'Bugün')}</th>
            <th className="r hide-s"><span className="sr-only">İşlemler</span></th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const [pre, suf] = units(r.currency)
              const inList = state.instruments.some((i) => i.symbol === r.symbol)
              return (
                <tr key={r.symbol}>
                  <td><a href={chartUrl(r.symbol)} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}><span className="n">{r.name}</span><span className="s">{r.symbol}</span></a></td>
                  <td className="m hide-s">{metricText(r, screen)}</td>
                  <td className="r num" style={{ fontWeight: 600 }}>{r.price != null ? Fmt.value(r.price, r.decimals, pre, suf) : '—'}</td>
                  <td className="r"><ChangeBadge change={Fmt.changeFor(r.change != null ? 100 + r.change : undefined, r.change != null ? 100 : undefined, '')} /></td>
                  <td className="r hide-s">
                    <MoreButton small label={`${r.name} işlemleri`} items={[
                      { label: 'TradingView’da aç', icon: 'external', href: chartUrl(r.symbol) },
                      { label: inList ? 'Listende' : 'Listeme ekle', icon: 'plus', disabled: inList, onSelect: () => add(r.symbol, r.name, r.currency === 'USD' && screen.currency === 'USD' && r.symbol.startsWith('BIST:') ? 'TRY' : r.currency) },
                    ]} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </>
  )
}

// ------------------------------------------------------------------ düzenleyici

const blank = (): Screen => ({
  id: newId('s'), name: '', universe: 'BIST', category: null, currency: 'LOCAL',
  conditions: [{ left: 'PRICE', op: 'LT', right: 'SMA200', value: 0 }], matchAll: true, sort: 'CLOSEST', limit: 30, onlyStocks: false,
})

export function ScreenEditor({ initial, onClose }: { initial?: Screen; onClose: (savedId?: string) => void }) {
  const isNew = !initial || !getState().screens.some((s) => s.id === initial.id)
  const [s, setS] = useState<Screen>(() => initial ? structuredClone(initial) : blank())
  const [preview, setPreview] = useState<{ loading: boolean; r?: ScreenResult }>({ loading: false })
  const set = (patch: Partial<Screen>) => setS((x) => ({ ...x, ...patch }))
  const setCond = (i: number, c: Condition) => set({ conditions: s.conditions.map((x, j) => (j === i ? c : x)) })
  const seq = useRef(0)

  // Canlı önizleme (700 ms gecikmeli)
  useEffect(() => {
    if (!s.conditions.length) return setPreview({ loading: false })
    const n = ++seq.current
    setPreview((p) => ({ ...p, loading: true }))
    const t = setTimeout(() => {
      void refreshScreen(s.id, s).then((r) => { if (n === seq.current) setPreview({ loading: false, r }) })
    }, 700)
    return () => clearTimeout(t)
  }, [JSON.stringify({ ...s, name: '' })])

  const save = () => {
    const name = s.name.trim() || s.conditions.map(describe).join(', ').slice(0, 60) || 'Dinamik liste'
    actions.upsertScreen({ ...s, name })
    onClose(s.id)
  }
  const del = () => { actions.deleteScreen(s.id); onClose() }

  return (
    <Dialog title={isNew ? 'Yeni dinamik liste' : 'Dinamik listeyi düzenle'} size="large" onClose={() => onClose()}
      footer={<>
        {!isNew && <button className="btn ghost danger left" onClick={del}>Listeyi sil</button>}
        <button className="btn ghost" onClick={() => onClose()}>Vazgeç</button>
        <button className="btn primary" onClick={save} disabled={!s.conditions.length}>Kaydet</button>
      </>}>
      <div className="dialog-body">
        <div className="editor-grid">
          <div>
            {isNew && (
              <div className="field">
                <span className="label">Hazır şablondan başla</span>
                <div className="chips">
                  {SCREEN_TEMPLATES.slice(0, 10).map((t) => (
                    <button key={t.id} className="chip" onClick={() => setS({ ...structuredClone(t), id: s.id, name: t.name })}>{t.name}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="field">
              <label htmlFor="s-name">Ad</label>
              <input id="s-name" className="input" value={s.name} placeholder="Boş bırakırsan koşullardan oluşturulur" onChange={(e) => set({ name: e.target.value.slice(0, 80) })} />
            </div>
            <div className="field">
              <span className="label">Nerede aransın</span>
              <Segmented value={s.universe} onChange={(v) => set({ universe: v })} options={UNIVERSES.map((u) => ({ value: u.id, label: u.label }))} />
              <span className="help">{UNIVERSES.find((u) => u.id === s.universe)!.hint}</span>
            </div>
            {s.universe === 'MY_LIST' && (
              <div className="field">
                <span className="label">Listemdeki hangi grup</span>
                <div className="chips">
                  <button className="chip" aria-pressed={!s.category} onClick={() => set({ category: null })}>Tümü</button>
                  {CATEGORIES.filter((c) => c.id !== 'WORLD').map((c) => (
                    <button key={c.id} className="chip" aria-pressed={s.category === c.id} onClick={() => set({ category: c.id as Category })}>{c.label}</button>
                  ))}
                </div>
                <Switch checked={s.onlyStocks} onChange={(v) => set({ onlyStocks: v })} label="Yalnızca hisseler" hint="Endeks, döviz, emtia hariç" />
              </div>
            )}
            <div className="field">
              <span className="label">Para birimi</span>
              <Segmented value={s.currency} onChange={(v) => set({ currency: v })} options={[{ value: 'LOCAL', label: 'Yerel' }, { value: 'USD', label: 'USD' }]} />
              <span className="help">USD’de TL fiyatlar dolara çevrilir; 5 yıllık dip ve zirve her ayın kuruyla hesaplanır.</span>
            </div>
            <div className="field">
              <span className="label">Koşullar</span>
              {s.conditions.map((c, i) => (
                <ConditionRow key={i} c={c} onChange={(x) => setCond(i, x)} onRemove={() => set({ conditions: s.conditions.filter((_, j) => j !== i) })} />
              ))}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="btn small" onClick={() => set({ conditions: [...s.conditions, { left: 'MCAP', op: 'GT', right: null, value: 10e9 }] })}><Icon name="plus" />Koşul ekle</button>
                {s.conditions.length > 1 && (
                  <Segmented value={s.matchAll ? 'all' : 'any'} onChange={(v) => set({ matchAll: v === 'all' })} options={[{ value: 'all', label: 'Tümü sağlansın' }, { value: 'any', label: 'Herhangi biri' }]} />
                )}
              </div>
            </div>
            <div className="field">
              <span className="label">Sıralama</span>
              <div className="chips">{SORTS.map((o) => <button key={o.id} className="chip" aria-pressed={s.sort === o.id} onClick={() => set({ sort: o.id })}>{o.label}</button>)}</div>
            </div>
            <div className="field">
              <span className="label">En fazla</span>
              <Segmented value={s.limit} onChange={(v) => set({ limit: v })} options={[10, 20, 30, 50].map((v) => ({ value: v, label: String(v) }))} />
            </div>
          </div>
          <div className="preview-pane">
            <h3>Önizleme {preview.loading && <Icon name="refresh" className="spin" />}</h3>
            {preview.r?.error && <p className="note" style={{ color: 'var(--down)' }}>{preview.r.error}</p>}
            {preview.r && !preview.r.error && <p className="note">{preview.r.rows.length} eşleşme, {preview.r.scanned} sembol tarandı</p>}
            <ul className="mini-results">
              {preview.r?.rows.slice(0, 14).map((r) => {
                const [pre, suf] = units(r.currency)
                return <li key={r.symbol}><span>{r.name}</span><span className="num">{r.price != null ? Fmt.value(r.price, r.decimals, pre, suf) : '—'}</span></li>
              })}
            </ul>
            {preview.r?.note && <p className="note">{preview.r.note}</p>}
          </div>
        </div>
      </div>
    </Dialog>
  )
}

function FieldSelect({ value, onChange, id, label }: { value: FieldId; onChange: (v: FieldId) => void; id?: string; label: string }) {
  const groups = useMemo(() => ['Fiyat', 'Değerleme', 'Kârlılık'] as const, [])
  return (
    <select id={id} className="select" value={value} aria-label={label} onChange={(e) => onChange(e.target.value as FieldId)}>
      {groups.map((g) => (
        <optgroup key={g} label={g}>
          {FIELDS.filter((f) => f.group === g).map((f) => (
            <option key={f.id} value={f.id}>{f.label}{f.source === 'HISTORY' ? ' (geçmiş fiyattan)' : f.source === 'DERIVED' ? ' (bilançodan)' : ''}</option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

function ConditionRow({ c, onChange, onRemove }: { c: Condition; onChange: (c: Condition) => void; onRemove: () => void }) {
  const money = field(c.left).kind === 'MONEY' && !c.right
  const [text, setText] = useState(() => Fmt.number(money ? c.value / 1e9 : c.value, (money ? c.value / 1e9 : c.value) % 1 === 0 ? 0 : 2).replace(/\./g, ''))
  useEffect(() => {
    const v = money ? c.value / 1e9 : c.value
    if (Fmt.parseInput(text) !== v) setText(Fmt.number(v, v % 1 === 0 ? 0 : 2).replace(/\./g, ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.value, money])
  const setValue = (t: string) => {
    setText(t)
    const v = Fmt.parseInput(t)
    if (v != null) onChange({ ...c, value: money ? v * 1e9 : v })
  }
  return (
    <div className="cond-row">
      <FieldSelect value={c.left} label="Alan" onChange={(left) => onChange({ ...c, left })} />
      <select className="select" value={c.op} aria-label="Karşılaştırma" onChange={(e) => onChange({ ...c, op: e.target.value as Condition['op'] })}>
        {OPS.map((o) => <option key={o.id} value={o.id}>{o.symbol}</option>)}
      </select>
      <select className="select kind" value={c.right ? 'field' : 'value'} aria-label="Neyle karşılaştırılsın"
        onChange={(e) => onChange(e.target.value === 'field' ? { ...c, right: 'SMA200', value: 0 } : { ...c, right: null })}>
        <option value="value">bir sayıyla</option>
        <option value="field">başka bir alanla</option>
      </select>
      <button className="icon-btn small" aria-label="Koşulu kaldır" onClick={onRemove}><Icon name="trash" /></button>
      <div className="right">
        {c.right ? (
          <>
            <FieldSelect value={c.right} label="Karşılaştırılan alan" onChange={(right) => onChange({ ...c, right })} />
            <input className="input num" style={{ width: 84, flex: 'none' }} value={text} aria-label="Yüzde fark (artı ya da eksi)" inputMode="decimal" onChange={(e) => setValue(e.target.value)} />
            <span style={{ color: 'var(--ink-3)' }}>%</span>
          </>
        ) : (
          <>
            <input className="input num" value={text} aria-label="Değer" inputMode="decimal" onChange={(e) => setValue(e.target.value)} />
            {money && <span style={{ color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>milyar</span>}
          </>
        )}
      </div>
      <div className="preview">
        {describe(c)}
        {c.right && c.value !== 0 && `  (yani ${field(c.right).label} × ${Fmt.number(1 + c.value / 100, 2)})`}
        {(field(c.left).source === 'HISTORY' || (c.right && field(c.right).source === 'HISTORY')) && '. Geçmiş fiyat Yahoo Finance’ten, ilk 60 aday için.'}
      </div>
    </div>
  )
}
