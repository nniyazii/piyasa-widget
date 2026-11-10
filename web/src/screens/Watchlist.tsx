import {
  closestCenter, DndContext, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { memo, useRef, useState } from 'react'
import { tokenize } from '../core/formula'
import type { DisplayItem } from '../core/engine'
import { CATEGORIES, defaultBoard, newId, type AppState } from '../core/models'
import { actions, getState, useApp, useLive } from '../data/store'
import { Icon } from '../ui/Icon'
import { ChangeBadge, Price, prettyExpression, RangeBar, useItems } from '../ui/market'
import { Menu as MenuPortal, MoreButton, useToast, type MenuItem } from '../ui/overlay'
import { navigate, setQuery, useRoute } from '../ui/router'

interface Group { id: string; label: string; keys: string[] }

export function groupsOf(state: AppState): Group[] {
  return [
    { id: 'formulas', label: 'Hesaplamalar', keys: state.formulas.map((f) => f.key) },
    ...CATEGORIES.map((c) => ({ id: c.id, label: c.label, keys: state.instruments.filter((i) => i.category === c.id).map((i) => i.key) })),
  ].filter((g) => g.keys.length > 0)
}

export const sensorsConfig = () => [
  useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
  useSensor(TouchSensor, { activationConstraint: { delay: 260, tolerance: 8 } }),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
]

export function Watchlist({ onCompose, onEditFormula }: { onCompose: (q?: string) => void; onEditFormula: (key: string) => void }) {
  const state = useApp()
  const live = useLive()
  const items = useItems(state, live)
  const selected = useRoute().query.get('s') ?? undefined
  const groups = groupsOf(state)
  const toast = useToast()

  const remove = (key: string) => {
    const before = getState()
    const name = items.get(key)?.title ?? key
    actions.removeKey(key)
    toast(`${name} kaldırıldı`, {
      label: 'Geri al',
      run: () => {
        actions.restore({ instruments: before.instruments, formulas: before.formulas, boards: before.boards })
      },
    })
    if (selected === key) setQuery('s', undefined, true)
  }

  if (!state.instruments.length && !state.formulas.length) {
    return (
      <div className="empty">
        <h2>Listen boş</h2>
        <p>Dolar, gram altın, THYAO ya da Apple: aramaya yaz, ekle. Formül de yazabilirsin, ör. ons × dolar ÷ oz.</p>
        <button className="btn primary" onClick={() => onCompose()}><Icon name="plus" />Sembol ya da formül ekle</button>
      </div>
    )
  }

  return (
    <>
      {!state.welcomed && <Welcome onCompose={onCompose} />}
      {groups.map((g) => (
        <GroupSection key={g.id} group={g} state={state} getItem={items.get} selected={selected}
          onOpen={(k) => setQuery('s', selected === k ? undefined : k)}
          onEditFormula={onEditFormula} onRemove={remove} />
      ))}
      <p className="hint">Tıkla: ayrıntı ve grafik. Tutup sürükle: grup içinde sırala (telefonda basılı tut). Sağ tık: diğer işlemler. Klavyede Boşluk ile taşı, Enter ile aç.</p>
    </>
  )
}

function Welcome({ onCompose }: { onCompose: (q?: string) => void }) {
  return (
    <div className="welcome">
      <h2>Piyasalar tek ekranda</h2>
      <p>
        Döviz, altın, Borsa İstanbul ve ABD fiyatları birkaç saniyede bir yenilenir. Kendi hesabını da yazabilirsin:
        {' '}<span className="formula-sample">ons × dolar ÷ oz</span> gram altını verir. Fiyat değişince değişen rakamlar kısa süre yanar.
      </p>
      <button className="icon-btn close" aria-label="Kapat" onClick={() => actions.setWelcomed()}><Icon name="close" /></button>
      <div className="actions">
        <button className="btn primary" onClick={() => onCompose()}><Icon name="search" />Sembol ara</button>
        <button className="btn" onClick={() => onCompose('ons*dolar/oz')}><Icon name="formula" />Formül dene</button>
        <button className="btn ghost" onClick={() => navigate('listeler')}><Icon name="filter" />Hazır taramalar</button>
      </div>
    </div>
  )
}

function GroupSection({ group, state, getItem, selected, onOpen, onEditFormula, onRemove }: {
  group: Group; state: AppState; getItem: (k: string) => DisplayItem | undefined; selected?: string
  onOpen: (k: string) => void; onEditFormula: (k: string) => void; onRemove: (k: string) => void
}) {
  const [order, setOrder] = useState<string[] | null>(null)
  const keys = order ?? group.keys
  const sensors = useSensors(...sensorsConfig())
  const [toolsOpen, setToolsOpen] = useState(false)
  const toast = useToast()
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return setOrder(null)
    const next = arrayMove(keys, keys.indexOf(String(active.id)), keys.indexOf(String(over.id)))
    setOrder(next)
    actions.reorderGroup(group.id === 'formulas' ? 'formulas' : 'instruments', next)
    setTimeout(() => setOrder(null), 0)
  }
  const makeBoard = () => {
    const b = defaultBoard({ id: newId('b'), title: group.label, keys: group.keys })
    actions.upsertBoard(b)
    toast(`“${group.label}” panosu oluşturuldu`, { label: 'Panolara git', run: () => navigate('panolar') })
  }
  const sortByName = () => {
    const next = [...group.keys].sort((a, b) => (getItem(a)?.title ?? a).localeCompare(getItem(b)?.title ?? b, 'tr'))
    actions.reorderGroup(group.id === 'formulas' ? 'formulas' : 'instruments', next)
  }
  return (
    <section className="group" aria-labelledby={`g-${group.id}`}>
      <div className="group-head">
        <h2 id={`g-${group.id}`}>{group.label}</h2>
        <span className="count">{group.keys.length}</span>
        <div className="tools" data-open={toolsOpen}>
          <MoreButton small label={`${group.label} seçenekleri`} onOpenChange={setToolsOpen} items={[
            { label: 'Bu grubu pano yap', icon: 'boards', onSelect: makeBoard },
            { label: 'Ada göre sırala', icon: 'list', onSelect: sortByName },
          ]} />
        </div>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} onDragCancel={() => setOrder(null)}>
        <SortableContext items={keys} strategy={verticalListSortingStrategy}>
          <ul className="rows" role="listbox" aria-label={group.label}>
            {keys.map((k) => {
              const it = getItem(k)
              if (!it) return null
              return (
                <SortableRow key={k} item={it} selected={selected === k} state={state} onOpen={onOpen}
                  menu={rowMenu(it, state, onEditFormula, onRemove)} />
              )
            })}
          </ul>
        </SortableContext>
      </DndContext>
    </section>
  )
}

function rowMenu(it: DisplayItem, state: AppState, onEditFormula: (k: string) => void, onRemove: (k: string) => void): MenuItem[] {
  const boards: MenuItem[] = state.boards.filter((b) => !b.keys.includes(it.key)).slice(0, 6).map((b) => ({
    label: b.title, icon: 'boards', onSelect: () => actions.upsertBoard({ ...b, keys: [...b.keys, it.key] }),
  }))
  return [
    ...(it.isFormula ? [{ label: 'Formülü düzenle', icon: 'edit', onSelect: () => onEditFormula(it.key) }] : []),
    ...(it.url ? [{ label: 'TradingView’da aç', icon: 'external', href: it.url }] : []),
    ...(boards.length ? [{ label: '', divider: true }, { label: 'Panoya ekle', heading: true }, ...boards] : []),
    { label: '', divider: true },
    { label: it.isFormula ? 'Formülü sil' : 'Listeden kaldır', icon: 'trash', danger: true, onSelect: () => onRemove(it.key) },
  ]
}

const SortableRow = memo(function SortableRow({ item, selected, state, onOpen, menu }: {
  item: DisplayItem; selected: boolean; state: AppState; onOpen: (k: string) => void; menu: MenuItem[]
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.key })
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null)
  const pointerType = useRef('mouse')
  const sub = item.error && item.isFormula ? item.error : item.isFormula ? prettyExpression(state, item.subtitle, tokenize) : item.subtitle
  return (
    <li
      ref={setNodeRef}
      className={'row' + (isDragging ? ' dragging' : '')}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      role="option"
      aria-selected={selected}
      tabIndex={0}
      {...listeners}
      onClick={() => onOpen(item.key)}
      onPointerDown={(e) => { pointerType.current = e.pointerType; listeners?.onPointerDown?.(e) }}
      onKeyDown={(e) => {
        // Enter ayrıntıyı açar (sürüklemeyi başlatmaz); Boşluk tuşu klavyeyle taşımayı başlatır
        if (e.key === 'Enter') { e.preventDefault(); onOpen(item.key); return }
        if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
          e.preventDefault()
          const r = e.currentTarget.getBoundingClientRect()
          setCtx({ x: r.right - 40, y: r.top + r.height / 2 })
        }
        listeners?.onKeyDown?.(e)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        // Dokunmatikte uzun basma sürüklemedir; menü ayrıntı panelinde
        if (pointerType.current !== 'touch') setCtx({ x: e.clientX, y: e.clientY })
      }}
    >
      <span className="grip" aria-hidden="true"><Icon name="grip" /></span>
      <div className="row-name">
        <div className="row-title">
          {item.isFormula && <span className="fx-mark" title="Hesaplama">ƒ</span>}
          <span className="t">{item.title}</span>
          {item.quote?.delayed && <span className="delayed" title="TradingView verisi 15 dakika gecikmeli">15 dk</span>}
        </div>
        <div className={'row-sub' + (item.error && item.isFormula ? ' error' : '')}>{sub}</div>
      </div>
      <RangeBar quote={item.quote} />
      <div className="row-price"><Price text={item.valueText} value={item.value} /></div>
      <ChangeBadge change={item.change} />
      {ctx && <ContextMenu at={ctx} items={menu} onClose={() => setCtx(null)} />}
    </li>
  )
})

/** Sağ tık menüsü: tıklanan noktaya açılır. */
function ContextMenu({ at, items, onClose }: { at: { x: number; y: number }; items: MenuItem[]; onClose: () => void }) {
  const [anchor] = useState(() => {
    const el = document.createElement('span')
    el.style.cssText = `position:fixed;left:${at.x}px;top:${at.y}px;width:1px;height:1px`
    document.body.appendChild(el)
    return el
  })
  return <MenuPortal anchor={anchor} items={items} onClose={() => { anchor.remove(); onClose() }} />
}

