/**
 * Analiz › Tepe ve taban (açılış sayfası): seçilen varlık şu an bir taban ya da tepe oluşumunda mı?
 *   #/analiz?v=GOLD&h=Q        #/analiz?v=NASDAQ:NVDA&h=Y
 * Tarihsel tepe ve tabanlar altı hassasiyette bulunur; o günlerin göstergeleri ve makro durumundan öğrenilen örüntü
 * bugüne uygulanır. Sonuç geriye dönük sınamayla birlikte verilir (core/pivots.ts, data/pivots.json).
 */
import { useEffect, useMemo, useState } from 'react'
import * as Fmt from '../core/format'
import { assess, LEVELS, pivots, scaleOf, SCALES, SIDE_LABEL, type Assessment, type PivotEntry, type Scale, type Side } from '../core/pivots'
import { isStock, MACRO_ASSETS } from '../core/subject'
import { loadTurning, type Turning as Data } from '../data/pivots'
import { barDate, CandleChart, type Mark } from '../ui/CandleChart'
import { href, setQuery, useRoute } from '../ui/router'
import { Picker } from './StockAnalysis'

const ASSET_KEY = 'piyasa.donus.varlik'
const SCALE_KEY = 'piyasa.donus.hassasiyet'
const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* depolama kapalı */ } }
const p0 = (v: number) => '%' + Fmt.number(v * 100, v < 0.1 ? 1 : 0)
const pct = (v: number, d = 0) => (v > 0 ? '+' : v < 0 ? '−' : '') + '%' + Fmt.number(Math.abs(v * 100), d)
const price = (v: number) => Fmt.number(v, v >= 1000 ? 0 : v >= 10 ? 2 : 4)
const cap = (s: string) => s.replace(/^./, (c) => c.toLocaleUpperCase('tr'))
const PLURAL = { low: { gen: 'tabanların', loc: 'Tabanlarda' }, high: { gen: 'tepelerin', loc: 'Tepelerde' } }
const RANGE: Record<string, string> = { M: '1', Q: '1', H: '3', Y: '3', Y5: 'all', ALL: 'all' }

export function Turning() {
  const { query } = useRoute()
  const id = (query.get('v') ?? read(ASSET_KEY) ?? 'GOLD').toUpperCase()
  const sc = scaleOf(query.get('h') ?? read(SCALE_KEY) ?? 'Q')
  const [data, setData] = useState<{ id: string; d?: Data } | undefined>()
  useEffect(() => {
    let alive = true
    setData((x) => (x?.id === id ? x : undefined))
    void loadTurning(id).then((d) => { if (alive) setData({ id, d }) })
    return () => { alive = false }
  }, [id])
  const pick = (v: string) => { write(ASSET_KEY, v); setQuery('v', v, true) }
  const pickScale = (s: Scale) => { write(SCALE_KEY, s.id); setQuery('h', s.id, true) }
  return (
    <>
      <header className="an-head wb-head"><h2>Şu an bir taban mı, tepe mi oluşuyor?</h2></header>
      <div className="wb-assets" role="group" aria-label="Varlık">
        {MACRO_ASSETS.map((a) => <button key={a.id} type="button" className="chip" aria-pressed={a.id === id} onClick={() => pick(a.id)}>{a.short}</button>)}
      </div>
      <Picker current={isStock(id) ? id : undefined} onPick={pick} />
      <div className="segmented tn-scales" role="group" aria-label="Hassasiyet">
        {SCALES.map((s) => <button key={s.id} type="button" aria-pressed={s.id === sc.id} onClick={() => pickScale(s)}>{s.label}</button>)}
      </div>
      {!data ? <p className="an-answer" aria-live="polite">Geçmiş yükleniyor…</p>
        : !data.d ? <p className="an-answer">{Fmt.ticker(id)} için günlük veri yok.</p>
          : <Result key={id + sc.id} d={data.d} sc={sc} />}
    </>
  )
}

function Result({ d, sc }: { d: Data; sc: Scale }) {
  const b = d.subject.frames.D!, n = b.t.length, name = d.subject.short
  const entries = d.universe?.scales[sc.id]
  const view = useMemo(() => {
    const out: Partial<Record<Side, Assessment>> = {}
    for (const side of ['low', 'high'] as Side[]) { const e = entries?.[side]; if (e && n >= sc.min + 60) out[side] = assess(b, d.macro, sc, side, e) }
    const lows = pivots(b, sc, 'low'), highs = pivots(b, sc, 'high')
    const marks: Mark[] = [
      ...lows.confirmed.map((i) => ({ index: i, outcome: 'up' as const })), ...lows.pending.map((i) => ({ index: i, outcome: 'open' as const })),
      ...highs.confirmed.map((i) => ({ index: i, outcome: 'down' as const, top: true })), ...highs.pending.map((i) => ({ index: i, outcome: 'open' as const, top: true })),
    ].sort((x, y) => x.index - y.index)
    return { out, marks, lows, highs }
  }, [b, d.macro, sc, entries, n])
  const low = view.out.low, high = view.out.high
  const rank = (a?: Assessment) => (a ? (a.level === 'candidate' ? 2 : a.level === 'hint' ? 1 : 0) : 0)
  const lead = rank(low) >= rank(high) ? low : high
  const scaleName = sc.label.toLocaleLowerCase('tr')
  const answer = !low && !high ? `Bu hassasiyette ${name} için model yok; grafikte tarihsel tepe ve tabanlar işaretli.`
    : rank(low) === 2 && rank(high) === 2 ? `${name}: hem taban hem tepe belirtileri var; yön belirsiz.`
      : !lead || rank(lead) === 0 ? `${name} şu an ${scaleName} bir taban ya da tepe oluşumunda görünmüyor.`
        : rank(lead) === 2 ? `${name} şu an ${scaleName} ${SIDE_LABEL[lead.side]} adayı.`
          : `${name}: ${scaleName} ${SIDE_LABEL[lead.side]} belirtileri var, ama aday sayılacak kadar güçlü değil.`
  return (
    <>
      <p className={'an-answer tn-answer ' + (lead && rank(lead) === 2 ? (lead.side === 'low' ? 'up' : 'down') : '')} aria-live="polite">{answer}</p>
      <div className="tn-cards">
        {(['low', 'high'] as Side[]).map((side) => <Card key={side} side={side} a={view.out[side]} e={entries?.[side]} d={d} sc={sc} />)}
      </div>
      <CandleChart bars={b} tf="D" title={d.subject.label} marks={view.marks} defaultRange={RANGE[sc.id]}
        legend={<><span><b className="cc-arrow up">▲</b>{scaleName} taban</span><span><b className="cc-arrow down">▼</b>{scaleName} tepe</span><span><b className="cc-arrow">▲</b>henüz teyit edilmemiş</span></>} />
      <details className="an-how">
        <summary>Nasıl hesaplanıyor, nelere dikkat etmeli</summary>
        <ul>
          <li><b>Taban ve tepe</b>: {sc.label} taban, günün en düşüğünün {Number.isFinite(sc.back) ? `önceki ${sc.back} işlem gününün` : 'o güne kadarki bütün geçmişin'} ve sonraki {sc.fwd} işlem gününün en düşüğü olduğu gündür; tepe bunun tersidir. Bu yüzden bir taban ancak {sc.fwd} işlem günü sonra kesinleşir; o süre dolmadan grafikte gri görünür.</li>
          <li><b>Örüntü</b>: {d.universe ? `${d.universe.label} içindeki ${Fmt.number(d.universe.series, 0)} varlığın` : 'pazardaki varlıkların'} geçmişindeki bütün tepe ve tabanların çevresindeki günler alınır. O günlerde göstergelerin (RSI, Bollinger, ortalamalara uzaklık, son haftaların hareketi, MACD, oynaklık, hacim, mum fitilleri) ve makro ortamın (pazar endeksi, VIX, dolar endeksi, ABD 10 yıllık faizi{d.subject.market === 'TR' ? ', Dolar/TL' : ''}) diğer günlerden nasıl ayrıştığı istatistiksel bir modelle öğrenilir.</li>
          <li><b>Olasılık</b>: modelin bugün için verdiği “dönüş gününün birkaç gün yakınında ve fiyatı ona yakın” olma olasılığıdır. Rastgele bir günün olasılığıyla karşılaştırılır; {LEVELS.candidate} katını geçince “aday”, {LEVELS.hint} katını geçince “belirti” denir.</li>
          <li><b>Sınama</b>: model 2021 öncesinin verisiyle öğrenildi ve 2021 Temmuz’dan sonraki, hiç görmediği dönemde ölçüldü. Kartlardaki sınama cümlesi o dönemin sonucudur. Yayındaki model bütün veriyle yeniden öğrenilir.</li>
          <li><b>Sınırı</b>: “aday” denen günlerin çoğu gerçek dönüş günü değildir (kartta yazan oran kadarı öyledir); fiyat aday olduktan sonra daha da düşebilir ya da yükselebilir. Model dönüşü önceden bilmez; dönüşlerin tipik koşullarının oluşup oluşmadığını söyler. Tepeler tabanlardan daha zor tanınır.</li>
          <li><b>Hangi fiyatta</b>: diğer her şey aynı kalıp bugün o fiyattan kapanılsaydı adaylık eşiğinin aşılacağı fiyattır. Fiyata günler içinde yavaşça gelinirse göstergeler farklı oluşur; bu yüzden yaklaşık bir düzeydir.</li>
          <li>BIST hisseleri dolar bazında değerlendirilir. Veri günlüktür (yaklaşık 12 yıl); 5 yıllık ve tüm zamanlar hassasiyetinde örnek azdır.{d.generated ? ` Model ${Fmt.dateTime(d.generated)} itibarıyla.` : ''}</li>
          <li>Bu bir yatırım tavsiyesi değildir.</li>
        </ul>
        <p><a href={href('analiz/olaylar', { v: isStock(d.subject.id) ? undefined : d.subject.id })}>Olaylar sayfası</a>: belirli bir olaydan (sert düşüş, RSI 30 gibi) sonra geçmişte ne olduğu.</p>
      </details>
    </>
  )
}

function Card({ side, a, e, d, sc }: { side: Side; a?: Assessment; e?: PivotEntry; d: Data; sc: Scale }) {
  const b = d.subject.frames.D!, n = b.t.length, what = SIDE_LABEL[side]
  const horizon = Math.min(sc.fwd, 63) <= 21 ? '1 ay' : '3 ay'
  if (!a || !e) return (
    <section className="tn-card">
      <h3>{cap(what)}</h3>
      <p className="tn-say">{n < sc.min + 60 ? 'Bu hassasiyet için geçmiş kısa.' : 'Bu hassasiyette pazar genelinde yeterli örnek yok; örüntü çıkarılamadı.'}</p>
    </section>
  )
  const tone = a.level === 'candidate' ? (side === 'low' ? 'up' : 'down') : ''
  const m5 = e.test?.mult.find((x) => x.m === LEVELS.candidate)
  const last = a.own.last
  const pro = a.factors.filter((f) => f.contrib > 0.08).slice(0, 4), con = a.factors.filter((f) => f.contrib < -0.08).slice(0, 4)
  return (
    <section className={'tn-card ' + tone}>
      <h3>{cap(what)}: {a.level === 'candidate' ? 'aday' : a.level === 'hint' ? 'belirtiler var' : 'değil'}</h3>
      <p className="tn-say">
        Bugünün bir {sc.label.toLocaleLowerCase('tr')} {what} bölgesinde olma olasılığı <b className="num">{p0(a.p)}</b>. Rastgele bir günde bu olasılık {p0(a.base)}.
      </p>
      <div className="tn-meter" aria-hidden><i style={{ width: `${Math.min(100, (a.ratio / (LEVELS.candidate * 2)) * 100)}%` }} /><b style={{ left: '50%' }} /></div>
      <p className="tn-meter-note">çizgi: adaylık eşiği (rastgelenin {LEVELS.candidate} katı)</p>
      {a.level !== 'candidate' && (
        <p className="tn-say">{a.trigger
          ? <>Aday sayılması için fiyatın yaklaşık <b className="num">{price(a.trigger.price)}</b> düzeyine {side === 'low' ? 'inmesi' : 'çıkması'} gerekir (bugünden {pct(a.trigger.change)}).</>
          : <>Fiyat tek başına {side === 'low' ? 'düşerek' : 'yükselerek'} bu örüntüyü oluşturmuyor; diğer koşulların da değişmesi gerekir.</>}</p>
      )}
      <p className="tn-say tn-dim">
        {a.own.count === 0 && last != null
          ? <>{d.subject.short} verisinde teyitli bir {sc.label.toLocaleLowerCase('tr')} {what} yok. {barDate('D', b.t[last])} tarihli {side === 'low' ? 'dip' : 'zirve'} henüz teyit edilmedi; teyit için {sc.fwd} işlem günü geçmesi gerekir.</>
          : a.own.count > 0
          ? <>{d.subject.short} geçmişte {a.own.count} kez {sc.label.toLocaleLowerCase('tr')} {what} yaptı{a.own.gap ? <>; ikisi arasında ortanca {a.own.gap} işlem günü geçti</> : null}. {last != null ? <>Sonuncusu {barDate('D', b.t[last])} ({a.own.since} işlem günü önce{a.own.pending === last ? ', henüz teyit edilmedi' : ''}).</> : null}</>
          : <>{d.subject.short} verisinde bu hassasiyette teyitli bir {what} yok.</>}
      </p>
      <p className="tn-test">
        {a.tested && e.test && m5
          ? <>Sınama (2021 sonrası, {d.universe?.label}): “aday” denen günlerin <b className="num">{p0(m5.prec)}</b> kadarı gerçekten bir {what} yakınındaydı (rastgele gün {p0(e.test.base)}); gerçek {PLURAL[side].gen} {p0(m5.recall)} kadarı yakalandı. Aday günlerden {horizon} sonra fiyat {p0(m5.up)} oranında yukarıdaydı (bütün günlerde {p0(e.test.up)}).</>
          : <>Bu hassasiyette sınama güvenilir bir sonuç vermedi; olasılığı ihtiyatla oku.</>}
      </p>
      <details className="tn-why">
        <summary>Neye bakıyor: {pro.length ? `lehine ${pro.length}` : 'lehine yok'}, {con.length ? `aleyhine ${con.length}` : 'aleyhine yok'}</summary>
        <table className="result-table tn-table">
          <thead><tr><th>Gösterge</th><th className="r">Şimdi</th><th className="r">{PLURAL[side].loc} genelde</th><th className="r">Her zaman</th></tr></thead>
          <tbody>
            {[...pro, ...con].map((f) => (
              <tr key={f.id}>
                <td><span className={'tn-dir ' + (f.contrib > 0 ? 'pro' : 'con')}>{f.contrib > 0 ? 'lehine' : 'aleyhine'}</span>{f.label}</td>
                <td className="r num">{f.now}</td><td className="r num">{f.typical}</td><td className="r num">{f.usual}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  )
}
