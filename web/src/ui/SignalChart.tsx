/**
 * Hisse analizi grafikleri.
 *   SignalChart  Fiyat ve sinyaller: üstte fiyat (sinyal noktaları, tetik fiyatı), altta gösterge ve eşiği.
 *                İki panel aynı zaman eksenini paylaşır; her panelin kendi dikey ekseni vardır.
 *   AfterChart   Sinyalden sonra: her sinyalin sonraki seyri, ortancası ve hissenin olağan seyri.
 * Renk tek başına anlam taşımaz: tutan sinyal dolu, tutmayan içi boş, süren kesikli halkadır.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import * as Fmt from '../core/format'
import { FILTER_LABEL, filterHolds, HORIZONS, INDICATOR_LABEL, type Bars, type Indicator, type Series, type SignalEvent, type SignalStat } from '../core/signals'

/** Grafik, kabının gerçek genişliğinde çizilir: yazılar dar ekranda küçülmez. */
function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => { const x = Math.round(el.clientWidth); if (x > 200) setW(x) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}
const PAD = { l: 8, r: 64, t: 10, b: 22 }
const pct = (v: number, d = 1) => (v > 0.00005 ? '+' : v < -0.00005 ? '−' : '') + '%' + Fmt.number(Math.abs(v * 100), d)
const price = (v: number) => Fmt.number(v, v >= 1000 ? 0 : v >= 10 ? 2 : 4)
const indVal = (ind: Indicator, v: number) => (Number.isNaN(v) ? '—' : ind === 'rsi' ? Fmt.number(v, 1) : ind === 'bb' ? (v < 0 ? '−' : '+') + Fmt.number(Math.abs(v), 1) + 'σ' : ind === 'd200' || ind === 'dd' ? pct(v, 0) : ind === 'roc' ? (v < 0 ? '−' : '+') + Fmt.number(Math.abs(v), 1) + 'σ' : pct(v, 2))
const dayFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
const hourFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
const yearFmt = new Intl.DateTimeFormat('tr-TR', { year: 'numeric' })
const monthFmt = new Intl.DateTimeFormat('tr-TR', { month: 'short', year: '2-digit' })

type Outcome = 'hit' | 'miss' | 'open'
const outcome = (e: SignalEvent, sign: number): Outcome => (e.ret[1] == null ? 'open' : e.ret[1] * sign > 0 ? 'hit' : 'miss')
const OUTCOME_LABEL: Record<Outcome, string> = { hit: 'tuttu', miss: 'tutmadı', open: 'sonucu bekleniyor' }

function Mark({ x, y, o, r = 4.5 }: { x: number; y: number; o: Outcome; r?: number }) {
  return <circle cx={x} cy={y} r={r} className={'sc-mark ' + o} />
}

export function Legend({ children }: { children?: ReactNode }) {
  return (
    <p className="sc-legend">
      <span><svg viewBox="0 0 12 12" aria-hidden><Mark x={6} y={6} o="hit" r={4} /></svg>tuttu</span>
      <span><svg viewBox="0 0 12 12" aria-hidden><Mark x={6} y={6} o="miss" r={4} /></svg>tutmadı</span>
      <span><svg viewBox="0 0 12 12" aria-hidden><Mark x={6} y={6} o="open" r={4} /></svg>sonucu bekleniyor</span>
      {children}
    </p>
  )
}

interface Props { bars: Bars; series: Series; stat: SignalStat; trigger?: number; horizon: string }

export function SignalChart({ bars, series, stat, trigger, horizon }: Props) {
  const { c, t } = bars
  const n = c.length
  const ind = stat.trigger.ind
  const sign = stat.side === 'dip' ? 1 : -1
  const intraday = stat.tf === 'H4' || stat.tf === 'H1'
  const PH = 230, IH = 96, GAP = 14
  const H = PAD.t + PH + GAP + IH + PAD.b
  const [hover, setHover] = useState<number | undefined>()
  const [box, W] = useWidth(720)

  const g = useMemo(() => {
    // Göstergenin hesaplanamadığı ilk çubuklar atlanır; çok uzun seriler seyreltilir (sinyal çubukları korunur)
    const v = series[ind]
    let start = 0
    while (start < n - 60 && Number.isNaN(v[start])) start++
    const keep = new Set(stat.events.map((e) => e.i))
    const stride = Math.max(1, Math.ceil((n - start) / 900))
    const idx: number[] = []
    for (let i = start; i < n; i++) if ((i - start) % stride === 0 || i === n - 1 || keep.has(i)) idx.push(i)
    const x = (i: number) => PAD.l + ((i - start) / Math.max(1, n - 1 - start)) * (W - PAD.l - PAD.r)
    let lo = Infinity, hi = -Infinity
    for (let i = start; i < n; i++) { if (c[i] < lo) lo = c[i]; if (c[i] > hi) hi = c[i] }
    if (trigger != null && trigger > lo * 0.5 && trigger < hi * 1.5) { lo = Math.min(lo, trigger); hi = Math.max(hi, trigger) }
    const log = hi / lo > 4 // büyük yükselişlerde eski hareketler de okunabilsin
    const f = (p: number) => (log ? Math.log(p) : p)
    const span = f(hi) - f(lo) || 1
    const y = (p: number) => PAD.t + PH - 6 - ((f(p) - f(lo)) / span) * (PH - 12)
    let vlo = Infinity, vhi = -Infinity
    for (let i = start; i < n; i++) if (!Number.isNaN(v[i])) { if (v[i] < vlo) vlo = v[i]; if (v[i] > vhi) vhi = v[i] }
    vlo = Math.min(vlo, stat.level); vhi = Math.max(vhi, stat.level)
    const top = PAD.t + PH + GAP
    const vy = (q: number) => top + IH - 4 - ((q - vlo) / (vhi - vlo || 1)) * (IH - 8)
    const line = (get: (i: number) => number, map: (q: number) => number) => {
      let d = '', pen = false
      for (const i of idx) { const q = get(i); if (Number.isNaN(q)) { pen = false; continue }; d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${map(q).toFixed(1)}`; pen = true }
      return d
    }
    // Zaman ekseni: 4–5 etiket
    const ticks: { x: number; label: string }[] = []
    const years = (t[n - 1] - t[start]) / (365.25 * 86400)
    for (let k = 0; k <= 4; k++) {
      const i = Math.round(start + ((n - 1 - start) * k) / 4)
      ticks.push({ x: x(i), label: (years > 3 ? yearFmt : monthFmt).format(t[i] * 1000) })
    }
    // Keşif ve doğrulama dönemlerini ayıran çubuk
    let cut = start
    while (cut < n - 1 && t[cut] < stat.test.cutTime) cut++
    return { start, cut, x, y, vy, top, log, lo, hi, vlo, vhi, price: line((i) => c[i], y), ind: line((i) => v[i], vy), sma200: stat.filter !== 'any' ? line((i) => series.sma200[i], y) : '', sma50: stat.filter === 'up' || stat.filter === 'down' ? line((i) => series.sma50[i], y) : '', ticks }
  }, [bars, series, stat, trigger, W])

  const v = series[ind]
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    const i = Math.round(g.start + ((px - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1 - g.start))
    // Sinyal noktasına yakınsa ona yapış
    let best = Math.max(g.start, Math.min(n - 1, i)), near = 10
    for (const ev of stat.events) { const d = Math.abs(g.x(ev.i) - px); if (d < near) { near = d; best = ev.i } }
    setHover(best)
  }
  const hv = hover != null ? stat.events.find((e) => e.i === hover) : undefined
  const below = stat.trigger.dir === 'below'
  const zone = below ? { y: g.vy(stat.level), h: g.top + IH - g.vy(stat.level) } : { y: g.top, h: g.vy(stat.level) - g.top }
  const hits = stat.events.filter((e) => outcome(e, sign) === 'hit').length, misses = stat.events.filter((e) => outcome(e, sign) === 'miss').length
  const label = `Fiyat grafiği: ${stat.events.length} sinyal; ${hits} tuttu, ${misses} tutmadı. Alt panelde ${INDICATOR_LABEL[ind]} ve eşiği.`
  return (
    <figure className="sc">
      <figcaption>Fiyat ve sinyaller<span>{stat.events.length} sinyal; nokta, sinyalin geldiği yer. Rengi {horizon} sonraki sonucu gösterir.</span></figcaption>
      <div className="sc-plot" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} onPointerMove={onMove} onPointerLeave={() => setHover(undefined)}>
          <line className="sc-axis" x1={PAD.l} x2={W - PAD.r} y1={PAD.t + PH} y2={PAD.t + PH} />
          <line className="sc-axis" x1={PAD.l} x2={W - PAD.r} y1={g.top + IH} y2={g.top + IH} />
          {g.ticks.map((k, i) => <text key={i} className="sc-tick" x={k.x} y={H - 6} textAnchor={i === 0 ? 'start' : i === g.ticks.length - 1 ? 'end' : 'middle'}>{k.label}</text>)}
          {g.cut > g.start && g.cut < n - 1 && (
            <>
              <line className="sc-split" x1={g.x(g.cut)} x2={g.x(g.cut)} y1={PAD.t} y2={PAD.t + PH} />
              <text className="sc-tick" x={g.x(g.cut) - 6} y={PAD.t + 10} textAnchor="end">keşif</text>
              <text className="sc-tick" x={g.x(g.cut) + 6} y={PAD.t + 10}>doğrulama</text>
            </>
          )}
          {g.sma200 && <path d={g.sma200} className="sc-ma" />}
          {g.sma50 && <path d={g.sma50} className="sc-ma fast" />}
          <path d={g.price} className="sc-price" />
          {trigger != null && trigger >= g.lo && trigger <= g.hi && (
            <>
              <line className="sc-level" x1={PAD.l} x2={W - PAD.r} y1={g.y(trigger)} y2={g.y(trigger)} />
              <text className="sc-tag" x={W - PAD.r + 6} y={g.y(trigger) + (trigger < c[n - 1] ? 14 : -7)}>tetik {price(trigger)}</text>
            </>
          )}
          <circle className="sc-now" cx={g.x(n - 1)} cy={g.y(c[n - 1])} r={3.5} />
          <text className="sc-tag strong" x={W - PAD.r + 6} y={g.y(c[n - 1]) + (trigger != null && trigger < c[n - 1] ? -6 : trigger != null ? 14 : 4)}>{price(c[n - 1])}</text>
          {stat.events.map((e) => <Mark key={e.i} x={g.x(e.i)} y={g.y(e.price)} o={outcome(e, sign)} />)}

          <rect className="sc-zone" x={PAD.l} width={W - PAD.l - PAD.r} y={zone.y} height={Math.max(0, zone.h)} />
          <path d={g.ind} className="sc-ind" />
          <line className="sc-level" x1={PAD.l} x2={W - PAD.r} y1={g.vy(stat.level)} y2={g.vy(stat.level)} />
          <text className="sc-tag" x={W - PAD.r + 6} y={g.vy(stat.level) + 4}>{ind === 'macd' ? 'kesişim' : 'eşik ' + (ind === 'rsi' ? stat.level : indVal(ind, stat.level))}</text>
          <text className="sc-tick" x={PAD.l} y={g.top + 11}>{INDICATOR_LABEL[ind]}{ind === 'macd' ? ' (sinyal çizgisine göre)' : ''}</text>
          {stat.events.map((e) => <circle key={e.i} className="sc-pin" cx={g.x(e.i)} cy={g.vy(v[e.i])} r={2} />)}

          {hover != null && (
            <>
              <line className="sc-cursor" x1={g.x(hover)} x2={g.x(hover)} y1={PAD.t} y2={g.top + IH} />
              <circle className="sc-now" cx={g.x(hover)} cy={g.y(c[hover])} r={3.5} />
            </>
          )}
        </svg>
        {hover != null && (
          <div className="sc-tip" style={{ left: `${(g.x(hover) / W) * 100}%` }} data-side={g.x(hover) > W * 0.6 ? 'left' : 'right'}>
            <span>{(intraday ? hourFmt : dayFmt).format(t[hover] * 1000)}</span>
            <b className="num">{price(c[hover])}</b>
            <span>{INDICATOR_LABEL[ind]} <b className="num">{ind === 'macd' ? (v[hover] >= 0 ? 'üstünde' : 'altında') : indVal(ind, v[hover])}</b></span>
            {hv && <span className="ev">Sinyal: {horizon} sonra <b className="num">{hv.ret[1] == null ? 'bekleniyor' : pct(hv.ret[1])}</b> ({OUTCOME_LABEL[outcome(hv, sign)]})</span>}
          </div>
        )}
      </div>
      <Legend>
        <span><i className="k dash" />{ind === 'macd' ? 'kesişim düzeyi' : 'eşik ve tetik fiyatı'}</span>
        {g.sma200 && <span><i className="k ma" />200 ortalama</span>}
        {g.sma50 && <span><i className="k ma fast" />50 ortalama</span>}
        {g.log && <span>dikey eksen logaritmik</span>}
      </Legend>
      {stat.filter !== 'any' && <p className="sc-note">Yalnızca {FILTER_LABEL[stat.filter]} gelen sinyaller sayılır.</p>}
    </figure>
  )
}

/** Sinyalden sonra: her sinyalin sonraki seyri (ince), ortancası (kalın) ve hissenin olağan seyri (kesikli). */
export function AfterChart({ bars, series, stat, unit }: { bars: Bars; series: Series; stat: SignalStat; unit: (bars: number) => string }) {
  const { c } = bars
  const sign = stat.side === 'dip' ? 1 : -1
  const [, main, long] = HORIZONS[stat.tf]
  const span = Math.min(long, main * 2)
  const [box, AW] = useWidth(720)
  const AH = 250, P = { l: 44, r: 112, t: 12, b: 26 }
  const [hover, setHover] = useState<number | undefined>()
  const g = useMemo(() => {
    const steps = Array.from({ length: span + 1 }, (_, k) => k)
    const paths = stat.events.map((e) => steps.filter((k) => e.i + k < c.length).map((k) => c[e.i + k] / e.price - 1))
    const med = (list: number[]) => { if (!list.length) return NaN; const s = [...list].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
    const median = steps.map((k) => med(paths.filter((p) => p.length > k).map((p) => p[k])))
    // Olağan seyir: bağlamı sağlayan her çubuktan sonraki ortanca (seyrek örneklenir)
    const from: number[] = []
    for (let j = 14; j + span < c.length; j++) if (filterHolds(stat.filter, c, series, j)) from.push(j)
    const pick = from.length > 600 ? from.filter((_, i) => i % Math.ceil(from.length / 600) === 0) : from
    const base = steps.map((k) => med(pick.map((j) => c[j + k] / c[j] - 1)))
    // Dikey aralık: uç sinyaller grafiği ezmesin diye %5–%95 arası
    const all = paths.flat().sort((a, b) => a - b)
    const q = (p: number) => all[Math.min(all.length - 1, Math.max(0, Math.floor(p * all.length)))] ?? 0
    const lo = Math.min(q(0.03), -0.01, ...base.filter((x) => !Number.isNaN(x))), hi = Math.max(q(0.97), 0.01, ...base.filter((x) => !Number.isNaN(x)))
    const x = (k: number) => P.l + (k / span) * (AW - P.l - P.r)
    const y = (r: number) => P.t + (AH - P.t - P.b) * (1 - (Math.max(lo, Math.min(hi, r)) - lo) / (hi - lo))
    const d = (p: number[]) => p.map((r, k) => (Number.isNaN(r) ? '' : `${k && !Number.isNaN(p[k - 1]) ? 'L' : 'M'}${x(k).toFixed(1)} ${y(r).toFixed(1)}`)).join('')
    return { paths, median, base, x, y, d, lo, hi }
  }, [bars, series, stat, AW])
  const end = (p: number[]) => p[Math.min(main, p.length - 1)]
  const mEnd = g.median[main], bEnd = g.base[main]
  // Uç etiketleri: çizgilerin bittiği yerde, üst üste gelirse aralanır
  let my = g.y(g.median[span] ?? mEnd) + 4, by = g.y(g.base[span] ?? bEnd) + 4
  if (Math.abs(my - by) < 14) { const mid = (my + by) / 2, up = my <= by; my = mid + (up ? -7 : 7); by = mid + (up ? 7 : -7) }
  const ticks = [g.lo, 0, g.hi]
  return (
    <figure className="sc after">
      <figcaption>Sinyalden sonra<span>Her çizgi bir sinyal; sıfır, sinyalin geldiği fiyat.</span></figcaption>
      <div className="sc-plot" ref={box}>
        <svg viewBox={`0 0 ${AW} ${AH}`} role="img" aria-label={`Sinyalden sonraki seyir: ${unit(main)} sonra ortanca ${Number.isNaN(mEnd) ? 'yok' : pct(mEnd)}, olağan ${Number.isNaN(bEnd) ? 'yok' : pct(bEnd)}.`}
          onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const k = Math.round((((e.clientX - r.left) / r.width) * AW - P.l) / (AW - P.l - P.r) * span); setHover(k >= 0 && k <= span ? k : undefined) }}
          onPointerLeave={() => setHover(undefined)}>
          {ticks.map((r, i) => <g key={i}><line className={r === 0 ? 'sc-zero' : 'sc-grid'} x1={P.l} x2={AW - P.r} y1={g.y(r)} y2={g.y(r)} /><text className="sc-tick" x={P.l - 6} y={g.y(r) + 4} textAnchor="end">{pct(r, 0)}</text></g>)}
          <line className="sc-level" x1={g.x(main)} x2={g.x(main)} y1={P.t} y2={AH - P.b} />
          <text className="sc-tick" x={g.x(0)} y={AH - 7}>sinyal</text>
          <text className="sc-tick" x={g.x(main)} y={AH - 7} textAnchor="middle">{unit(main)}</text>
          {span > main * 1.3 && <text className="sc-tick" x={g.x(span)} y={AH - 7} textAnchor="end">{unit(span)}</text>}
          {g.paths.map((p, i) => <path key={i} d={g.d(p)} className={'sc-path ' + (p.length <= main ? 'open' : end(p) * sign > 0 ? 'hit' : 'miss')} />)}
          <path d={g.d(g.base)} className="sc-base" />
          <path d={g.d(g.median)} className="sc-median" />
          {!Number.isNaN(mEnd) && <><circle className="sc-now" cx={g.x(main)} cy={g.y(mEnd)} r={4} /><text className="sc-tag strong" x={AW - P.r + 8} y={my}>ortanca {pct(g.median[span] ?? mEnd)}</text></>}
          {!Number.isNaN(bEnd) && <text className="sc-tag" x={AW - P.r + 8} y={by}>olağan {pct(g.base[span] ?? bEnd)}</text>}
          {hover != null && <line className="sc-cursor" x1={g.x(hover)} x2={g.x(hover)} y1={P.t} y2={AH - P.b} />}
        </svg>
        {hover != null && (
          <div className="sc-tip" style={{ left: `${(g.x(hover) / AW) * 100}%` }} data-side={hover > span * 0.5 ? 'left' : 'right'}>
            <span>{hover === 0 ? 'Sinyal anı' : unit(hover) + ' sonra'}</span>
            <span><i className="k solid" />ortanca <b className="num">{Number.isNaN(g.median[hover]) ? '—' : pct(g.median[hover])}</b></span>
            <span><i className="k dash" />olağan <b className="num">{Number.isNaN(g.base[hover]) ? '—' : pct(g.base[hover])}</b></span>
          </div>
        )}
      </div>
      <p className="sc-legend">
        <span><i className="k solid" />sinyallerin ortancası</span>
        <span><i className="k dash" />hissenin olağan seyri</span>
        <span><i className="k thin hit" />tutan</span>
        <span><i className="k thin miss" />tutmayan sinyal</span>
      </p>
    </figure>
  )
}

/** İsabet oranı çubuğu: nokta sinyalin isabeti, çentik olağan isabet. */
export function HitBar({ hit, base }: { hit?: number; base?: number }) {
  if (hit == null) return null
  return (
    <span className="hitbar" aria-hidden>
      {base != null && <i className="b" style={{ left: `${base * 100}%` }} />}
      <i className={'h' + (base != null && hit > base ? ' good' : '')} style={{ left: `${hit * 100}%` }} />
    </span>
  )
}

/** Kurulumun bu hissede oluştuğu günler: günlük fiyat üzerinde noktalar (3 ay sonraki sonuca göre). */
export function EventChart({ bars, events, side }: { bars: Bars; events: { i: number; t: number; price: number; ret?: number }[]; side: 'dip' | 'top' }) {
  const { c, t } = bars
  const n = c.length
  const [box, W] = useWidth(720)
  const H = 220, P = { l: 8, r: 64, t: 10, b: 22 }
  const [hover, setHover] = useState<number | undefined>()
  const sign = side === 'dip' ? 1 : -1
  const out = (e: { ret?: number }): Outcome => (e.ret == null ? 'open' : e.ret * sign > 0 ? 'hit' : 'miss')
  const g = useMemo(() => {
    const keep = new Set(events.map((e) => e.i))
    const stride = Math.max(1, Math.ceil(n / 900))
    const idx: number[] = []
    for (let i = 0; i < n; i++) if (i % stride === 0 || i === n - 1 || keep.has(i)) idx.push(i)
    let lo = Infinity, hi = -Infinity
    for (const v of c) { if (v < lo) lo = v; if (v > hi) hi = v }
    const log = hi / lo > 4
    const f = (p: number) => (log ? Math.log(p) : p)
    const x = (i: number) => P.l + (i / Math.max(1, n - 1)) * (W - P.l - P.r)
    const y = (p: number) => P.t + (H - P.t - P.b) - 6 - ((f(p) - f(lo)) / (f(hi) - f(lo) || 1)) * (H - P.t - P.b - 12)
    const d = idx.map((i, k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)} ${y(c[i]).toFixed(1)}`).join('')
    const ticks = [0, 1, 2, 3, 4].map((k) => { const i = Math.round(((n - 1) * k) / 4); return { x: x(i), label: yearFmt.format(t[i] * 1000) } })
    return { x, y, d, ticks, log }
  }, [bars, events, W])
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    let best = Math.max(0, Math.min(n - 1, Math.round(((px - P.l) / (W - P.l - P.r)) * (n - 1)))), near = 12
    for (const ev of events) { const dd = Math.abs(g.x(ev.i) - px); if (dd < near) { near = dd; best = ev.i } }
    setHover(best)
  }
  const hv = hover != null ? events.find((e) => e.i === hover) : undefined
  return (
    <figure className="sc">
      <div className="sc-plot" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Günlük fiyat; kurulum ${events.length} kez oluştu`} onPointerMove={onMove} onPointerLeave={() => setHover(undefined)}>
          <line className="sc-axis" x1={P.l} x2={W - P.r} y1={H - P.b} y2={H - P.b} />
          {g.ticks.map((k, i) => <text key={i} className="sc-tick" x={k.x} y={H - 6} textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}>{k.label}</text>)}
          <path d={g.d} className="sc-price" />
          <circle className="sc-now" cx={g.x(n - 1)} cy={g.y(c[n - 1])} r={3.5} />
          <text className="sc-tag strong" x={W - P.r + 6} y={g.y(c[n - 1]) + 4}>{price(c[n - 1])}</text>
          {events.map((e) => <Mark key={e.i} x={g.x(e.i)} y={g.y(e.price)} o={out(e)} />)}
          {hover != null && <><line className="sc-cursor" x1={g.x(hover)} x2={g.x(hover)} y1={P.t} y2={H - P.b} /><circle className="sc-now" cx={g.x(hover)} cy={g.y(c[hover])} r={3.5} /></>}
        </svg>
        {hover != null && (
          <div className="sc-tip" style={{ left: `${(g.x(hover) / W) * 100}%` }} data-side={g.x(hover) > W * 0.6 ? 'left' : 'right'}>
            <span>{dayFmt.format(t[hover] * 1000)}</span>
            <b className="num">{price(c[hover])}</b>
            {hv && <span className="ev">Kurulum: 3 ay sonra <b className="num">{hv.ret == null ? 'bekleniyor' : pct(hv.ret)}</b> ({OUTCOME_LABEL[out(hv)]})</span>}
          </div>
        )}
      </div>
      <Legend>{g.log && <span>dikey eksen logaritmik</span>}</Legend>
    </figure>
  )
}

/**
 * Hissenin durumu: son ~3 yılın günlük fiyatı ve 200 günlük ortalaması; altında göreli hacim ve RSI.
 * Üç panel aynı zaman eksenini paylaşır, her birinin kendi dikey ekseni vardır.
 */
export function StateChart({ c, t, sma200, rsi, vol }: { c: number[]; t: number[]; sma200: number[]; rsi: number[]; vol: number[] }) {
  const n = c.length
  const start = Math.max(0, n - 750)
  const hasVol = vol.slice(start).some((x) => !Number.isNaN(x))
  const [box, W] = useWidth(720)
  const P = { l: 8, r: 64, t: 10, b: 22 }
  const PH = 210, VH = hasVol ? 54 : 0, RH = 70, GAP = 12
  const H = P.t + PH + (hasVol ? GAP + VH : 0) + GAP + RH + P.b
  const [hover, setHover] = useState<number | undefined>()
  const g = useMemo(() => {
    const x = (i: number) => P.l + ((i - start) / Math.max(1, n - 1 - start)) * (W - P.l - P.r)
    let lo = Infinity, hi = -Infinity
    for (let i = start; i < n; i++) { for (const v of [c[i], sma200[i]]) if (!Number.isNaN(v)) { if (v < lo) lo = v; if (v > hi) hi = v } }
    const log = hi / lo > 4
    const f = (p: number) => (log ? Math.log(p) : p)
    const y = (p: number) => P.t + PH - 6 - ((f(p) - f(lo)) / (f(hi) - f(lo) || 1)) * (PH - 12)
    const vTop = P.t + PH + GAP
    const vMax = 4 // 4 katından büyük hacimler tavanda kesilir
    const vy = (q: number) => vTop + VH - (Math.min(vMax, q) / vMax) * VH
    const rTop = vTop + (hasVol ? VH + GAP : 0)
    const ry = (q: number) => rTop + RH - 3 - (q / 100) * (RH - 6)
    const line = (get: (i: number) => number, map: (q: number) => number) => { let d = '', pen = false; for (let i = start; i < n; i++) { const q = get(i); if (Number.isNaN(q)) { pen = false; continue }; d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${map(q).toFixed(1)}`; pen = true }; return d }
    const ticks = [0, 1, 2, 3].map((k) => { const i = Math.round(start + ((n - 1 - start) * k) / 3); return { x: x(i), label: monthFmt.format(t[i] * 1000) } })
    return { x, y, vy, ry, vTop, rTop, log, price: line((i) => c[i], y), ma: line((i) => sma200[i], y), rsi: line((i) => rsi[i], ry), ticks }
  }, [c, t, sma200, rsi, vol, W])
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    setHover(Math.max(start, Math.min(n - 1, Math.round(start + ((px - P.l) / (W - P.l - P.r)) * (n - 1 - start)))))
  }
  const bw = Math.max(0.6, ((W - P.l - P.r) / Math.max(1, n - start)) * 0.7)
  const lastR = rsi[n - 1], lastV = vol[n - 1]
  return (
    <figure className="sc">
      <figcaption>Hissenin durumu<span>Son 3 yıl: günlük fiyat ve 200 günlük ortalama{hasVol ? '; hacim (50 günlük ortalamaya göre)' : ''}; RSI.</span></figcaption>
      <div className="sc-plot" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Fiyat ${price(c[n - 1])}; 200 günlük ortalama ${Number.isNaN(sma200[n - 1]) ? 'yok' : price(sma200[n - 1])}; RSI ${Number.isNaN(lastR) ? 'yok' : Fmt.number(lastR, 1)}`}
          onPointerMove={onMove} onPointerLeave={() => setHover(undefined)}>
          <line className="sc-axis" x1={P.l} x2={W - P.r} y1={P.t + PH} y2={P.t + PH} />
          {g.ticks.map((k, i) => <text key={i} className="sc-tick" x={k.x} y={H - 6} textAnchor={i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}>{k.label}</text>)}
          <path d={g.ma} className="sc-ma" />
          <path d={g.price} className="sc-price" />
          <circle className="sc-now" cx={g.x(n - 1)} cy={g.y(c[n - 1])} r={3.5} />
          <text className="sc-tag strong" x={W - P.r + 6} y={g.y(c[n - 1]) + 4}>{price(c[n - 1])}</text>
          {!Number.isNaN(sma200[n - 1]) && Math.abs(g.y(sma200[n - 1]) - g.y(c[n - 1])) > 13 && <text className="sc-tag" x={W - P.r + 6} y={g.y(sma200[n - 1]) + 4}>200 ort.</text>}

          {hasVol && (
            <>
              <text className="sc-tick" x={P.l} y={g.vTop + 10}>Hacim</text>
              {Array.from({ length: n - start }, (_, k) => start + k).filter((i) => !Number.isNaN(vol[i])).map((i) => <rect key={i} className={'sc-vol' + (vol[i] >= 2 ? ' high' : '')} x={g.x(i) - bw / 2} width={bw} y={g.vy(vol[i])} height={Math.max(0, g.vTop + VH - g.vy(vol[i]))} />)}
              <line className="sc-level" x1={P.l} x2={W - P.r} y1={g.vy(2)} y2={g.vy(2)} />
              <text className="sc-tag" x={W - P.r + 6} y={g.vy(2) + 4}>2 katı</text>
              <line className="sc-axis" x1={P.l} x2={W - P.r} y1={g.vTop + VH} y2={g.vTop + VH} />
            </>
          )}

          <rect className="sc-zone" x={P.l} width={W - P.l - P.r} y={g.ry(30)} height={g.rTop + RH - g.ry(30)} />
          <rect className="sc-zone" x={P.l} width={W - P.l - P.r} y={g.rTop} height={g.ry(70) - g.rTop} />
          <path d={g.rsi} className="sc-ind" />
          <line className="sc-level" x1={P.l} x2={W - P.r} y1={g.ry(30)} y2={g.ry(30)} />
          <line className="sc-level" x1={P.l} x2={W - P.r} y1={g.ry(70)} y2={g.ry(70)} />
          <text className="sc-tag" x={W - P.r + 6} y={g.ry(30) + 4}>30</text>
          <text className="sc-tag" x={W - P.r + 6} y={g.ry(70) + 4}>70</text>
          <text className="sc-tick" x={P.l} y={g.rTop + 10}>RSI</text>
          {!Number.isNaN(lastR) && <circle className="sc-now" cx={g.x(n - 1)} cy={g.ry(lastR)} r={3} />}

          {hover != null && <><line className="sc-cursor" x1={g.x(hover)} x2={g.x(hover)} y1={P.t} y2={g.rTop + RH} /><circle className="sc-now" cx={g.x(hover)} cy={g.y(c[hover])} r={3.5} /></>}
        </svg>
        {hover != null && (
          <div className="sc-tip" style={{ left: `${(g.x(hover) / W) * 100}%` }} data-side={g.x(hover) > W * 0.6 ? 'left' : 'right'}>
            <span>{dayFmt.format(t[hover] * 1000)}</span>
            <b className="num">{price(c[hover])}</b>
            {!Number.isNaN(sma200[hover]) && <span>200 ort. <b className="num">{pct(c[hover] / sma200[hover] - 1, 0)}</b></span>}
            {!Number.isNaN(rsi[hover]) && <span>RSI <b className="num">{Fmt.number(rsi[hover], 1)}</b></span>}
            {!Number.isNaN(vol[hover]) && <span>Hacim <b className="num">{Fmt.number(vol[hover], 1)} katı</b></span>}
          </div>
        )}
      </div>
      <p className="sc-legend">
        <span><i className="k solid" />fiyat</span>
        <span><i className="k ma" />200 günlük ortalama</span>
        {hasVol && <span><i className="k box" />hacim; koyu: olağanın 2 katından fazla{Number.isNaN(lastV) ? '' : ` (bugün ${Fmt.number(lastV, 1)} katı)`}</span>}
        {g.log && <span>dikey eksen logaritmik</span>}
      </p>
    </figure>
  )
}

/** Kurulumdan sonraki ortalama seyir (pazardaki tüm hisseler): kurulum kalın, aynı piyasa durumunun olağanı kesikli. */
export function PathChart({ days, path, base, n }: { days: number[]; path: number[]; base: number[]; n: number }) {
  const [box, W] = useWidth(520)
  const H = 190, P = { l: 44, r: 104, t: 12, b: 26 }
  const [hover, setHover] = useState<number | undefined>()
  const lo = Math.min(0, ...path, ...base), hi = Math.max(0.01, ...path, ...base)
  const last = days[days.length - 1]
  const x = (d: number) => P.l + (d / last) * (W - P.l - P.r)
  const y = (r: number) => P.t + (H - P.t - P.b) * (1 - (r - lo) / (hi - lo))
  const d = (p: number[]) => p.map((r, k) => `${k ? 'L' : 'M'}${x(days[k]).toFixed(1)} ${y(r).toFixed(1)}`).join('')
  const e = path.length - 1
  let py = y(path[e]) + 4, by = y(base[e]) + 4
  if (Math.abs(py - by) < 14) { const mid = (py + by) / 2, up = py <= by; py = mid + (up ? -7 : 7); by = mid + (up ? 7 : -7) }
  return (
    <figure className="sc path">
      <figcaption>Kurulumdan sonraki ortalama seyir<span>Pazardaki tüm hisselerde {Fmt.number(n, 0)} örneğin ortalaması; sıfır, kurulumun oluştuğu gün.</span></figcaption>
      <div className="sc-plot" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Kurulumdan 3 ay sonra ortalama ${pct(path[e])}, olağan ${pct(base[e])}`}
          onPointerMove={(ev) => { const r = ev.currentTarget.getBoundingClientRect(); const px = ((ev.clientX - r.left) / r.width) * W; let best = 0; days.forEach((dd, k) => { if (Math.abs(x(dd) - px) < Math.abs(x(days[best]) - px)) best = k }); setHover(best) }}
          onPointerLeave={() => setHover(undefined)}>
          {[lo, 0, hi].filter((r, i, a) => a.indexOf(r) === i).map((r) => <g key={r}><line className={r === 0 ? 'sc-zero' : 'sc-grid'} x1={P.l} x2={W - P.r} y1={y(r)} y2={y(r)} /><text className="sc-tick" x={P.l - 6} y={y(r) + 4} textAnchor="end">{pct(r, 0)}</text></g>)}
          <text className="sc-tick" x={x(0)} y={H - 7}>kurulum</text>
          <text className="sc-tick" x={x(21)} y={H - 7} textAnchor="middle">1 ay</text>
          <text className="sc-tick" x={x(42)} y={H - 7} textAnchor="middle">2 ay</text>
          <text className="sc-tick" x={x(last)} y={H - 7} textAnchor="end">3 ay</text>
          <path d={d(base)} className="sc-base" />
          <path d={d(path)} className="sc-median" />
          <circle className="sc-now" cx={x(last)} cy={y(path[e])} r={4} />
          <text className="sc-tag strong" x={W - P.r + 8} y={py}>kurulum {pct(path[e])}</text>
          <text className="sc-tag" x={W - P.r + 8} y={by}>olağan {pct(base[e])}</text>
          {hover != null && <line className="sc-cursor" x1={x(days[hover])} x2={x(days[hover])} y1={P.t} y2={H - P.b} />}
        </svg>
        {hover != null && (
          <div className="sc-tip" style={{ left: `${(x(days[hover]) / W) * 100}%` }} data-side={hover > days.length / 2 ? 'left' : 'right'}>
            <span>{days[hover] === 0 ? 'Kurulum günü' : `${days[hover]} işlem günü sonra`}</span>
            <span><i className="k solid" />kurulum <b className="num">{pct(path[hover])}</b></span>
            <span><i className="k dash" />olağan <b className="num">{pct(base[hover])}</b></span>
          </div>
        )}
      </div>
    </figure>
  )
}
