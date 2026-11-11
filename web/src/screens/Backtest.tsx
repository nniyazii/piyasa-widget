import { useEffect, useMemo, useRef, useState } from 'react'
import { horizonLabel, reliability, supportSummary, type BtResult, type ConditionStat, type Episode, type HorizonStat } from '../core/backtest'
import * as Fmt from '../core/format'
import { termForField } from '../core/glossary'
import { describe, type Condition, type Screen, type Universe } from '../core/screener'
import { chartUrl } from '../core/tradingview'
import { runScreenBacktest, type BtRun, type BtStep } from '../data/backtest'
import { dailyAvailable } from '../data/daily'
import { saveLocalScore } from '../data/reliability'
import { useApp } from '../data/store'
import { fold } from '../data/tv'
import { Icon } from '../ui/Icon'
import { Segmented } from '../ui/overlay'
import { CondChips } from '../ui/conds'
import { ReliabilityPanel } from '../ui/reliability'

// Sayfadan çıkıp dönünce sonuç kaybolmasın (oturum boyunca)
const cache = new Map<string, BtRun>()
const DAY = 86400_000
const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' })
const fmtDay = (d: number) => dateFmt.format(d * DAY)
const pct1 = (v?: number) => (v == null || !Number.isFinite(v) ? '—' : (v > 0.0005 ? '+' : v < -0.0005 ? '−' : '') + '%' + Fmt.number(Math.abs(v * 100), 1))
const tone = (v?: number) => (v == null ? '' : v > 0.0005 ? 'pos' : v < -0.0005 ? 'neg' : '')

export function BacktestView({ id }: { id: string }) {
  const state = useApp()
  const screen = state.screens.find((s) => s.id === id)
  const [years, setYears] = useState(1)
  // "Listem" listeleri tüm BIST'te ya da ABD'de de denenebilir: listede az hisse varken geçmiş seyrek kalır
  const [uni, setUni] = useState<Universe>(screen?.universe ?? 'MY_LIST')
  const key = screen ? `${id}|${years}|${uni}|${JSON.stringify(screen.conditions)}|${screen.universe}|${screen.currency}|${screen.category}|${screen.onlyStocks}|${screen.matchAll}` : ''
  const [run, setRun] = useState<BtRun | undefined>(() => cache.get(key))
  const [step, setStep] = useState<BtStep | null>(null)
  const [error, setError] = useState<string>()
  const [available, setAvailable] = useState<boolean | null>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => { void dailyAvailable().then(setAvailable) }, [])
  useEffect(() => { setRun(cache.get(key)); setError(undefined) }, [key])
  useEffect(() => () => abort.current?.abort(), [])

  if (!screen) return <div className="empty"><h2>Liste bulunamadı</h2><p><a href="#/listeler">Dinamik listelere dön</a></p></div>
  const support = supportSummary(screen)
  const mine = screen.universe === 'MY_LIST'
  const target = (u: Universe): Screen => (u === screen.universe ? screen : { ...screen, universe: u, category: null })

  const start = async (u: Universe = uni) => {
    if (u !== uni) setUni(u)
    const eff = target(u)
    const runKey = key.replace(`|${uni}|`, `|${u}|`)
    abort.current?.abort()
    const ac = new AbortController()
    abort.current = ac
    setError(undefined)
    setRun(undefined)
    setStep({ step: 'universe' })
    try {
      const r = await runScreenBacktest(eff, state.instruments, years, setStep, ac.signal)
      cache.set(runKey, r)
      setRun(r)
      const p = r.result.portfolios
      // Skor yalnızca listenin kendi evreninde kaydedilir (rozet o tanıma aittir)
      if (u === screen.universe) saveLocalScore(screen, {
        rel: reliability(r.result, screen), years, at: Date.now(),
        portfolios: { list: p?.list.total, hold1m: p?.hold1m.total, hold3m: p?.hold3m.total, bench: r.result.portfolio.bench },
      })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message || 'Test yapılamadı')
    } finally {
      if (abort.current === ac) setStep(null)
    }
  }

  return (
    <div className="bt">
      <CondChips conditions={screen.conditions} />
      <p className="lede" style={{ marginTop: 10 }}>
        Liste geçmişte her işlem gününün kapanışıyla yeniden hesaplanır. Hangi hisse ne zaman girdi, kaç gün kaldı, girdikten ve çıktıktan sonra ne oldu, görürsün.
      </p>

      <div className="bt-controls">
        <Segmented value={years} onChange={setYears} label="Dönem" options={[{ value: 0.5, label: 'Son 6 ay' }, { value: 1, label: '1 yıl' }, { value: 2, label: '2 yıl' }, { value: 3, label: '3 yıl' }]} />
        {mine && <Segmented value={uni} onChange={setUni} label="Evren" options={[{ value: 'MY_LIST', label: 'Listem' }, { value: 'BIST', label: 'Tüm BIST' }, { value: 'US', label: 'ABD' }]} />}
        {step ? (
          <button className="btn" onClick={() => abort.current?.abort()}><Icon name="close" />Durdur</button>
        ) : (
          <button className="btn primary" onClick={() => void start()} disabled={available === false}><Icon name="play" />{run ? 'Yeniden test et' : 'Testi başlat'}</button>
        )}
      </div>
      {available === false && <p className="note" style={{ color: 'var(--down)' }}>Bu yayında günlük fiyat geçmişi yok; geçmişte test için uygulamayı sunucuyla çalıştırın (npm start).</p>}

      <details className="bt-how">
        <summary>Koşullar geçmişte nasıl hesaplanıyor</summary>
        <ul>
          {support.map((s) => (
            <li key={s.id}><span className={'lvl ' + s.level}>{s.level === 'exact' ? 'Tam' : s.level === 'approx' ? 'Yaklaşık' : 'Sabit'}</span><b>{termForField(s.id) ? <a href={`#/sozluk/${termForField(s.id)!.id}`}>{s.label}</a> : s.label}</b>: {s.how}</li>
          ))}
          <li><span className="lvl approx">Not</span>Evren bugünkü hisselerden oluşur{screen.universe === 'US' ? ' (ABD’de piyasa değeri en büyük 400)' : ''}; bu sürede borsadan çıkanlar dahil değildir.</li>
          <li><span className="lvl exact">Not</span>Giriş ve çıkış o günün kapanışıyla. Portföylerde her alım ve satışta %0,15 işlem ücreti düşülür; temettüler dahil değildir.</li>
        </ul>
      </details>

      {step && <Progress step={step} />}
      {error && <p className="note" style={{ color: 'var(--down)' }}>{error}</p>}
      {error && mine && uni === 'MY_LIST' && !step && <TryWider count={0} onTry={(u) => void start(u)} />}
      {run && !step && <Results run={run} screen={target(uni)} onTry={mine && uni === 'MY_LIST' ? (u) => void start(u) : undefined} />}
    </div>
  )
}

function Progress({ step }: { step: BtStep }) {
  const label = step.step === 'universe' ? 'Hisseler alınıyor…'
    : step.step === 'daily' ? `Günlük fiyatlar yükleniyor: ${step.done} / ${step.total}`
      : step.step === 'monthly' ? `Aylık geçmiş yükleniyor: ${step.done} / ${step.total}`
        : `Her gün yeniden hesaplanıyor: ${step.done} / ${step.total} hisse`
  const frac = step.step === 'universe' ? 0.03 : step.total ? step.done / step.total : 0
  const base = step.step === 'universe' ? 0 : step.step === 'daily' ? 0.05 : step.step === 'monthly' ? 0.5 : 0.75
  const span = step.step === 'daily' ? 0.45 : step.step === 'monthly' ? 0.25 : 0.25
  return (
    <div className="bt-progress" role="status" aria-live="polite">
      <div className="bar"><span style={{ width: `${Math.round((base + frac * span) * 100)}%` }} /></div>
      <span>{label}</span>
    </div>
  )
}

type Mode = 'list' | 'hold1m' | 'hold3m'
const MODES: { value: Mode; label: string; note: string }[] = [
  { value: 'list', label: 'Listede kaldıkça', note: 'Her gün listedekilere eşit ağırlıkla yatırım, ertesi günün kapanışına kadar. Listeden çıkan satılır; liste boşken nakitte.' },
  { value: 'hold1m', label: '1 ay tut', note: 'Listeye giren her hisse girdiği günün kapanışında alınır ve 1 ay (21 işlem günü) tutulur; eldekilere eşit ağırlık.' },
  { value: 'hold3m', label: '3 ay tut', note: 'Listeye giren her hisse girdiği günün kapanışında alınır ve 3 ay (63 işlem günü) tutulur; eldekilere eşit ağırlık.' },
]

function TryWider({ count, onTry }: { count: number; onTry: (u: Universe) => void }) {
  return (
    <div className="bt-try">
      <p>{count ? `Listende bu koşulların uygulanabildiği ${count} hisse var.` : 'Listende test edilecek hisse yok.'} Koşulların geçmişte nasıl çalıştığını görmek için aynı koşulları geniş bir evrende dene; listen değişmez.</p>
      <div className="row-actions">
        <button className="btn" onClick={() => onTry('BIST')}>Tüm BIST’te dene</button>
        <button className="btn" onClick={() => onTry('US')}>ABD’de dene</button>
      </div>
    </div>
  )
}

function Results({ run, screen, onTry }: { run: BtRun; screen: Screen; onTry?: (u: Universe) => void }) {
  const r = run.result
  const [mode, setMode] = useState<Mode>('list')
  const rel = useMemo(() => reliability(r, screen), [r, screen])
  const port = r.portfolios?.[mode] ?? r.portfolio
  const span = run.years === 0.5 ? 'Son 6 ayda' : `Son ${run.years} yılda`
  const bench = run.benchmarkName
  // Listemde az hisse: aynı koşulları geniş evrende denemeyi öner
  const tryWider = onTry && r.tested < 10 && <TryWider count={r.tested} onTry={onTry} />
  if (!r.episodes.length) {
    return (
      <>
        <div className="empty" style={{ paddingTop: 30, paddingBottom: 10 }}>
          <h2>{span} bu listeye giren olmadı</h2>
          <p>{r.tested} hisse her gün tarandı. {blocker(screen, r)}</p>
        </div>
        {tryWider}
        <section className="bt-sect">
          <h2>Koşullar ne sıklıkla sağlandı</h2>
          <ConditionTable screen={screen} result={r} />
        </section>
      </>
    )
  }
  return (
    <>
      <p className="bt-lead">
        {span} <b className="num">{r.distinct}</b> hisse toplam <b className="num">{r.episodes.length}</b> kez listeye girdi.
        Listede ortada <b className="num">{Fmt.number(r.stay.median ?? 0, 0)}</b> işlem günü kaldı
        (ortalama {Fmt.number(r.stay.mean ?? 0, 1)}, en uzun {r.stay.max}).
        {r.currentMembers.length ? <> Şu an <b className="num">{r.currentMembers.length}</b> hisse listede.</> : ' Şu an listede hisse yok.'}
      </p>
      <p className="note">{r.tested} hisse test edildi{run.missing ? `, ${run.missing} hissenin günlük geçmişi yok` : ''}. {fmtDay(r.startDay)} – {fmtDay(r.endDay)}.</p>

      {tryWider}
      <ReliabilityPanel rel={rel} years={run.years} bench={bench} />

      <section className="bt-sect">
        <h2>Girdikten sonra</h2>
        <HorizonTable stats={r.afterEntry} bench={bench} />
      </section>
      <section className="bt-sect">
        <h2>Çıktıktan sonra</h2>
        <p className="note" style={{ marginTop: -4 }}>Listeden çıktığı günün kapanışından itibaren. Hâlâ listede olanlar dahil değil.</p>
        <HorizonTable stats={r.afterExit} bench={bench} />
      </section>
      <section className="bt-sect">
        <h2>Listeyi takip etseydin</h2>
        <Segmented value={mode} onChange={setMode} label="Portföy" options={MODES.map(({ value, label }) => ({ value, label }))} />
        <p className="note" style={{ marginTop: 8 }}>{MODES.find((m) => m.value === mode)!.note}</p>
        <Curve result={r} benchName={bench} mode={mode} />
        <dl className="bt-kv">
          <div><dt>Portföy</dt><dd className={'num ' + tone(port.total)}>{pct1(port.total)}</dd></div>
          {bench && <div><dt>{bench}</dt><dd className={'num ' + tone(r.portfolio.bench)}>{pct1(r.portfolio.bench)}</dd></div>}
          <div><dt>En büyük düşüş</dt><dd className="num">{pct1(port.maxDrawdown)}</dd></div>
          <div><dt>Ortalama hisse sayısı</dt><dd className="num">{Fmt.number(port.avgMembers ?? 0, 1)}</dd></div>
          <div><dt>Yatırımda geçen gün</dt><dd className="num">{port.daysInvested} / {Math.max(0, r.curve.length - 1)}</dd></div>
          {port.costPaid != null && port.costPaid > 0 && <div><dt>İşlem ücreti</dt><dd className="num">{pct1(-port.costPaid)}</dd></div>}
        </dl>
      </section>
      <details className="bt-how" style={{ marginTop: 22 }}>
        <summary>Koşullar ne sıklıkla sağlandı</summary>
        <ConditionTable screen={screen} result={r} />
      </details>
      <section className="bt-sect">
        <h2>Girişler</h2>
        <EpisodeTable episodes={r.episodes} />
      </section>
      {r.notes.map((n, i) => <p key={i} className="note">{n}</p>)}
    </>
  )
}

const pct0 = (v: number) => '%' + Fmt.number(v * 100, v > 0 && v < 0.01 ? 1 : 0)

/** Hiç giriş olmadığında nedenini tek cümleyle: hesaplanamayan ya da en seyrek sağlanan koşul. */
function blocker(screen: Screen, r: BtResult): string {
  const c = screen.conditions, st = r.conditions
  if (!c.length || !st?.length) return 'Koşulları gevşetmeyi ya da dönemi uzatmayı dene.'
  const never = c.findIndex((_, k) => st[k].known === 0)
  if (never >= 0) return `“${describe(c[never])}” hiçbir hissede hesaplanamadı${naReason(c[never]) ? `: ${naReason(c[never])}` : ''}.`
  const none = c.findIndex((_, k) => st[k].passed === 0)
  if (none >= 0) return `“${describe(c[none])}” hiçbir gün sağlanmadı; eşiği gevşetmeyi dene.`
  if (screen.matchAll) return 'Koşullar tek tek sağlanıyor ama aynı gün birlikte sağlanmadı. Aşağıdaki tabloda en seyrek olanı gevşetmeyi dene.'
  return 'Koşulları gevşetmeyi ya da dönemi uzatmayı dene.'
}

function naReason(c: Condition): string | undefined {
  const f = [c.left, c.right].filter((x): x is NonNullable<typeof x> => !!x)
  if (f.includes('PE_5Y_AVG')) return 'en az 3 kârlı mali yıl ve aylık fiyat geçmişi gerekir'
  if (f.some((x) => ['LOW_5Y', 'HIGH_5Y', 'PERF_5Y'].includes(x))) return 'aylık fiyat geçmişi gerekir'
  if (f.some((x) => ['PE', 'PS', 'EV_EBITDA', 'DIV_YIELD', 'PB', 'ROE', 'NET_MARGIN', 'DEBT_EQ', 'EPS_GROWTH_1Y', 'EPS_CAGR_5Y', 'REV_GROWTH_1Y'].includes(x)))
    return 'yıllık bilanço verisi gerekir (endeks, fon ve sertifikalarda yok)'
  return undefined
}

function ConditionTable({ screen, result }: { screen: Screen; result: BtResult }) {
  const st: ConditionStat[] = result.conditions ?? []
  const days = result.symbolDays || 1
  return (
    <table className="result-table bt-table">
      <thead><tr><th>Koşul</th><th className="r">Hesaplanabildi</th><th className="r">Sağlandı</th><th className="r hide-s">Sağlayan hisse</th></tr></thead>
      <tbody>
        {screen.conditions.map((c, k) => {
          const s = st[k]
          if (!s) return null
          return (
            <tr key={k}>
              <td>{describe(c)}{s.known === 0 && naReason(c) ? <span className="s">{naReason(c)}</span> : null}</td>
              <td className="r num">{pct0(s.known / days)}<span className="s">{s.symbols} hisse</span></td>
              <td className={'r num' + (s.passed === 0 ? ' neg' : '')}>{s.known ? pct0(s.passed / s.known) : '—'}<span className="s">günlerin</span></td>
              <td className="r num hide-s">{s.passedSymbols}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function HorizonTable({ stats, bench }: { stats: HorizonStat[]; bench?: string }) {
  return (
    <table className="result-table bt-table">
      <thead>
        <tr>
          <th>Süre</th><th className="r">Ortalama</th><th className="r">Medyan</th><th className="r">Yükselen</th>
          {bench && <th className="r hide-s">{bench}</th>}{bench && <th className="r">Endekse göre</th>}<th className="r hide-s">Örnek</th>
        </tr>
      </thead>
      <tbody>
        {stats.map((s) => (
          <tr key={s.horizon}>
            <td>{horizonLabel(s.horizon)}</td>
            <td className={'r num ' + tone(s.mean)}>{pct1(s.mean)}</td>
            <td className={'r num ' + tone(s.median)}>{pct1(s.median)}</td>
            <td className="r num">{s.hitRate == null ? '—' : '%' + Fmt.number(s.hitRate * 100, 0)}</td>
            {bench && <td className={'r num hide-s ' + tone(s.benchMean)}>{pct1(s.benchMean)}</td>}
            {bench && <td className={'r num ' + tone(s.excessMean)}>{s.excessMean == null ? '—' : pct1(s.excessMean).replace('%', '') + ' puan'}</td>}
            <td className="r num hide-s">{s.n}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Liste portföyü ve endeks: değer eğrisi, üzerine gelince o günün değerleri. */
function Curve({ result, benchName, mode }: { result: BtResult; benchName?: string; mode: Mode }) {
  const pts = useMemo(() => result.curve.map((p) => ({ ...p, list: (mode === 'list' ? p.list : p[mode]) ?? p.list })), [result, mode])
  const total = (result.portfolios?.[mode] ?? result.portfolio).total
  const [hover, setHover] = useState<number | null>(null)
  const W = 760, H = 240, P = { l: 8, r: 54, t: 14, b: 24 }
  const ys = pts.flatMap((p) => [p.list, p.bench ?? p.list])
  const min = Math.min(...ys), max = Math.max(...ys)
  const pad = (max - min) * 0.08 || 0.05
  const lo = min - pad, hi = max + pad
  const x = (i: number) => P.l + (i / Math.max(1, pts.length - 1)) * (W - P.l - P.r)
  const y = (v: number) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b)
  const path = (get: (p: (typeof pts)[0]) => number | undefined) =>
    pts.map((p, i) => { const v = get(p); return v == null ? '' : `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}` }).join('')
  const ticks = niceTicks(lo, hi)
  const h = hover != null ? pts[hover] : undefined
  return (
    <div className="bt-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Portföy ${pct1(total)}${benchName ? `, ${benchName} ${pct1(result.portfolio.bench)}` : ''}`}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          const fx = ((e.clientX - r.left) / r.width) * W
          setHover(Math.max(0, Math.min(pts.length - 1, Math.round(((fx - P.l) / (W - P.l - P.r)) * (pts.length - 1)))))
        }}
        onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className={t === 1 ? 'base' : 'grid'} />
            <text x={W - P.r + 6} y={y(t) + 4} className="tick">{pct1(t - 1)}</text>
          </g>
        ))}
        {pts[0]?.bench != null && <path d={path((p) => p.bench)} className="bench" />}
        <path d={path((p) => p.list)} className="list" />
        <text x={P.l} y={H - 6} className="tick">{fmtDay(pts[0]?.day ?? 0)}</text>
        <text x={W - P.r} y={H - 6} className="tick" textAnchor="end">{fmtDay(pts.at(-1)?.day ?? 0)}</text>
        {h && hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} className="cursor" />
            <circle cx={x(hover)} cy={y(h.list)} r={4} className="dot" />
          </g>
        )}
      </svg>
      <div className="bt-legend">
        {h ? (
          <>
            <span>{fmtDay(h.day)}</span>
            <span><i className="sw list" />Portföy {pct1(h.list - 1)}{mode === 'list' ? `, ${h.members} hisse` : ''}</span>
            {h.bench != null && <span><i className="sw bench" />{benchName} {pct1(h.bench - 1)}</span>}
          </>
        ) : (
          <>
            <span><i className="sw list" />Portföy</span>
            {benchName && <span><i className="sw bench" />{benchName}</span>}
            <span style={{ color: 'var(--ink-3)' }}>Ayrıntı için grafiğin üzerine gel</span>
          </>
        )}
      </div>
    </div>
  )
}

function niceTicks(lo: number, hi: number): number[] {
  const span = hi - lo
  const step = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5].find((s) => span / s <= 5) ?? 10
  const out: number[] = []
  for (let t = Math.ceil(lo / step) * step; t <= hi + 1e-9; t += step) out.push(Math.round(t * 1000) / 1000)
  return out
}

type SortKey = 'entry' | 'name' | 'days' | 'in' | 'e21' | 'e63' | 'x21'

function EpisodeTable({ episodes }: { episodes: Episode[] }) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'entry', desc: true })
  const [limit, setLimit] = useState(100)
  const rows = useMemo(() => {
    const n = fold(q.trim())
    const list = episodes.filter((e) => !n || fold(`${e.name} ${e.symbol}`).includes(n))
    const val = (e: Episode): number | string => {
      switch (sort.key) {
        case 'entry': return e.entryDay
        case 'name': return e.name
        case 'days': return e.tradingDays
        case 'in': return e.returnIn
        case 'e21': return e.afterEntry[1] ?? -Infinity
        case 'e63': return e.afterEntry[2] ?? -Infinity
        case 'x21': return e.afterExit[1] ?? -Infinity
      }
    }
    return [...list].sort((a, b) => {
      const x = val(a), y = val(b)
      const c = typeof x === 'string' ? x.localeCompare(y as string, 'tr') : (x as number) - (y as number)
      return sort.desc ? -c : c
    })
  }, [episodes, q, sort])
  const th = (key: SortKey, label: string, cls = 'r') => (
    <th className={cls}>
      <button className="sort" onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'name' }))} aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : undefined}>
        {label}{sort.key === key ? (sort.desc ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  )
  const csv = () => {
    const head = ['Sembol', 'Ad', 'Giriş', 'Çıkış', 'İşlem günü', 'Giriş fiyatı', 'Çıkış fiyatı', 'Listede getiri %', 'Girişten 1 hafta %', 'Girişten 1 ay %', 'Girişten 3 ay %', 'Girişten 6 ay %', 'Çıkıştan 1 ay %', 'Çıkıştan 3 ay %']
    const iso = (d?: number) => (d == null ? '' : new Date(d * DAY).toISOString().slice(0, 10))
    const p = (v?: number) => (v == null ? '' : (v * 100).toFixed(2))
    const lines = rows.map((e) => [e.symbol, `"${e.name.replace(/"/g, '""')}"`, iso(e.entryDay), iso(e.exitDay), e.tradingDays, e.entryPrice, e.exitPrice, p(e.returnIn), ...e.afterEntry.map(p), p(e.afterExit[1]), p(e.afterExit[2])].join(';'))
    const blob = new Blob(['﻿' + [head.join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'piyasa-gecmis-test.csv'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="input" style={{ maxWidth: 280 }} placeholder="Hisse ara" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Girişlerde ara" />
        <span className="note" style={{ margin: 0 }}>{rows.length} giriş</span>
        <span style={{ flex: 1 }} />
        <button className="btn small" onClick={csv}><Icon name="download" />CSV indir</button>
      </div>
      <div className="bt-scroll">
        <table className="result-table bt-table">
          <thead>
            <tr>
              {th('name', 'Hisse', '')}{th('entry', 'Giriş')}<th className="r">Çıkış</th>{th('days', 'Gün')}
              {th('in', 'Listedeyken')}{th('e21', 'Girişten 1 ay')}{th('e63', 'Girişten 3 ay')}{th('x21', 'Çıkıştan 1 ay')}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((e) => (
              <tr key={e.symbol + e.entryDay}>
                <td><a href={chartUrl(e.symbol)} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}><span className="n">{e.name}</span><span className="s">{e.symbol}</span></a></td>
                <td className="r num">{fmtDay(e.entryDay)}</td>
                <td className="r num">{e.exitDay == null ? <span className="delayed">listede</span> : fmtDay(e.exitDay)}</td>
                <td className="r num">{e.tradingDays}</td>
                <td className={'r num ' + tone(e.returnIn)} title={`En iyi ${pct1(e.bestIn)}, en kötü ${pct1(e.worstIn)}`}>{pct1(e.returnIn)}</td>
                <td className={'r num ' + tone(e.afterEntry[1])}>{pct1(e.afterEntry[1])}</td>
                <td className={'r num ' + tone(e.afterEntry[2])}>{pct1(e.afterEntry[2])}</td>
                <td className={'r num ' + tone(e.afterExit[1])}>{pct1(e.afterExit[1])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && <button className="btn" style={{ marginTop: 10 }} onClick={() => setLimit((l) => l + 200)}>Daha fazla göster ({rows.length - limit})</button>}
    </>
  )
}

