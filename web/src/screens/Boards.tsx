import { closestCenter, DndContext, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, rectSortingStrategy, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import * as Fmt from '../core/format'
import {
  defaultBoard, isScreenEntry, isSection, newId, screenEntry, screenIdOf, sectionEntry, sectionTitle,
  type AppState, type Board, type LiveData,
} from '../core/models'
import { units } from '../core/screener'
import { chartUrl } from '../core/tradingview'
import { actions, getState, refreshScreens, screensStale, useApp, useLive } from '../data/store'
import { fold } from '../data/tv'
import { Icon } from '../ui/Icon'
import { ChangeBadge, Price, useItems } from '../ui/market'
import { Dialog, MoreButton, Segmented, Switch, useToast } from '../ui/overlay'
import { navigate } from '../ui/router'
import { sensorsConfig } from './Watchlist'

export function Boards() {
  const state = useApp()
  const [editing, setEditing] = useState<Board | null>(null)
  const sensors = useSensors(...sensorsConfig())
  const toast = useToast()
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const ids = state.boards.map((b) => b.id)
    actions.setBoards(arrayMove(state.boards, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))))
  }
  const remove = (b: Board) => {
    const before = getState().boards
    actions.deleteBoard(b.id)
    toast(`“${b.title}” silindi`, { label: 'Geri al', run: () => actions.setBoards(before) })
  }
  return (
    <>
      <p className="lede">Panolar, Android’deki widget’ların karşılığı: istediğin göstergeleri, formülleri ve dinamik listeleri bir kartta topla. Başlığından tutup sürükleyerek sırala, bir panoyu tam ekranda ekran panosu olarak aç.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={state.boards.map((b) => b.id)} strategy={rectSortingStrategy}>
          <div className="boards">
            {state.boards.map((b) => (
              <SortableCard key={b.id} board={b} onEdit={() => setEditing(b)} onRemove={() => remove(b)} />
            ))}
            <button className="card-add" onClick={() => setEditing(defaultBoard({ id: newId('b'), title: 'Yeni pano' }))}>
              <Icon name="plus" /><span>Yeni pano</span>
            </button>
          </div>
        </SortableContext>
      </DndContext>
      {editing && <BoardEditor initial={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function SortableCard({ board, onEdit, onRemove }: { board: Board; onEdit: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, setActivatorNodeRef } = useSortable({ id: board.id })
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition }
  return (
    <div ref={setNodeRef} style={style} className={isDragging ? 'dragging-wrap' : undefined}>
      <BoardCard board={board} dragging={isDragging}
        handle={{ ref: setActivatorNodeRef, props: { ...attributes, ...listeners } }}
        tools={
          <MoreButton small label={`${board.title} seçenekleri`} items={[
            { label: 'Düzenle', icon: 'edit', onSelect: onEdit },
            { label: 'Tam ekran aç', icon: 'expand', onSelect: () => navigate(`pano/${board.id}`) },
            { label: 'Kopyasını oluştur', icon: 'copy', onSelect: () => actions.upsertBoard({ ...board, id: newId('b'), title: board.title + ' (kopya)' }) },
            { label: board.span === 2 ? 'Dar göster' : 'Geniş göster', icon: 'boards', onSelect: () => actions.upsertBoard({ ...board, span: board.span === 2 ? 1 : 2 }) },
            { label: '', divider: true },
            { label: 'Panoyu sil', icon: 'trash', danger: true, onSelect: onRemove },
          ]} />
        } />
    </div>
  )
}

interface CardLine { kind: 'sect' | 'item' | 'note'; key: string; text?: string; itemKey?: string; screenRow?: { symbol: string; name: string; price?: number; change?: number; currency?: string; decimals: number } }

function linesOf(board: Board, state: AppState, live: LiveData): CardLine[] {
  const out: CardLine[] = []
  board.keys.forEach((k, i) => {
    if (isSection(k)) out.push({ kind: 'sect', key: `s${i}`, text: sectionTitle(k) })
    else if (isScreenEntry(k)) {
      const scr = state.screens.find((s) => s.id === screenIdOf(k))
      if (!scr) return
      // Pano başlığı zaten liste adıysa tekrar yazma
      if (board.title !== scr.name) out.push({ kind: 'sect', key: `s${i}`, text: scr.name })
      const r = live.screenResults[scr.id]
      const rows = r?.rows.slice(0, board.screenRows) ?? []
      if (!rows.length) out.push({ kind: 'note', key: `n${i}`, text: live.screensRunning[scr.id] || !r ? 'Taranıyor…' : r.error ?? 'Şu an eşleşen yok' })
      rows.forEach((row) => out.push({ kind: 'item', key: `${i}-${row.symbol}`, screenRow: row }))
    } else out.push({ kind: 'item', key: `${i}-${k}`, itemKey: k })
  })
  // Arkasında satır olmayan başlıkları at
  return out.filter((l, i) => l.kind !== 'sect' || (out[i + 1] && out[i + 1].kind !== 'sect'))
}

export function BoardCard({ board, dragging, handle, tools, kiosk }: {
  board: Board; dragging?: boolean; kiosk?: boolean
  handle?: { ref: (el: HTMLElement | null) => void; props: Record<string, unknown> }
  tools?: React.ReactNode
}) {
  const state = useApp()
  const live = useLive()
  const items = useItems(state, live)
  const lines = useMemo(() => linesOf(board, state, live), [board, state, live])
  const density = board.density === 'compact' ? 0.55 : board.density === 'comfortable' ? 1.45 : 1
  const style = { '--scale': kiosk ? undefined : board.textScale, '--density': density } as CSSProperties
  return (
    <section className={'card' + (board.span === 2 && !kiosk ? ' span-2' : '') + (dragging ? ' dragging' : '')} style={style} aria-label={board.title}>
      <div className="card-head" ref={handle?.ref} {...(handle?.props ?? {})} title={handle ? 'Sürükleyerek taşı' : undefined}>
        <h3>{board.title}</h3>
        <span className="time num">{live.lastRefresh ? Fmt.time(live.lastRefresh) : ''}</span>
        {tools}
      </div>
      {!lines.length && <div className="card-note">Boş pano. Düzenle’den gösterge ya da dinamik liste ekle.</div>}
      {lines.map((l) => {
        if (l.kind === 'sect') return <div key={l.key} className="card-sect">{l.text}</div>
        if (l.kind === 'note') return <div key={l.key} className="card-note">{l.text}</div>
        if (l.screenRow) {
          const r = l.screenRow
          const [pre, suf] = units(r.currency)
          const text = r.price != null ? Fmt.value(r.price, r.decimals, pre, suf) : '—'
          const change = Fmt.changeFor(r.change != null ? 100 + r.change : undefined, r.change != null ? 100 : undefined, '')
          return (
            <a key={l.key} className="card-row" href={chartUrl(r.symbol)} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
              <span className="card-name">{r.name}{board.showSubtitle && <small>{r.symbol}</small>}</span>
              <span className="card-price"><Price text={text} value={r.price} /></span>
              <ChangeBadge change={change} style={board.changeStyle} />
            </a>
          )
        }
        const it = items.get(l.itemKey!)
        if (!it) return null
        return (
          <div key={l.key} className="card-row" role="button" tabIndex={0}
            onClick={() => (kiosk ? undefined : (navigate('', { s: it.key })))}
            onKeyDown={(e) => e.key === 'Enter' && !kiosk && navigate('', { s: it.key })}>
            <span className="card-name">
              {it.title}
              {board.showSubtitle && <small>{it.isFormula ? 'Hesaplama' : it.subtitle}</small>}
            </span>
            <span className="card-price"><Price text={it.valueText} value={it.value} /></span>
            <ChangeBadge change={it.change} style={board.changeStyle} />
          </div>
        )
      })}
    </section>
  )
}

// ------------------------------------------------------------------ düzenleyici

export function BoardEditor({ initial, onClose }: { initial: Board; onClose: () => void }) {
  const state = useApp()
  const live = useLive()
  const items = useItems(state, live)
  const [b, setB] = useState<Board>(initial)
  const [filter, setFilter] = useState('')
  const sensors = useSensors(...sensorsConfig())
  const ids = useMemo(() => {
    const seen = new Map<string, number>()
    return b.keys.map((k) => { const n = (seen.get(k) ?? 0) + 1; seen.set(k, n); return `${k}#${n}` })
  }, [b.keys])
  const isNew = !state.boards.some((x) => x.id === b.id)
  const set = (patch: Partial<Board>) => setB((x) => ({ ...x, ...patch }))
  const save = () => {
    actions.upsertBoard({ ...b, title: b.title.trim() || 'Pano' })
    onClose()
  }
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    set({ keys: arrayMove(b.keys, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))) })
  }
  const n = fold(filter.trim())
  const match = (s: string) => !n || fold(s).includes(n)
  const available = [
    ...state.formulas.filter((f) => !b.keys.includes(f.key) && match(f.name)).map((f) => ({ key: f.key, label: f.name, meta: 'Hesaplama' })),
    ...state.instruments.filter((i) => !b.keys.includes(i.key) && match(`${i.name} ${i.symbol}`)).map((i) => ({ key: i.key, label: i.name, meta: i.symbol })),
  ]
  const screens = state.screens.filter((s) => !b.keys.includes(screenEntry(s.id)) && match(s.name))
  const [sectionName, setSectionName] = useState('')

  useEffect(() => {
    if (b.keys.some(isScreenEntry)) void refreshScreens(screensStale(10 * 60_000).filter((id) => b.keys.includes(screenEntry(id))))
  }, [b.keys])

  return (
    <Dialog title={isNew ? 'Yeni pano' : 'Panoyu düzenle'} size="large" onClose={onClose}
      footer={<>
        {!isNew && <button className="btn ghost danger left" onClick={() => { actions.deleteBoard(b.id); onClose() }}>Panoyu sil</button>}
        <button className="btn ghost" onClick={onClose}>Vazgeç</button>
        <button className="btn primary" onClick={save}>Kaydet</button>
      </>}>
      <div className="dialog-body">
        <div className="editor-grid">
          <div>
            <div className="field">
              <label htmlFor="b-title">Başlık</label>
              <input id="b-title" className="input" value={b.title} onChange={(e) => set({ title: e.target.value.slice(0, 60) })} />
            </div>
            <div className="field">
              <span className="label">İçerik ({b.keys.length})</span>
              {!b.keys.length && <span className="help">Aşağıdan ekle. Satırları tutup sürükleyerek sırala.</span>}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                  <ul className="rows" aria-label="Pano içeriği">
                    {b.keys.map((k, i) => (
                      <EditorEntry key={ids[i]} id={ids[i]}
                        label={isSection(k) ? sectionTitle(k) : isScreenEntry(k) ? state.screens.find((s) => s.id === screenIdOf(k))?.name ?? 'Silinmiş liste' : items.get(k)?.title ?? k}
                        kind={isSection(k) ? 'Bölüm başlığı' : isScreenEntry(k) ? `Dinamik liste, ilk ${b.screenRows} sonuç` : items.get(k)?.valueText ?? ''}
                        section={isSection(k)}
                        onRemove={() => set({ keys: b.keys.filter((_, j) => j !== i) })} />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            </div>
            <div className="field">
              <span className="label">Bölüm başlığı ekle</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input" placeholder="Altın, Döviz, Borsa…" value={sectionName} onChange={(e) => setSectionName(e.target.value.slice(0, 30))}
                  onKeyDown={(e) => { if (e.key === 'Enter' && sectionName.trim()) { set({ keys: [...b.keys, sectionEntry(sectionName)] }); setSectionName('') } }} />
                <button className="btn" disabled={!sectionName.trim()} onClick={() => { set({ keys: [...b.keys, sectionEntry(sectionName)] }); setSectionName('') }}>Ekle</button>
              </div>
            </div>
            <div className="field">
              <span className="label">Ekle</span>
              <input className="input" placeholder="Listende ara" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Eklenecekleri süz" />
              <ul className="results" style={{ maxHeight: 280, padding: 0 }}>
                {screens.length > 0 && <li className="sect">Dinamik listeler</li>}
                {screens.map((s) => (
                  <li key={s.id} className="result" onClick={() => set({ keys: [...b.keys, screenEntry(s.id)] })}>
                    <div style={{ minWidth: 0 }}><div className="name">{s.name}</div></div><span /><Icon name="plus" />
                  </li>
                ))}
                {available.length > 0 && <li className="sect">Göstergeler ve hesaplamalar</li>}
                {available.map((a) => (
                  <li key={a.key} className="result" onClick={() => set({ keys: [...b.keys, a.key] })}>
                    <div style={{ minWidth: 0 }}><div className="name">{a.label}</div><div className="meta">{a.meta}</div></div><span /><Icon name="plus" />
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="preview-pane">
            <h3>Önizleme</h3>
            <BoardCard board={b} />
            <div style={{ marginTop: 18 }}>
              <div className="field"><span className="label">Satır aralığı</span>
                <Segmented value={b.density} onChange={(v) => set({ density: v })} options={[{ value: 'compact', label: 'Sıkı' }, { value: 'normal', label: 'Normal' }, { value: 'comfortable', label: 'Rahat' }]} />
              </div>
              <div className="field"><span className="label">Yazı boyutu</span>
                <Segmented value={b.textScale} onChange={(v) => set({ textScale: v })} options={[{ value: 0.9, label: 'Küçük' }, { value: 1, label: 'Normal' }, { value: 1.15, label: 'Büyük' }, { value: 1.3, label: 'Çok büyük' }]} />
              </div>
              <div className="field"><span className="label">Günlük değişim</span>
                <Segmented value={b.changeStyle} onChange={(v) => set({ changeStyle: v })} options={[{ value: 'pill', label: 'Rozet' }, { value: 'text', label: 'Yazı' }, { value: 'hidden', label: 'Gizli' }]} />
              </div>
              {b.keys.some(isScreenEntry) && (
                <div className="field"><span className="label">Dinamik listelerde en fazla</span>
                  <Segmented value={b.screenRows} onChange={(v) => set({ screenRows: v })} options={[3, 5, 8, 10].map((v) => ({ value: v, label: String(v) }))} />
                </div>
              )}
              <Switch checked={b.showSubtitle} onChange={(v) => set({ showSubtitle: v })} label="Alt satırda sembol" />
              <Switch checked={b.span === 2} onChange={(v) => set({ span: v ? 2 : 1 })} label="Geniş kart" hint="Izgarada iki sütun kaplar" />
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  )
}

function EditorEntry({ id, label, kind, section, onRemove }: { id: string; label: string; kind: string; section: boolean; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <li ref={setNodeRef} className={'row' + (isDragging ? ' dragging' : '')} style={{ transform: CSS.Translate.toString(transform), transition, gridTemplateColumns: 'auto minmax(0,1fr) auto', cursor: 'grab' }}
      {...attributes} {...listeners}>
      <Icon name="grip" />
      <div className="row-name">
        <div className="row-title" style={section ? { color: 'var(--ink-3)', fontSize: 13 } : undefined}><span className="t">{label}</span></div>
        <div className="row-sub">{kind}</div>
      </div>
      <button className="icon-btn small" aria-label={`${label} çıkar`} onPointerDown={(e) => e.stopPropagation()} onClick={onRemove}><Icon name="close" /></button>
    </li>
  )
}

// ------------------------------------------------------------------ tam ekran

export function Kiosk({ id }: { id: string }) {
  const state = useApp()
  const board = state.boards.find((b) => b.id === id)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000)
    let lock: { release: () => Promise<void> } | undefined
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    nav.wakeLock?.request('screen').then((l) => { lock = l }).catch(() => {})
    return () => { clearInterval(t); void lock?.release() }
  }, [])
  if (!board) return <div className="empty"><h2>Pano bulunamadı</h2><p><a href="#/panolar">Panolara dön</a></p></div>
  return (
    <div className="kiosk">
      <div className="kiosk-head">
        <h1>{board.title}</h1>
        <span className="clock num">{Fmt.time(now)}</span>
      </div>
      <BoardCard board={board} kiosk />
      <div className="kiosk-exit" style={{ display: 'flex', gap: 8 }}>
        <button className="btn" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}><Icon name="expand" />Tam ekran</button>
        <button className="btn" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); navigate('panolar') }}><Icon name="close" />Çık</button>
      </div>
    </div>
  )
}

