/** Makro analiz grafikleri: küçük eğilim çizgisi, benzer dönemlerden sonraki seyir, ilişki hücresi. */
import { useState } from 'react'
import * as Fmt from '../core/format'

const pct = (v: number, d = 0) => (v > 0.00005 ? '+' : v < -0.00005 ? '−' : '') + '%' + Fmt.number(Math.abs(v * 100), d)

/** Son yılların seyri; nokta bugünkü değer, gölge bant tarihsel %25–%75 aralığı */
export function Spark({ values, band }: { values: number[]; band?: [number, number] }) {
  if (values.length < 2) return null
  const W = 140, H = 36
  const lo = Math.min(...values, band?.[0] ?? Infinity), hi = Math.max(...values, band?.[1] ?? -Infinity)
  const x = (i: number) => 2 + (i / (values.length - 1)) * (W - 8)
  const y = (v: number) => H - 3 - ((v - lo) / (hi - lo || 1)) * (H - 6)
  return (
    <svg className="mc-spark" viewBox={`0 0 ${W} ${H}`} aria-hidden>
      {band && <rect className="sc-zone" x={0} width={W} y={y(band[1])} height={Math.max(1, y(band[0]) - y(band[1]))} />}
      <path className="sc-ind" d={values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('')} />
      <circle className="sc-now" cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={3} />
    </svg>
  )
}

/** Benzer dönemlerden sonraki 12 ay: her çizgi bir dönem, kalın çizgi ortanca */
export function AnalogChart({ paths, label }: { paths: { name: string; path: number[] }[]; label: string }) {
  const [hover, setHover] = useState<number | undefined>()
  const W = 520, H = 210, P = { l: 44, r: 96, t: 12, b: 26 }
  const full = paths.filter((p) => p.path.length > 1)
  if (!full.length) return null
  const steps = Math.max(...full.map((p) => p.path.length)) - 1
  const med = Array.from({ length: steps + 1 }, (_, j) => { const v = full.map((p) => p.path[j]).filter((x) => x != null).sort((a, b) => a - b); const m = v.length >> 1; return v.length ? (v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2) : NaN })
  const all = full.flatMap((p) => p.path)
  const lo = Math.min(-0.02, ...all), hi = Math.max(0.02, ...all)
  const x = (j: number) => P.l + (j / steps) * (W - P.l - P.r)
  const y = (r: number) => P.t + (H - P.t - P.b) * (1 - (r - lo) / (hi - lo))
  const d = (p: number[]) => p.map((r, j) => (Number.isNaN(r) ? '' : `${j ? 'L' : 'M'}${x(j).toFixed(1)} ${y(r).toFixed(1)}`)).join('')
  const end = med[med.length - 1]
  return (
    <figure className="sc">
      <figcaption>{label}: benzer dönemlerden sonraki 12 ay<span>Her çizgi geçmişteki benzer bir dönem; kalın çizgi ortanca. Sıfır, o dönemin başlangıç fiyatı.</span></figcaption>
      <div className="sc-plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: benzer ${full.length} dönemden 12 ay sonra ortanca ${pct(end)}`}
          onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; let best = 0, dist = Infinity; full.forEach((p, i) => { const j = Math.max(0, Math.min(p.path.length - 1, Math.round(((px - P.l) / (W - P.l - P.r)) * steps))); const py = ((e.clientY - r.top) / r.height) * H; const dd = Math.abs(y(p.path[j]) - py); if (dd < dist) { dist = dd; best = i } }); setHover(best) }}
          onPointerLeave={() => setHover(undefined)}>
          {[lo, 0, hi].map((r) => <g key={r}><line className={r === 0 ? 'sc-zero' : 'sc-grid'} x1={P.l} x2={W - P.r} y1={y(r)} y2={y(r)} /><text className="sc-tick" x={P.l - 6} y={y(r) + 4} textAnchor="end">{pct(r)}</text></g>)}
          <text className="sc-tick" x={x(0)} y={H - 7}>başlangıç</text>
          <text className="sc-tick" x={x(steps / 2)} y={H - 7} textAnchor="middle">6 ay</text>
          <text className="sc-tick" x={x(steps)} y={H - 7} textAnchor="end">12 ay</text>
          {full.map((p, i) => <path key={p.name} d={d(p.path)} className={'sc-path ' + (p.path[p.path.length - 1] > 0 ? 'hit' : 'miss') + (hover === i ? ' hl' : '')} />)}
          <path d={d(med)} className="sc-median" />
          <circle className="sc-now" cx={x(steps)} cy={y(end)} r={4} />
          <text className="sc-tag strong" x={W - P.r + 8} y={y(end) + 4}>ortanca {pct(end)}</text>
          {hover != null && <text className="sc-tag" x={W - P.r + 8} y={Math.min(H - P.b, Math.max(P.t + 10, y(full[hover].path[full[hover].path.length - 1]) + (Math.abs(y(full[hover].path[full[hover].path.length - 1]) - y(end)) < 14 ? 18 : 4)))}>{full[hover].name} {pct(full[hover].path[full[hover].path.length - 1])}</text>}
        </svg>
      </div>
      <p className="sc-legend"><span><i className="k solid" />ortanca</span><span><i className="k thin hit" />12 ay sonra yukarıda</span><span><i className="k thin miss" />aşağıda</span></p>
    </figure>
  )
}

/** Korelasyon hücresi: renk yönü (yeşil aynı yönde, kırmızı ters), koyuluk gücü gösterir */
export function CorrCell({ long, recent }: { long: number; recent: number }) {
  const bg = (v: number) => (Number.isNaN(v) ? 'transparent' : `color-mix(in srgb, var(${v >= 0 ? '--up' : '--down'}) ${Math.round(Math.min(1, Math.abs(v)) * 70)}%, transparent)`)
  const f = (v: number) => (Number.isNaN(v) ? '—' : (v < 0 ? '−' : '+') + Fmt.number(Math.abs(v), 2))
  return (
    <span className="mc-corr" title={`Uzun dönem ${f(long)}, son 5 yıl ${f(recent)}`}>
      <i style={{ background: bg(long) }}>{f(long)}</i>
      <i style={{ background: bg(recent) }}>{f(recent)}</i>
    </span>
  )
}
