/**
 * Mum grafik (yakınlaştırma, kaydırma, artı imleci): TradingView'in açık kaynak lightweight-charts kitaplığı.
 * Üstte mumlar, uzun ortalama ve (varsa) hacim; altta RSI paneli (zaman ekseni eşlenir).
 * Olay işaretleri mumların altındaki oklardır; rengi olaydan sonraki sonucu gösterir. İşarete tıklanınca o
 * gerçekleşme seçilir.
 */
import { ColorType, createChart, PriceScaleMode, type IChartApi, type ISeriesApi, type LogicalRange, type SeriesMarker, type Time, type UTCTimestamp } from 'lightweight-charts'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as Fmt from '../core/format'
import type { OHLCV, Tf } from '../core/study'

export interface Mark { index: number; outcome: 'up' | 'down' | 'open'; label?: string }
const RANGES: { id: string; label: string; years?: number }[] = [{ id: '0.5', label: '6 ay', years: 0.5 }, { id: '1', label: '1 yıl', years: 1 }, { id: '3', label: '3 yıl', years: 3 }, { id: '10', label: '10 yıl', years: 10 }, { id: 'all', label: 'Tümü' }]
const DEFAULT_RANGE: Record<Tf, string> = { M: 'all', W: '10', D: '1' }
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
/** #rrggbb → yarı saydam (grafik kitaplığı color-mix okuyamaz) */
const fade = (hex: string, a: number) => { const m = /^#([0-9a-f]{6})$/i.exec(hex); if (!m) return hex; const n = parseInt(m[1], 16); return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})` }
const num = (v: number) => Fmt.number(v, v >= 1000 ? 0 : v >= 10 ? 2 : 4)
const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const monthFmt = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
export const barDate = (tf: Tf, t: number) => (tf === 'M' ? monthFmt : dateFmt).format(t * 1000)

export function CandleChart({ bars, tf, title, marks, selected, onPick, ma, maLabel, rsi, controls }: {
  bars: OHLCV; tf: Tf; title: string; marks: Mark[]; selected?: number; onPick?: (index: number) => void
  ma?: number[]; maLabel?: string; rsi?: number[]; controls?: ReactNode
}) {
  const el = useRef<HTMLDivElement>(null), el2 = useRef<HTMLDivElement>(null)
  const api = useRef<{ chart: IChartApi; candles: ISeriesApi<'Candlestick'>; avg: ISeriesApi<'Line'>; vol: ISeriesApi<'Histogram'>; chart2: IChartApi; rsi: ISeriesApi<'Line'> } | null>(null)
  const [range, setRange] = useState(DEFAULT_RANGE[tf])
  const [hover, setHover] = useState<number | undefined>()
  const pick = useRef(onPick); pick.current = onPick
  const marksRef = useRef(marks); marksRef.current = marks
  const barsRef = useRef(bars); barsRef.current = bars
  const n = bars.t.length
  const hasVol = !!bars.v?.some((x) => x > 0)
  const hasRsi = !!rsi

  useEffect(() => { setRange(DEFAULT_RANGE[tf]) }, [tf])

  // Grafikler bir kez kurulur; tema değişince renkler yenilenir
  useEffect(() => {
    if (!el.current || !el2.current) return
    const look = () => ({
      layout: { background: { type: ColorType.Solid, color: css('--surface') }, textColor: css('--ink-3'), fontFamily: css('--font') || 'sans-serif', fontSize: 11, attributionLogo: false },
      grid: { vertLines: { color: css('--rule-2') }, horzLines: { color: css('--rule-2') } },
    })
    const base = {
      autoSize: true, rightPriceScale: { borderVisible: false, minimumWidth: 62 }, crosshair: { mode: 0 },
      localization: { locale: 'tr-TR', priceFormatter: (p: number) => num(p) },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    }
    const chart = createChart(el.current, { ...look(), ...base, timeScale: { borderVisible: false, rightOffset: 5 } })
    const candles = chart.addCandlestickSeries({ upColor: css('--up'), downColor: css('--down'), wickUpColor: css('--up'), wickDownColor: css('--down'), borderVisible: false, priceLineColor: css('--ink-3') })
    const avg = chart.addLineSeries({ color: css('--ink-4'), lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
    const vol = chart.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false, color: css('--ink-4') })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } })
    const chart2 = createChart(el2.current, { ...look(), ...base, timeScale: { borderVisible: false, rightOffset: 5, visible: false } })
    const rsiS = chart2.addLineSeries({ color: css('--ink-2'), lineWidth: 1, priceLineVisible: false, lastValueVisible: true, priceFormat: { type: 'price', precision: 0, minMove: 1 } })
    for (const lv of [30, 70]) rsiS.createPriceLine({ price: lv, color: css('--ink-4'), lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '' })
    api.current = { chart, candles, avg, vol, chart2, rsi: rsiS }
    // İki grafiğin zaman ekseni eşlenir
    let syncing = false
    const link = (a: IChartApi, b: IChartApi) => a.timeScale().subscribeVisibleLogicalRangeChange((r: LogicalRange | null) => { if (syncing || !r) return; syncing = true; b.timeScale().setVisibleLogicalRange(r); syncing = false })
    link(chart, chart2); link(chart2, chart)
    const indexOf = (t: Time | undefined) => { if (t == null) return undefined; const tt = barsRef.current.t; let lo = 0, hi = tt.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (tt[m] < (t as number)) lo = m + 1; else hi = m }; return tt[lo] === t ? lo : undefined }
    chart.subscribeCrosshairMove((p) => setHover(indexOf(p.time)))
    chart.subscribeClick((p) => {
      const i = indexOf(p.time)
      if (i == null || !marksRef.current.length) return
      // Tıklanan muma en yakın işaret (görünen aralığın %3'ü içinde)
      const r = chart.timeScale().getVisibleLogicalRange(); const tol = Math.max(2, r ? (r.to - r.from) * 0.03 : 2)
      let best: number | undefined, dist = Infinity
      for (const m of marksRef.current) { const d = Math.abs(m.index - i); if (d < dist) { dist = d; best = m.index } }
      if (best != null && dist <= tol) pick.current?.(best)
    })
    const mo = new MutationObserver(() => { chart.applyOptions(look()); chart2.applyOptions(look()); candles.applyOptions({ upColor: css('--up'), downColor: css('--down'), wickUpColor: css('--up'), wickDownColor: css('--down') }) })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => { mo.disconnect(); chart.remove(); chart2.remove(); api.current = null }
  }, [])

  // Veri
  useEffect(() => {
    const a = api.current
    if (!a) return
    const T = (i: number) => bars.t[i] as UTCTimestamp
    a.candles.setData(bars.t.map((_, i) => ({ time: T(i), open: bars.o[i], high: bars.h[i], low: bars.l[i], close: bars.c[i] })))
    a.avg.setData(ma ? ma.map((v, i) => (Number.isNaN(v) ? undefined : { time: T(i), value: v })).filter((x): x is { time: UTCTimestamp; value: number } => !!x) : [])
    const up = css('--up'), down = css('--down')
    a.vol.setData(hasVol ? bars.t.map((_, i) => ({ time: T(i), value: bars.v![i] > 0 ? bars.v![i] : 0, color: fade(bars.c[i] >= bars.o[i] ? up : down, 0.4) })) : [])
    a.rsi.setData(rsi ? rsi.map((v, i) => (Number.isNaN(v) ? undefined : { time: T(i), value: v })).filter((x): x is { time: UTCTimestamp; value: number } => !!x) : [])
  }, [bars, ma, rsi, hasVol])

  // Görünen aralık; uzun aralıkta dikey eksen logaritmik
  useEffect(() => {
    const a = api.current
    if (!a || !n) return
    const r = RANGES.find((x) => x.id === range)
    const to = bars.t[n - 1]
    const from = r?.years ? Math.max(bars.t[0], to - r.years * 365.25 * 86400) : bars.t[0]
    let lo = Infinity, hi = -Infinity
    for (let i = 0; i < n; i++) if (bars.t[i] >= from) { if (bars.l[i] < lo) lo = bars.l[i]; if (bars.h[i] > hi) hi = bars.h[i] }
    a.chart.priceScale('right').applyOptions({ mode: hi / lo > 5 ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal, scaleMargins: { top: 0.06, bottom: hasVol ? 0.2 : 0.08 } })
    a.chart.timeScale().setVisibleRange({ from: from as UTCTimestamp, to: to as UTCTimestamp })
  }, [bars, range, n, hasVol])

  // Olay işaretleri
  const markers = useMemo(() => {
    const out: SeriesMarker<Time>[] = []
    for (const m of [...marks].sort((x, y) => x.index - y.index)) {
      if (m.index < 0 || m.index >= n) continue
      const sel = m.index === selected
      out.push({ time: bars.t[m.index] as UTCTimestamp, position: 'belowBar', shape: 'arrowUp', size: sel ? 2.2 : 1.3, color: sel ? css('--ink') : m.outcome === 'up' ? css('--up') : m.outcome === 'down' ? css('--down') : css('--ink-3'), text: m.label })
    }
    return out
  }, [bars, marks, selected, n])
  useEffect(() => { api.current?.candles.setMarkers(markers) }, [markers])

  const i = hover ?? n - 1
  return (
    <figure className="cc">
      <div className="cc-bar">
        {controls}
        <div className="segmented" role="group" aria-label="Görünen aralık">
          {RANGES.map((r) => <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>{r.label}</button>)}
        </div>
      </div>
      {n > 0 && (
        <p className="cc-ohlc num" aria-live="off">
          <b>{title}</b> {barDate(tf, bars.t[i])}: açılış {num(bars.o[i])}, yüksek {num(bars.h[i])}, düşük {num(bars.l[i])}, kapanış <b>{num(bars.c[i])}</b>
          <span className={bars.c[i] >= bars.o[i] ? 'pos' : 'neg'}> {bars.c[i] >= bars.o[i] ? '+' : '−'}%{Fmt.number(Math.abs((bars.c[i] / bars.o[i] - 1) * 100), 1)}</span>
          {rsi && !Number.isNaN(rsi[i]) && <span> RSI {Fmt.number(rsi[i], 0)}</span>}
        </p>
      )}
      <div className="cc-plot" ref={el} role="img" aria-label={`${title} mum grafiği; ${marks.length} olay işaretli`} />
      <div className={'cc-plot cc-rsi' + (hasRsi ? '' : ' hidden')} ref={el2} aria-hidden />
      <p className="sc-legend">
        {maLabel && <span><i className="k ma" />{maLabel}</span>}
        {hasVol && <span><i className="k box" />hacim</span>}
        {hasRsi && <span>alt panel: RSI (30 ve 70 çizgileri)</span>}
        {marks.length > 0 && <><span><b className="cc-arrow up">▲</b>olay; sonrasında fiyat yukarıda</span><span><b className="cc-arrow down">▲</b>aşağıda</span><span><b className="cc-arrow">▲</b>sonucu bekleniyor</span><span>oka tıkla: o gerçekleşmenin ayrıntısı</span></>}
        <span>yakınlaştır: fare tekerleği ya da iki parmak; kaydır: sürükle</span>
      </p>
    </figure>
  )
}
