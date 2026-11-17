/**
 * Mum grafik (yakınlaştırma, kaydırma, artı imleci): TradingView'in açık kaynak lightweight-charts kitaplığı.
 * Olay işaretleri mumların altında/üstünde; rengi, olaydan sonraki sonucu gösterir.
 */
import { ColorType, createChart, PriceScaleMode, type IChartApi, type ISeriesApi, type SeriesMarker, type Time, type UTCTimestamp } from 'lightweight-charts'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as Fmt from '../core/format'
import type { Candle, Candles, CandleTf } from '../data/candles'

export interface Mark { /** yıl*12+ay */ month: number; outcome: 'up' | 'down' | 'open'; label?: string }
const TF_LABEL: Record<CandleTf, string> = { M: 'Aylık', W: 'Haftalık', D: 'Günlük' }
const RANGES: { id: string; label: string; years?: number }[] = [{ id: '1', label: '1 yıl', years: 1 }, { id: '5', label: '5 yıl', years: 5 }, { id: '10', label: '10 yıl', years: 10 }, { id: 'all', label: 'Tümü' }]
const monthOf = (t: number) => { const d = new Date((t + 43200) * 1000); return d.getUTCFullYear() * 12 + d.getUTCMonth() }
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()
const num = (v: number) => Fmt.number(v, v >= 1000 ? 0 : v >= 10 ? 2 : 4)
const dateFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const monthFmt = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export function CandleChart({ candles, marks, title }: { candles: Candles; marks: Mark[]; title: string }) {
  const el = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const series = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const avg = useRef<ISeriesApi<'Line'> | null>(null)
  const [tf, setTf] = useState<CandleTf>('M')
  const [range, setRange] = useState('all')
  const [hover, setHover] = useState<Candle | undefined>()
  const bars = candles[tf] ?? candles.M ?? []
  const last = bars[bars.length - 1]

  // Grafik bir kez kurulur; tema değişince renkler yenilenir
  useEffect(() => {
    if (!el.current) return
    const colors = () => ({
      layout: { background: { type: ColorType.Solid, color: css('--surface') }, textColor: css('--ink-3'), fontFamily: css('--font') || 'sans-serif', fontSize: 11 },
      grid: { vertLines: { color: css('--rule-2') }, horzLines: { color: css('--rule-2') } },
    })
    const c = createChart(el.current, {
      ...colors(), autoSize: true,
      rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false, rightOffset: 4 },
      crosshair: { mode: 0 }, localization: { locale: 'tr-TR', priceFormatter: (p: number) => num(p) },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    })
    const s = c.addCandlestickSeries({ upColor: css('--up'), downColor: css('--down'), wickUpColor: css('--up'), wickDownColor: css('--down'), borderVisible: false, priceLineVisible: true, priceLineColor: css('--ink-3') })
    const a = c.addLineSeries({ color: css('--ink-4'), lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
    chart.current = c; series.current = s; avg.current = a
    c.subscribeCrosshairMove((p) => { const d = p.time != null ? (p.seriesData.get(s) as { open: number; high: number; low: number; close: number } | undefined) : undefined; setHover(d ? [p.time as number, d.open, d.high, d.low, d.close] : undefined) })
    const mo = new MutationObserver(() => { c.applyOptions(colors()); s.applyOptions({ upColor: css('--up'), downColor: css('--down'), wickUpColor: css('--up'), wickDownColor: css('--down') }) })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => { mo.disconnect(); c.remove(); chart.current = null; series.current = null; avg.current = null }
  }, [])

  // Veri ve 10 dönemlik ortalama
  useEffect(() => {
    const s = series.current, a = avg.current, c = chart.current
    if (!s || !a || !c) return
    s.setData(bars.map((b) => ({ time: b[0] as UTCTimestamp, open: b[1], high: b[2], low: b[3], close: b[4] })))
    const n = tf === 'M' ? 10 : tf === 'W' ? 43 : 200 // aylıkta 10 ay ≈ haftalıkta 43 hafta ≈ günlükte 200 gün
    let sum = 0
    a.setData(bars.map((b, i) => { sum += b[4]; if (i >= n) sum -= bars[i - n][4]; return i >= n - 1 ? { time: b[0] as UTCTimestamp, value: sum / n } : undefined }).filter((x): x is { time: UTCTimestamp; value: number } => !!x))
  }, [bars, tf])

  // Görünen aralık; uzun aralıkta dikey eksen logaritmik
  useEffect(() => {
    const c = chart.current
    if (!c || !bars.length) return
    const r = RANGES.find((x) => x.id === range)
    const to = bars[bars.length - 1][0]
    const from = r?.years ? Math.max(bars[0][0], to - r.years * 365.25 * 86400) : bars[0][0]
    const shown = bars.filter((b) => b[0] >= from)
    const lo = Math.min(...shown.map((b) => b[3])), hi = Math.max(...shown.map((b) => b[2]))
    c.priceScale('right').applyOptions({ mode: hi / lo > 5 ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal })
    c.timeScale().setVisibleRange({ from: from as UTCTimestamp, to: (to + (to - from) * 0.03) as UTCTimestamp })
  }, [bars, range])

  // Olay işaretleri: her ay, o aydaki son muma bağlanır
  const markers = useMemo(() => {
    const lastOfMonth = new Map<number, number>()
    for (const b of bars) lastOfMonth.set(monthOf(b[0]), b[0])
    const out: SeriesMarker<Time>[] = []
    for (const m of [...marks].sort((x, y) => x.month - y.month)) {
      const t = lastOfMonth.get(m.month)
      if (t == null) continue
      out.push({ time: t as UTCTimestamp, position: 'belowBar', shape: 'arrowUp', size: 1.4, color: m.outcome === 'up' ? css('--up') : m.outcome === 'down' ? css('--down') : css('--ink-3'), text: m.label })
    }
    return out
  }, [bars, marks])
  useEffect(() => { series.current?.setMarkers(markers) }, [markers])

  const shown = hover ?? last
  return (
    <figure className="cc">
      <div className="cc-bar">
        <div className="segmented" role="group" aria-label="Mum süresi">
          {(['M', 'W', 'D'] as CandleTf[]).filter((x) => candles[x]?.length).map((x) => <button key={x} type="button" aria-pressed={tf === x} onClick={() => { setTf(x); if (x === 'D' && (range === 'all' || range === '10')) setRange('1'); if (x === 'W' && range === 'all') setRange('5') }}>{TF_LABEL[x]}</button>)}
        </div>
        <div className="segmented" role="group" aria-label="Görünen aralık">
          {RANGES.map((r) => <button key={r.id} type="button" aria-pressed={range === r.id} onClick={() => setRange(r.id)}>{r.label}</button>)}
        </div>
      </div>
      {shown && (
        <p className="cc-ohlc num" aria-live="off">
          <b>{title}</b> {(tf === 'M' ? monthFmt : dateFmt).format(shown[0] * 1000)}: açılış {num(shown[1])}, yüksek {num(shown[2])}, düşük {num(shown[3])}, kapanış <b>{num(shown[4])}</b>
          <span className={shown[4] >= shown[1] ? 'pos' : 'neg'}> {shown[4] >= shown[1] ? '+' : '−'}%{Fmt.number(Math.abs((shown[4] / shown[1] - 1) * 100), 1)}</span>
        </p>
      )}
      <div className="cc-plot" ref={el} role="img" aria-label={`${title} mum grafiği; ${marks.length} olay işaretli`} />
      <p className="sc-legend">
        <span><i className="k ma" />{tf === 'M' ? '10 aylık' : tf === 'W' ? '43 haftalık' : '200 günlük'} ortalama</span>
        {marks.length > 0 && <><span><b className="cc-arrow up">▲</b>olay; sonrasında fiyat yukarıda</span><span><b className="cc-arrow down">▲</b>aşağıda</span><span><b className="cc-arrow">▲</b>sonucu bekleniyor</span></>}
        <span>yakınlaştırmak için fare tekerleği ya da iki parmak; kaydırmak için sürükle</span>
      </p>
    </figure>
  )
}
