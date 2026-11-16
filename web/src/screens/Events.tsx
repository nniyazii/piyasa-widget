/**
 * Son dönemde ne oldu ve aynı şey geçmişte olduğunda sonrasında ne oldu: olay akışı ve yön olasılıkları.
 * Görünüm sayfasının merkezi.
 */
import { useMemo } from 'react'
import { eventsView, HORIZONS, RECENT, sentence, type EventsView, type HorizonStat, type Occurrence } from '../core/events'
import * as Fmt from '../core/format'
import { monthLabel, type MacroData } from '../core/macro'
import { EventFan } from '../ui/MacroCharts'

const p0 = (v: number) => (Number.isNaN(v) ? '—' : '%' + Fmt.number(v * 100, 0))
const pct = (v: number, d = 0) => (Number.isNaN(v) ? '—' : (v > 0.00005 ? '+' : v < -0.00005 ? '−' : '') + '%' + Fmt.number(Math.abs(v * 100), d))
const ago = (e: number) => (e === 0 ? 'bu ay' : `${e} ay önce`)
const hLabel = (m: number) => `${m} ay`

let cache: { data: MacroData; view: EventsView } | undefined
export function useEvents(data: MacroData | null | undefined): EventsView | undefined {
  return useMemo(() => { if (!data) return undefined; if (cache?.data !== data) cache = { data, view: eventsView(data) }; return cache.view }, [data])
}

/** Başlık için en bilgilendirici olay ve cümlesi */
export function topEvent(v: EventsView): { o: Occurrence; text: string } | undefined {
  // Başlık: varlığın kendi fiyat olayları ve 3 ay ya da daha uzun vadeler öncelikli
  const pick = (o: Occurrence) => o.stats.filter((s) => s.months >= 3 && s.n >= 8 && Math.abs(s.up - s.base) >= 0.12).sort((x, y) => Math.abs(y.up - y.base) - Math.abs(x.up - x.base))[0]
  const weight = (o: Occurrence) => { const b = pick(o); return b ? Math.abs(b.up - b.base) * Math.sqrt(b.n) * (o.def.kind === 'asset' ? 1.5 : 1) : 0 }
  const o = [...v.recent].sort((a, b) => weight(b) - weight(a))[0]
  const b = o && pick(o)
  if (!o || !b) return undefined
  const what = o.def.kind === 'macro' ? `“${o.def.label}” durumu başladı (${monthLabel(o.month)})` : `${sentence(o)} (${monthLabel(o.month)})`
  return { o, text: `${what}. Bu geçmişte ${b.n} kez oldu; ${o.def.kind === 'macro' ? o.asset.short.toLocaleLowerCase('tr') + ' ' : ''}sonraki ${b.months} ayda ${p0(b.up)} oranında yukarıdaydı (olağan ${p0(b.base)}).` }
}

/** Bir vadenin olasılık hücresi: çubuk yukarıda olma oranı, çentik olağan */
function Odds({ s }: { s: HorizonStat }) {
  if (s.n < 5) return <td className="c ev-odds thin"><span className="s">örnek az ({s.n})</span></td>
  const diff = s.up - s.base
  const tone = s.n >= 8 && diff >= 0.12 ? 'up' : s.n >= 8 && diff <= -0.12 ? 'down' : ''
  return (
    <td className={'c ev-odds ' + tone} title={`${s.n} örnek; %80 güven aralığı ${p0(s.lo)}–${p0(s.hi)}; ortanca getiri ${pct(s.median, 1)} (olağan ${pct(s.baseMedian, 1)})`}>
      <b className="num">{p0(s.up)}</b>
      <span className="track" aria-hidden><i className="f" style={{ width: `${s.up * 100}%` }} /><i className="b" style={{ left: `${s.base * 100}%` }} /></span>
      <span className="s num">ortanca {pct(s.median)}</span>
    </td>
  )
}

function EventRow({ o, showAsset }: { o: Occurrence; showAsset?: boolean }) {
  const paths = o.paths.map((p) => ({ name: monthLabel(p.month), path: p.path }))
  return (
    <details className={'ev-row' + (o.informative ? ' strong' : '')}>
      <summary>
        <span className="when">{monthLabel(o.month)}<em>{ago(o.elapsed)}</em></span>
        <span className="what"><b>{showAsset ? `${o.asset.short}: sonrası` : sentence(o)}</b><em>geçmişte {o.history.length} kez{o.since != null ? `; o günden beri ${pct(o.since, 1)}` : ''}</em></span>
        <table className="ev-table" aria-label="Bugünden sonraki yön olasılıkları">
          <thead><tr>{o.stats.map((s) => <th key={s.months} className="c">{hLabel(s.months)}</th>)}</tr></thead>
          <tbody><tr>{o.stats.map((s) => <Odds key={s.months} s={s} />)}</tr></tbody>
        </table>
      </summary>
      <div className="ev-more">
        <EventFan paths={paths} current={o.current} elapsed={o.elapsed} label={o.asset.short} />
        <p className="note">
          Olasılıklar bugünden sonrası içindir: olay {o.elapsed === 0 ? 'bu ay oldu' : `${o.elapsed} ay önce oldu`}; geçmişteki her örnekte olaydan aynı süre geçtikten sonraki dönem ölçüldü.
          Önceki örnekler: {o.history.slice(-12).map((k) => monthLabel(k)).join(', ')}{o.history.length > 12 ? ` ve ${o.history.length - 12} tane daha` : ''}.
        </p>
      </div>
    </details>
  )
}

export function EventsSection({ v }: { v: EventsView }) {
  const assetBlocks = v.odds.map((a) => ({ asset: a.asset, events: a.events.filter((o) => o.def.kind === 'asset') })).filter((a) => a.events.length)
  // Makro olaylar: olay bir kez, altında etkilediği varlıklar
  const macro = new Map<string, Occurrence[]>()
  for (const o of v.recent) if (o.def.kind === 'macro') macro.set(o.def.id, [...(macro.get(o.def.id) ?? []), o])
  return (
    <>
      <section className="an-group">
        <h3>Son {RECENT} ayda ne oldu ve geçmişte aynı şeyden sonra ne olmuştu</h3>
        <p className="sc-legend"><span><i className="k box up" />yukarı olasılığı olağandan belirgin yüksek</span><span><i className="k box down" />belirgin düşük</span><span><i className="k tick" />olağan (tüm aylar)</span><span>satıra dokun: grafik ve önceki örnekler</span></p>
        {assetBlocks.map((a) => (
          <div key={a.asset.id} className="ev-asset">
            <h4>{a.asset.label}</h4>
            {a.events.filter((o) => o.informative).map((o) => <EventRow key={o.def.id} o={o} />)}
            {a.events.some((o) => !o.informative) && (
              <details className="an-how st-frame ev-rest">
                <summary>{a.events.some((o) => o.informative) ? 'Yön olasılığını değiştirmemiş diğer' : 'Yön olasılığını belirgin biçimde değiştirmemiş'} {a.events.filter((o) => !o.informative).length} olay</summary>
                {a.events.filter((o) => !o.informative).map((o) => <EventRow key={o.def.id} o={o} />)}
              </details>
            )}
          </div>
        ))}
        {!assetBlocks.length && <p className="note">Son {RECENT} ayda izlenen varlıklarda istatistiksel olarak dikkat çekici bir fiyat olayı olmadı.</p>}
      </section>

      {macro.size > 0 && (
        <section className="an-group">
          <h3>Son {RECENT} ayda başlayan makro durumlar ve varlıklara etkisi</h3>
          {[...macro.values()].map((list) => (
            <div key={list[0].def.id} className="ev-asset">
              <h4>{list[0].def.label} <em>{monthLabel(list[0].month)}, {ago(list[0].elapsed)}; geçmişte {list[0].history.length} kez başladı</em></h4>
              {list.filter((o) => o.informative).map((o) => <EventRow key={o.asset.id} o={o} showAsset />)}
              {!list.some((o) => o.informative) && <p className="note">Bu durumun başlaması geçmişte hiçbir varlıkta yön olasılığını belirgin biçimde değiştirmemiş.</p>}
              {list.some((o) => !o.informative) && list.some((o) => o.informative) && <p className="note">Diğer varlıklarda ({list.filter((o) => !o.informative).map((o) => o.asset.short).join(', ')}) belirgin bir etki yok.</p>}
            </div>
          ))}
        </section>
      )}
      <p className="note">Vadeler: {HORIZONS.join(', ')} ay. Olasılık, geçmişteki örneklerde fiyatın o vade sonunda bugünkü düzeyin üstünde olma oranıdır; hücrenin üstüne gelince örnek sayısı ve güven aralığı görünür. Renkli hücre: en az 8 örnek ve olağandan en az 12 puan fark.</p>
    </>
  )
}
