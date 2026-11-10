import { useEffect, useState } from 'react'
import * as Fmt from './core/format'
import type { Screen } from './core/screener'
import { refreshQuotes, refreshScreens, screensStale, useApp, useLive } from './data/store'
import { Boards, BoardEditor, Kiosk } from './screens/Boards'
import { Composer } from './screens/Composer'
import { Detail } from './screens/Detail'
import { ScreenEditor, ScreensIndex, ScreenView } from './screens/ScreensPage'
import { Settings } from './screens/Settings'
import { Watchlist } from './screens/Watchlist'
import { Icon } from './ui/Icon'
import { ToastHost } from './ui/overlay'
import { href, navigate, useRoute } from './ui/router'
import { defaultBoard, newId } from './core/models'

type ComposeState = { query?: string; editKey?: string } | null

export function App() {
  return (
    <ToastHost>
      <Shell />
    </ToastHost>
  )
}

const NAV = [
  { path: '', label: 'Piyasalar', icon: 'list' },
  { path: 'panolar', label: 'Panolar', icon: 'boards' },
  { path: 'listeler', label: 'Dinamik listeler', short: 'Listeler', icon: 'filter' },
  { path: 'ayarlar', label: 'Ayarlar', icon: 'settings' },
]

function Shell() {
  const state = useApp()
  const live = useLive()
  const route = useRoute()
  const [compose, setCompose] = useState<ComposeState>(null)
  const [screenEdit, setScreenEdit] = useState<{ screen?: Screen } | null>(null)
  const [boardNew, setBoardNew] = useState(false)
  const section = route.path[0] ?? ''
  const selected = section === '' ? route.query.get('s') ?? undefined : undefined

  useTheme(state.settings.theme)
  useLiveRefresh(state.settings.refreshSeconds)

  // Kısayollar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      const typing = t.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('.dialog')
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setCompose({}); return }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '/') { e.preventDefault(); setCompose({}) }
      else if (e.key === 'r' || e.key === 'R') void refreshQuotes()
      else if (['1', '2', '3', '4'].includes(e.key)) navigate(NAV[Number(e.key) - 1].path)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (section === 'pano' && route.path[1]) return <Kiosk id={route.path[1]} />

  const current = NAV.find((n) => n.path === section) ?? NAV[0]
  const screenId = section === 'listeler' ? route.path[1] : undefined
  const screen = screenId ? state.screens.find((s) => s.id === screenId) : undefined
  const status = statusOf(live)

  return (
    <div className={'shell' + (selected ? ' has-detail' : '')}>
      <aside className="sidebar" aria-label="Gezinme">
        <a className="brand" href="#/"><span className="brand-mark" aria-hidden="true" />Piyasa</a>
        <button className="sidebar-search" onClick={() => setCompose({})}>
          <Icon name="search" /><span>Ara, hesapla</span><kbd>/</kbd>
        </button>
        <nav className="nav">
          {NAV.map((n) => (
            <a key={n.path} href={href(n.path)} aria-current={current.path === n.path ? 'page' : undefined}>
              <Icon name={n.icon} />{n.label}
              {n.path === 'panolar' && <span className="count">{state.boards.length}</span>}
              {n.path === 'listeler' && <span className="count">{state.screens.length}</span>}
            </a>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button className="status btn ghost small" style={{ justifyContent: 'flex-start', padding: 0, height: 'auto' }} onClick={() => void refreshQuotes()} title="Şimdi yenile (R)">
            <span className={'status-dot ' + status.dot} />{status.text}
          </button>
          <span>Veriler TradingView’dan. Yatırım tavsiyesi değildir.</span>
        </div>
      </aside>

      <div className="mobile-top">
        <a className="brand" href="#/"><span className="brand-mark" aria-hidden="true" />Piyasa</a>
        <button className="icon-btn" onClick={() => void refreshQuotes()} aria-label="Yenile"><Icon name="refresh" className={live.refreshing ? 'spin' : undefined} /></button>
        <button className="icon-btn" onClick={() => setCompose({})} aria-label="Ara ya da formül yaz"><Icon name="search" /></button>
      </div>

      <main className="main" id="main">
        <div className={'page' + (section === 'panolar' ? ' wide' : '')}>
          <header className="page-head">
            {screen && <a className="icon-btn" href="#/listeler" aria-label="Dinamik listelere dön"><Icon name="back" /></a>}
            <div style={{ minWidth: 0 }}>
              <h1>{screen ? screen.name : current.label}</h1>
              {section === '' && <div className="sub" aria-live="polite">{status.text}</div>}
            </div>
            <span className="spacer" />
            {section === '' && (
              <>
                <button className="icon-btn desk" onClick={() => void refreshQuotes()} aria-label="Fiyatları yenile" title="Yenile (R)">
                  <Icon name="refresh" className={live.refreshing ? 'spin' : undefined} />
                </button>
                <button className="btn primary" onClick={() => setCompose({})}><Icon name="plus" />Ekle</button>
              </>
            )}
            {section === 'panolar' && <button className="btn primary" onClick={() => setBoardNew(true)}><Icon name="plus" />Yeni pano</button>}
            {section === 'listeler' && !screen && (
              <>
                <button className="btn ghost" onClick={() => void refreshScreens()}><Icon name="refresh" />Hepsini tara</button>
                <button className="btn primary" onClick={() => setScreenEdit({})}><Icon name="plus" />Yeni liste</button>
              </>
            )}
          </header>
          {section === '' && <Watchlist onCompose={(query) => setCompose({ query })} onEditFormula={(editKey) => setCompose({ editKey })} />}
          {section === 'panolar' && <Boards />}
          {section === 'listeler' && !screenId && <ScreensIndex onNew={() => setScreenEdit({})} />}
          {section === 'listeler' && screenId && <ScreenView id={screenId} onEdit={(s) => setScreenEdit({ screen: s })} />}
          {section === 'ayarlar' && <Settings />}
        </div>
      </main>

      {selected && <div className="detail-scrim" onClick={() => navigate('', {})} aria-hidden="true" />}
      {selected && <Detail itemKey={selected} onEditFormula={(editKey) => setCompose({ editKey })} />}

      <nav className="tabbar" aria-label="Sekmeler">
        {NAV.map((n) => (
          <a key={n.path} href={href(n.path)} aria-current={current.path === n.path ? 'page' : undefined}>
            <Icon name={n.icon} />{n.short ?? n.label}
          </a>
        ))}
      </nav>

      {compose && <Composer onClose={() => setCompose(null)} initialQuery={compose.query} editKey={compose.editKey} />}
      {screenEdit && <ScreenEditor initial={screenEdit.screen} onClose={(id) => { setScreenEdit(null); if (id) navigate(`listeler/${id}`) }} />}
      {boardNew && <BoardEditor initial={defaultBoard({ id: newId('b'), title: 'Yeni pano' })} onClose={() => setBoardNew(false)} />}
    </div>
  )
}

function statusOf(live: ReturnType<typeof useLive>) {
  if (live.refreshing && !live.lastRefresh) return { dot: 'busy', text: 'Fiyatlar alınıyor…' }
  if (live.error) return { dot: 'error', text: live.error }
  if (!live.lastRefresh) return { dot: 'stale', text: 'Bağlanıyor…' }
  return { dot: live.refreshing ? 'busy' : '', text: `Canlı, ${Fmt.time(live.lastRefresh)}` }
}

function useTheme(theme: 'system' | 'light' | 'dark') {
  useEffect(() => {
    const el = document.documentElement
    if (theme === 'system') delete el.dataset.theme
    else el.dataset.theme = theme
  }, [theme])
}

/** Sayfa görünürken fiyatları düzenli yeniler; arka plandayken durur, öne gelince hemen yeniler. */
function useLiveRefresh(seconds: number) {
  useEffect(() => {
    void refreshQuotes()
    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => {
      stop()
      if (seconds > 0) timer = setInterval(() => { if (document.visibilityState === 'visible') void refreshQuotes() }, seconds * 1000)
    }
    const stop = () => { if (timer) clearInterval(timer); timer = null }
    const onVis = () => { if (document.visibilityState === 'visible') { void refreshQuotes(); start() } else stop() }
    const onOnline = () => void refreshQuotes()
    start()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', onOnline)
    // Dinamik listeler: açılışta eskiyenler, sonra 10 dakikada bir
    const s1 = setTimeout(() => void refreshScreens(screensStale(10 * 60_000)), 1200)
    const s2 = setInterval(() => { if (document.visibilityState === 'visible') void refreshScreens(screensStale(10 * 60_000)) }, 60_000)
    return () => { stop(); clearTimeout(s1); clearInterval(s2); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('online', onOnline) }
  }, [seconds])
}
