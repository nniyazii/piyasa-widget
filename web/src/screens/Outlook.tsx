/**
 * Analiz › Görünüm (açılış sayfası): her varlık için dört kanıtın (değerleme, makro örüntü, benzer dönemler, trend)
 * birleştirildiği tek görüş; güven düzeyi, gerekçe ve görüşü neyin değiştireceği. Diğer sekmeler kanıt sayfalarıdır.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import * as Fmt from '../core/format'
import type { MacroData, World } from '../core/macro'
import { world as worldOf } from '../core/macro'
import { LAYER_LABEL, outlookView, type Layer, type LayerId, type Outlook as View, type OutlookView, type Stance } from '../core/outlook'
import { agoLabel, TF_LABEL, type Study, type Tf } from '../core/study'
import { MACRO_ASSETS } from '../core/subject'
import { loadMacro } from '../data/macro'
import { loadSubject, type Subject } from '../data/subjects'
import { barDate } from '../ui/CandleChart'
import { Icon } from '../ui/Icon'
import { href, setQuery, useRoute } from '../ui/router'
import { nameOf, recentOf, Verdict, Workbench } from './Workbench'

export { loadMacro }
const SEEN_KEY = 'piyasa.gorunum.v1'
const ASSET_KEY = 'piyasa.gorunum.varlik'
const p0 = (v: number) => '%' + Fmt.number(v * 100, 0)
const price = (v?: number) => (v == null ? '—' : Fmt.number(v, v >= 1000 ? 0 : v >= 10 ? 2 : 4))
const TONE: Record<Stance, 'up' | 'down' | 'flat'> = { Olumlu: 'up', 'Hafif olumlu': 'up', Nötr: 'flat', 'Hafif olumsuz': 'down', Olumsuz: 'down' }
const ORDER: LayerId[] = ['deger', 'makro', 'benzer', 'trend']
const TFS: Tf[] = ['M', 'W', 'D']

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
      {prefix ?? `${o.asset.short}: bütün kanıtlarla görünüm`} <a className={'ov-stance ' + TONE[o.stance]} href={href('analiz/olaylar')}>{o.stance}</a>
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
  const world = useMemo(() => (data ? worldOf(data) : undefined), [data])
  return <Page v={v} world={world} loading={data === undefined} generated={data?.generated} practical={practical} />
}

const join = (a: string[]) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' ve ' + a[a.length - 1])

interface Hit { subject: Subject; tf: Tf; study: Study; diff: number }
/** Bütün varlıklarda, üç zaman diliminde yakın zamanda gerçekleşen olaylar */
function useAcross(world: World | undefined) {
  const [subjects, setSubjects] = useState<Subject[] | undefined>()
  useEffect(() => { let alive = true; void Promise.all(MACRO_ASSETS.map((a) => loadSubject(a.id))).then((l) => { if (alive) setSubjects(l.filter((x): x is Subject => !!x)) }); return () => { alive = false } }, [])
  return useMemo(() => {
    if (!subjects) return undefined
    const hits: Hit[] = []
    let tested = 0, recent = 0
    for (const subject of subjects) for (const tf of TFS) {
      const r = recentOf(subject, tf, world)
      tested += r.tested; recent += r.studies.length
      for (const study of r.studies) if (study.best) hits.push({ subject, tf, study, diff: Math.abs(study.best.up - study.best.base) })
    }
    // Aynı varlık ve zaman diliminden en çok iki olay; en belirgin olan önce
    hits.sort((a, b) => b.diff - a.diff)
    const seen = new Map<string, number>()
    const list = hits.filter((h) => { const k = h.subject.id + h.tf; const n = seen.get(k) ?? 0; seen.set(k, n + 1); return n < 2 })
    return { subjects, list, tested, recent }
  }, [subjects, world])
}

function Page({ v, world, loading, generated, practical }: { v?: OutlookView; world?: World; loading: boolean; generated?: number; practical?: ReactNode }) {
  const { query } = useRoute()
  const across = useAcross(world)
  const saved = (() => { try { return localStorage.getItem(ASSET_KEY) } catch { return null } })()
  // Adreste varlık yoksa başlıktaki olayın varlığı açılır; o da yoksa son bakılan
  const wanted = query.get('v')?.toUpperCase() ?? across?.list[0]?.subject.id ?? saved ?? 'GOLD'
  const subject = across?.subjects.find((x) => x.id === wanted) ?? across?.subjects[0]
  const [focus, setFocus] = useState<{ tf: Tf; event: string; n: number } | undefined>()
  const pick = (id: string, f?: { tf: Tf; event: string }) => {
    try { localStorage.setItem(ASSET_KEY, id) } catch { /* depolama kapalı */ }
    setQuery('v', id, true)
    setFocus(f ? { ...f, n: Date.now() } : undefined)
    if (f) document.getElementById('tezgah')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const top = across?.list[0]
  const [all, setAll] = useState(false)
  const shown = across ? (all ? across.list : across.list.slice(0, 8)) : []
  return (
    <>
      <header className="an-head wb-head">
        <h2>Yakın zamanda ne oldu, geçmişte aynı şeyden sonra ne olmuştu?</h2>
      </header>
      {!across && <p className="an-answer" aria-live="polite">Mum verileri yükleniyor…</p>}

      {across && subject && (
        <div id="tezgah">
          <div className="wb-assets" role="group" aria-label="Varlık">
            {across.subjects.map((a) => <button key={a.id} type="button" className="chip" aria-pressed={a.id === subject.id} onClick={() => pick(a.id)}>{a.short}</button>)}
            <a className="chip link" href={href('analiz/hisse')}>Hisse…</a>
          </div>
          <Workbench key={subject.id} subject={subject} world={world} defaultTf="W" initialEvent={query.get('e') ?? undefined} initialTf={((t) => (t === 'M' || t === 'W' || t === 'D' ? t : undefined))(query.get('tf'))} focus={focus} lead={top && top.subject.id === subject.id ? { tf: top.tf, event: top.study.def.id } : undefined} />
        </div>
      )}

      {across && (
        <section className="an-group">
          <h3>Bütün varlıklarda: yakın zamanda olan ve geçmişte sonrası her zamankinden farklı çıkmış olaylar</h3>
          {!across.list.length && <p className="note">Hiçbir varlıkta, sonrasını her zamankinden belirgin biçimde ayrıştırmış bir olay yok.</p>}
          {shown.map((h) => (
            <button key={h.subject.id + h.tf + h.study.def.id} type="button" className="ev-row btn-row" onClick={() => pick(h.subject.id, { tf: h.tf, event: h.study.def.id })}>
              <span className="what"><b>{nameOf(h.subject, h.study.def)}</b><em>{barDate(h.tf, h.subject.frames[h.tf]!.t[h.study.recent!.index])}, {agoLabel(h.tf, h.study.recent!.elapsed)}; {TF_LABEL[h.tf].toLocaleLowerCase('tr')} veri</em></span>
              <Verdict stats={h.study.view} />
            </button>
          ))}
          {across.list.length > 8 && <button type="button" className="btn ghost small" onClick={() => setAll((x) => !x)}>{all ? 'Daha az göster' : `Hepsini göster (${across.list.length})`}</button>}
          {across.list.length > 0 && <p className="note">{Fmt.number(across.tested, 0)} olay sınandı; bu kadar sınamada yaklaşık {Math.max(1, Math.round(across.recent * 0.05))} tanesi şans eseri belirgin görünür.</p>}
        </section>
      )}

      {loading && <p className="note" aria-live="polite">Makro veriler yükleniyor…</p>}
      {!loading && !v && <p className="note">Makro veriler alınamadı; makro tablo ve görüş tablosu gösterilemiyor.</p>}
      {v && <Stance12 v={v} generated={generated} />}

      {practical}

      <details className="an-how">
        <summary>Olasılıklar nasıl hesaplanıyor, nelere dikkat etmeli</summary>
        <ul>
          <li><b>Kutudaki sayı</b>: “9’da 3”, olayın önceki 9 seferinin 3’ünde fiyatın seçilen süre sonra daha yukarıda olduğunu söyler. “Karşılaştırma” cümlesi, olay olsun olmasın varlığın herhangi bir andan aynı süre sonra 10 seferin kaçında yukarıda olduğunu söyler; olayın bir şey söyleyip söylemediği bu ikisinin farkından anlaşılır. Kutulara dokunarak süreyi değiştirirsin; grafikteki okların rengi de o süreye göre boyanır.</li>
          <li><b>Olay</b>: bir durumun başladığı mumdur: sert düşüş ya da yükseliş (varlığın kendi oynaklığına göre), uzun ortalamanın kırılması, 1 ve 3 yılın zirvesi ya da dibi, art arda aynı yönde mumlar, zirveden %10, %20, %35 gerileme, RSI’ın 30’un altına inmesi ya da 70’in üstüne çıkması, Bollinger bandının dışına taşma, MACD kesişimi, hacimli satış ve alış. Aylık veride makro durumların başlaması da olaydır (reel faizin eksiye dönmesi, doların güçlenmesi gibi). Kendi olayını da tanımlayabilirsin.</li>
          <li><b>Yukarıda olma oranı</b>: olayın geçmişteki her örneğinden sonra, seçilen vadede fiyatın daha yukarıda olduğu örneklerin payı. Olay yakın zamanda gerçekleştiyse ölçüm, olaydan bugüne geçen süre kadar ilerlenip oradan yapılır; tablo “bugünden sonrası” içindir. Olay yakın zamanda gerçekleşmediyse tablo olay mumundan sonrası içindir: tekrar gerçekleştiğinde ne beklenebileceğini gösterir.</li>
          <li><b>Her zaman</b>: varlığın herhangi bir mumundan aynı süre sonraki yukarıda olma oranı. Asıl bilgi olağanla farktır.</li>
          <li><b>“Her zamankinden belirgin iyi / kötü”</b>: en az 8 örnek, her zamankinden en az 12 puan fark, %95 güven aralığı her zamanki oranı dışarıda bırakıyor ve geçmişin iki yarısında da aynı yönde. Rastgele yürüyüş verisinde olayların %5’inden azı bu şartları sağlar.</li>
          <li><b>Çoklu sınama</b>: onlarca olay birden sınandığı için birkaç renkli hücre şans eseri çıkar. Listenin üstündeki sayı bunu söyler. Aynı yönü gösteren birkaç olay, farklı zaman dilimlerinde tekrar eden bulgu ve çok örnek, tek bir renkli hücreden daha güvenilirdir.</li>
          <li><b>Hücredeki ayrıntı</b>: aralık, gerçek oranın %80 olasılıkla içinde bulunduğu yerdir. “Yukarı / aşağı” satırı, yukarıda biten örneklerin ortalama kazancı ile aşağıda bitenlerin ortalama kaybıdır: oran %60 olsa bile kayıplar kazançlardan büyükse beklenti olumsuz olabilir.</li>
          <li>Veri TradingView’den: aylık mumlar 1960’lara, haftalık 1990’lara, günlük yaklaşık 12 yıl geriye gider (varlığa göre değişir). Günde bir yenilenir; son mum kapanmamış olabilir.</li>
          <li>Bunlar tahmin ya da yatırım tavsiyesi değildir; geçmişte benzer olaylardan sonra ne olduğunun sayımıdır. Hiçbir dönem bugünün aynısı değildir.</li>
        </ul>
        <p><a href={href('sozluk/olay-incelemesi')}>Sözlükte ayrıntısı</a></p>
      </details>
    </>
  )
}

/** Makro tablo ve 12 aylık görüş tablosu (dört kanıt): olaylardan bağımsız, bugünkü durumun okunması */
function Stance12({ v, generated }: { v: OutlookView; generated?: number }) {
  const clear = (o: View) => o.stance !== 'Nötr' && (Math.abs(o.score) >= 2 || o.conviction !== 'düşük')
  const pro = v.list.filter((o) => clear(o) && TONE[o.stance] === 'up'), con = v.list.filter((o) => clear(o) && TONE[o.stance] === 'down')
  const changes = useChanges(v)
  return (
    <>
      <details className="an-how ov-regime-d">
        <summary>Makro tablo ({v.month}): {v.regime.title}</summary>
        <ul>{v.regime.lines.map((l) => <li key={l}>{l}</li>)}</ul>
        <p><a href={href('analiz/makro')}>Makro tablonun ayrıntısı, örüntüler ve benzer dönemler</a></p>
      </details>

      {changes.length > 0 && (
        <section className="ov-changes" role="status">
          <b>Son ziyaretinden beri değişenler</b>
          <ul>{changes.map((c) => <li key={c}>{c}</li>)}</ul>
        </section>
      )}

      <section className="ov-state">
        <details className="an-how">
          <summary>12 aylık görüş: {pro.length || con.length ? [pro.length ? 'olumlu ' + join(pro.map((o) => o.asset.short)) : '', con.length ? 'olumsuz ' + join(con.map((o) => o.asset.short)) : ''].filter(Boolean).join('; ') : 'belirgin bir yön yok'}</summary>
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
          <div className="vd-list">{v.list.map((o) => <Card key={o.asset.id} o={o} open={false} />)}</div>
          <ul className="ov-method">
            <li><b>Dört kanıt</b> ayrı ayrı hesaplanır. <b>Değerleme</b>: fiyatın ilgili para arzına oranı kendi geçmişinin neresinde. <b>Makro örüntü</b>: şu an geçerli olan ve geçmişte en az 8 ayrı dönemde, üç çağda aynı yönde sonuç vermiş durumlar. <b>Benzer dönemler</b>: bugünkü makro tabloya en yakın 8 dönemden 12 ay sonra olanlar. <b>Trend</b>: fiyat 10 aylık ortalamasının üstünde mi.</li>
            <li><b>Sicil şartı</b>: bir kanıt, o varlıkta geçmişte gerçekten ayırt edici olmuşsa görüşe katılır (12 ay sonraki yukarıda olma oranı her zamankinden en az 5 puan farklı). Olmamışsa soluk görünür.</li>
            <li><b>Görüş</b> katılan kanıtların oylarının toplamıdır; <b>güven</b> üç kanıt aynı yönde ve karşı çıkan yoksa yüksek, iki kanıt aynı yöndeyse orta, aksi hâlde düşük. Süre 12 aydır.</li>
            {generated && <li>Aylık seriler {Fmt.dateTime(generated)} itibarıyla; günde bir yenilenir.</li>}
          </ul>
        </details>
      </section>
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
                  Sicil: bu durumdayken 12 ay sonra {p0(l.record.hit)} yukarıdaydı, her zaman {p0(l.record.base)} ({l.record.n} {l.id === 'benzer' ? 'dönem' : 'ay'}){l.counts ? '' : '; ayırt edici değil, görüşe katılmıyor'}.
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
