/**
 * Analiz › Görünüm (açılış sayfası): her varlık için dört kanıtın (değerleme, makro örüntü, benzer dönemler, trend)
 * birleştirildiği tek görüş; güven düzeyi, gerekçe ve görüşü neyin değiştireceği. Diğer sekmeler kanıt sayfalarıdır.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import * as Fmt from '../core/format'
import type { MacroData } from '../core/macro'
import { LAYER_LABEL, outlookView, type Layer, type LayerId, type Outlook as View, type OutlookView, type Stance } from '../core/outlook'
import { Icon } from '../ui/Icon'
import { href } from '../ui/router'
import { EventsSection, topEvent, useEvents } from './Events'

const SEEN_KEY = 'piyasa.gorunum.v1'
const p0 = (v: number) => '%' + Fmt.number(v * 100, 0)
const price = (v?: number) => (v == null ? '—' : Fmt.number(v, v >= 1000 ? 0 : v >= 10 ? 2 : 4))
const TONE: Record<Stance, 'up' | 'down' | 'flat'> = { Olumlu: 'up', 'Hafif olumlu': 'up', Nötr: 'flat', 'Hafif olumsuz': 'down', Olumsuz: 'down' }
const ORDER: LayerId[] = ['deger', 'makro', 'benzer', 'trend']

let cache: Promise<MacroData | undefined> | undefined
export const loadMacro = () => (cache ??= fetch('data/macro.json', { cache: 'no-cache' }).then((r) => (r.ok ? (r.json() as Promise<MacroData>) : undefined)).catch(() => undefined))

let viewCache: { data: MacroData; view: OutlookView } | undefined
/** Görünüm (diğer sayfalar için): veri bir kez yüklenir, hesap bir kez yapılır */
export function useOutlook(): OutlookView | undefined {
  const [v, setV] = useState<OutlookView | undefined>(viewCache?.view)
  useEffect(() => {
    let alive = true
    void loadMacro().then((d) => { if (!d || !alive) return; if (viewCache?.data !== d) viewCache = { data: d, view: outlookView(d) }; setV(viewCache.view) })
    return () => { alive = false }
  }, [])
  return v
}

/** Başka sayfalarda tek satırlık görünüm: "Görünüm: Hafif olumsuz (güven düşük)" ve bağlantı */
export function OutlookLine({ asset, prefix }: { asset: string; prefix?: string }) {
  const v = useOutlook()
  const o = v?.list.find((x) => x.asset.id === asset)
  if (!o) return null
  const val = o.layers.find((l) => l.id === 'deger')
  return (
    <p className="ov-line">
      {prefix ?? `${o.asset.short}: bütün kanıtlarla görünüm`} <a className={'ov-stance ' + TONE[o.stance]} href={href('analiz')}>{o.stance}</a>
      {o.stance !== 'Nötr' && <span> güven {o.conviction}</span>}
      {!prefix && val && val.vote !== 0 && <span>. Değerleme bu varlıkta geçmişte {val.counts ? 'ayırt edici olmuş; görüşe katılıyor' : 'ayırt edici olmamış; görüşe katılmıyor'}.</span>}
    </p>
  )
}

/** Oy simgesi: ▲▲ güçlü lehine … ▼▼ güçlü aleyhine; görüşe katılmayan kanıt soluk */
function Vote({ l }: { l?: Layer }) {
  if (!l) return <span className="ov-vote none" title="Bu varlık için hesaplanamıyor">·</span>
  const sym = l.vote >= 2 ? '▲▲' : l.vote === 1 ? '▲' : l.vote <= -2 ? '▼▼' : l.vote === -1 ? '▼' : '–'
  const what = l.vote > 0 ? 'lehine' : l.vote < 0 ? 'aleyhine' : 'yön göstermiyor'
  return <span className={'ov-vote ' + (l.vote > 0 ? 'up' : l.vote < 0 ? 'down' : 'flat') + (l.counts ? '' : ' dim')} title={`${LAYER_LABEL[l.id]}: ${what}${l.counts || l.vote === 0 ? '' : ' (geçmişte ayırt edici olmadığı için görüşe katılmıyor)'}`} aria-label={`${LAYER_LABEL[l.id]} ${what}`}>{sym}</span>
}

export function Outlook({ practical }: { practical?: ReactNode }) {
  const [data, setData] = useState<MacroData | null | undefined>()
  useEffect(() => { let alive = true; void loadMacro().then((d) => { if (alive) setData(d ?? null) }); return () => { alive = false } }, [])
  const v = useMemo(() => (data ? outlookView(data) : undefined), [data])
  const ev = useEvents(data)
  if (data === undefined) return <p className="an-answer" aria-live="polite">Görünüm hazırlanıyor…</p>
  if (!v) return <><p className="an-answer">Makro veriler alınamadı; görünüm hesaplanamıyor.</p>{practical}</>
  return <Page v={v} ev={ev} generated={data!.generated} practical={practical} />
}

const join = (a: string[]) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' ve ' + a[a.length - 1])

function Page({ v, ev, generated, practical }: { v: OutlookView; ev?: ReturnType<typeof useEvents>; generated: number; practical?: ReactNode }) {
  const top = ev ? topEvent(ev) : undefined
  // Başlıkta yalnızca belirgin görüşler: en az iki oy ya da orta/yüksek güven
  const clear = (o: View) => o.stance !== 'Nötr' && (Math.abs(o.score) >= 2 || o.conviction !== 'düşük')
  const pro = v.list.filter((o) => clear(o) && TONE[o.stance] === 'up'), con = v.list.filter((o) => clear(o) && TONE[o.stance] === 'down')
  const faint = v.list.filter((o) => o.stance !== 'Nötr' && !clear(o))
  const changes = useChanges(v)
  return (
    <>
      <header className="an-head">
        <h2>Görünüm ({v.month}): son dönemde ne oldu, bundan sonrası için geçmiş ne söylüyor?</h2>
        <p className="an-answer ev-answer" aria-live="polite">{top ? top.text : 'Son dönemde yön olasılığını belirgin biçimde değiştiren bir olay yok.'}</p>
      </header>
      <p className="an-sub">Aşağıda son 6 ayın olayları ve her biri için geçmişe dayalı yön olasılıkları var. Olay tekrarlandığında ne beklenebileceğini görmek için satırlara dokun.</p>

      <section className="ov-regime">
        <b>{v.regime.title}</b>
        <ul>{v.regime.lines.map((l) => <li key={l}>{l}</li>)}</ul>
        <a href={href('analiz/makro')}>Makro tablonun ayrıntısı ve benzer dönemler</a>
      </section>

      {changes.length > 0 && (
        <section className="ov-changes" role="status">
          <b>Son ziyaretinden beri değişenler</b>
          <ul>{changes.map((c) => <li key={c}>{c}</li>)}</ul>
        </section>
      )}

      {ev && <EventsSection v={ev} />}

      <section className="an-group ov-state">
        <h3>Bugünkü durumun özeti: görüş tablosu (12 ay için)</h3>
        <p className="note">Yukarıdaki olaylardan bağımsız olarak, bugünkü tablonun dört kanıtla okunması: {pro.length || con.length ? <>{pro.length ? <>olumlu {join(pro.map((o) => o.asset.short))}</> : null}{pro.length && con.length ? '; ' : ''}{con.length ? <>olumsuz {join(con.map((o) => o.asset.short))}</> : null}.</> : 'belirgin bir yön yok.'}{faint.length > 0 && <> Zayıf işaretler: {faint.map((o) => `${o.asset.short} ${o.stance.toLocaleLowerCase('tr')}`).join(', ')}.</>}</p>
        <div className="mc-scroll">
          <table className="result-table ov-table">
            <thead><tr><th>Varlık</th><th>Görüş</th><th className="c">Güven</th>{ORDER.map((id) => <th key={id} className="c">{LAYER_LABEL[id]}</th>)}</tr></thead>
            <tbody>
              {v.list.map((o) => (
                <tr key={o.asset.id}>
                  <td><button type="button" className="n" onClick={() => { const el = document.getElementById('gorunum-' + o.asset.id); el?.querySelector('details')?.setAttribute('open', ''); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>{o.asset.short}</button><span className="s num">{price(o.price)}</span></td>
                  <td><span className={'ov-stance ' + TONE[o.stance]}>{o.stance}</span></td>
                  <td className="c">{o.stance === 'Nötr' ? '—' : o.conviction}</td>
                  {ORDER.map((id) => <td key={id} className="c"><Vote l={o.layers.find((l) => l.id === id)} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sc-legend"><span><span className="ov-vote up">▲</span>lehine</span><span><span className="ov-vote down">▼</span>aleyhine</span><span><span className="ov-vote flat">–</span>yön göstermiyor</span><span><span className="ov-vote up dim">▲</span>soluk: bu kanıt bu varlıkta geçmişte ayırt edici olmamış, görüşe katılmıyor</span></p>
      </section>

      <section className="an-group">
        <h3>Varlık varlık gerekçe</h3>
        <div className="vd-list">{v.list.map((o) => <Card key={o.asset.id} o={o} open={clear(o)} />)}</div>
      </section>

      {practical}

      <details className="an-how">
        <summary>Görüş nasıl oluşuyor, nelere dikkat etmeli</summary>
        <ul>
          <li><b>Olaylar</b>: bir durumun başladığı aydır (bir ayda 2 standart sapmadan sert hareket, 10 aylık ortalamanın kırılması, 12 ayın ya da 3 yılın zirvesi/dibi, art arda 4 ay aynı yön, zirveden %10 ve %20 gerileme; makro durumların başlaması). Aynı olayın iki başlangıcı arasında en az 6 ay aranır.</li>
          <li><b>Yön olasılığı</b>: olayın geçmişteki her örneğinde, olaydan bugüne geçen süre kadar ilerlenir ve oradan sonraki 1, 3, 6, 12 ayda fiyatın yukarıda olma oranı ölçülür. Yanında tüm ayların olağan oranı verilir; fark asıl bilgidir. Örnek sayısı 10–40 arasında olduğu için oranlar kabadır; hücrenin üstüne gelince güven aralığı görünür.</li>
          <li><b>Dört kanıt</b> (aşağıdaki görüş tablosu) ayrı ayrı hesaplanır. <b>Değerleme</b>: fiyatın ilgili para arzına oranı kendi geçmişinin neresinde (alt çeyrek ucuz, üst çeyrek pahalı). <b>Makro örüntü</b>: şu an geçerli olan ve geçmişte en az 8 ayrı dönemde, üç çağda aynı yönde sonuç vermiş durumlar. <b>Benzer dönemler</b>: bugünkü makro tabloya en yakın 8 dönemden 12 ay sonra olanlar. <b>Trend</b>: fiyat 10 aylık ortalamasının üstünde mi.</li>
          <li><b>Sicil şartı</b>: bir kanıt, o varlıkta geçmişte gerçekten ayırt edici olmuşsa görüşe katılır (kanıtın gösterdiği yönde, 12 ay sonraki yukarıda olma oranı olağandan en az 5 puan farklı). Olmamışsa tabloda soluk görünür. Örneğin değerleme bazı varlıklarda işe yarar, bazılarında yaramaz.</li>
          <li><b>Görüş</b>, katılan kanıtların oylarının toplamıdır (güçlü değerleme 2, diğerleri 1 oy). <b>Güven</b>: üç kanıt aynı yönde ve karşı çıkan yoksa yüksek, iki kanıt aynı yöndeyse orta, aksi hâlde düşük.</li>
          <li><b>Süre 12 aydır.</b> Bu sayfa kısa vadeli al-sat için değil, önümüzdeki yıl için hangi varlığın rüzgârı arkasında, hangisinin karşısında olduğunu görmek içindir.</li>
          <li>Görüş bir tahmin ya da yatırım tavsiyesi değildir; geçmişte benzer koşullarda ne olduğunun özetidir. Aylık veride örnek azdır ve hiçbir dönem bugünün aynısı değildir. “Görüşü ne değiştirir” satırları, hangi gelişmede bu sayfanın farklı konuşacağını söyler.</li>
          <li>Veri {Fmt.dateTime(generated)} itibarıyla; aylık seriler günde bir yenilenir.</li>
        </ul>
      </details>
    </>
  )
}

function Card({ o, open }: { o: View; open: boolean }) {
  return (
    <article className={'st-sig ov-card ' + TONE[o.stance]} id={'gorunum-' + o.asset.id}>
      <h3>{o.asset.label}{o.price != null && <span className="num"> {price(o.price)}</span>}</h3>
      <p className="vd-act">{o.stance}<span className="vd-str">{o.stance === 'Nötr' ? 'yön yok' : `güven ${o.conviction}`}</span></p>
      <p className="vd-why">{o.why}</p>
      <p className="st-alarm"><a className="btn ghost small" href={href('alarmlar', { tur: 'gorunum', s: o.asset.id })}><Icon name="bell" />Görüş değişince haber ver</a></p>
      <details className="an-how st-frame" open={open || undefined}>
      <summary>Kanıtlar ve görüşü ne değiştirir</summary>
      <ul className="ov-layers">
        {ORDER.map((id) => o.layers.find((l) => l.id === id)).filter((l): l is Layer => !!l).map((l) => (
          <li key={l.id} className={l.counts ? '' : 'dim'}>
            <Vote l={l} />
            <div>
              <b>{LAYER_LABEL[l.id]}{l.link && <a href={href(l.link)}>kanıt</a>}</b>
              <span>{l.text}</span>
              {l.record && l.vote !== 0 && (
                <span className="rec">
                  <span className="hitbar" aria-hidden><i className="b" style={{ left: `${l.record.base * 100}%` }} /><i className={'h' + (l.counts ? ' good' : '')} style={{ left: `${l.record.hit * 100}%` }} /></span>
                  Sicil: bu durumdayken 12 ay sonra {p0(l.record.hit)} yukarıdaydı, olağan {p0(l.record.base)} ({l.record.n} {l.id === 'benzer' ? 'dönem' : 'ay'}){l.counts ? '' : '; ayırt edici değil, görüşe katılmıyor'}.
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
      {o.flips.length > 0 && (
        <div className="ov-flips">
          <b>Görüşü ne değiştirir</b>
          <ul>{o.flips.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      )}
      </details>
    </article>
  )
}

/** Son ziyaretteki görüşlerle karşılaştırır; farkları döndürür ve bugünkünü kaydeder */
function useChanges(v: OutlookView): string[] {
  const [changes] = useState(() => {
    const now = Object.fromEntries(v.list.map((o) => [o.asset.id, o.stance]))
    let out: string[] = []
    try {
      const prev = JSON.parse(localStorage.getItem(SEEN_KEY) ?? 'null') as { t: number; regime: string; s: Record<string, Stance> } | null
      if (prev) {
        out = v.list.filter((o) => prev.s[o.asset.id] && prev.s[o.asset.id] !== o.stance).map((o) => `${o.asset.short}: ${prev.s[o.asset.id].toLocaleLowerCase('tr')} → ${o.stance.toLocaleLowerCase('tr')}`)
        if (prev.regime && prev.regime !== v.regime.title) out.unshift(`Makro tablo: “${prev.regime}” → “${v.regime.title}”`)
      }
      localStorage.setItem(SEEN_KEY, JSON.stringify({ t: Date.now(), regime: v.regime.title, s: now }))
    } catch { /* depolama kapalı */ }
    return out
  })
  return changes
}
