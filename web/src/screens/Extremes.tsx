/**
 * Analiz › Hisse dipleri: satış abartıldı mı, dönüşe yakın bir yerde miyiz?
 *   #/analiz/hisse-dip?v=NASDAQ:NVDA       #/analiz/hisse-dip?v=GOLD
 * Hissenin düşüşünün sertliği (kendi oynaklığına göre) ve pazar genelindeki satış birlikte okunur. Her sonuç
 * geçmişteki bütün benzer anların sonucu ve dönem dönem dökümüyle verilir (core/extremes.ts, data/extremes.json).
 */
import { useEffect, useMemo, useState } from 'react'
import * as Fmt from '../core/format'
import { breadthAt, extremeScore, HORIZON_LABEL, HORIZONS, percentileOf, priceForScore, statusOf, type Block, type MarketExtremes, type Metrics, type RuleStats, type Status, type Strategy } from '../core/extremes'
import { isStock, MACRO_ASSETS } from '../core/subject'
import { loadExtremes, type ExtremeData } from '../data/extremes'
import { barDate, CandleChart, type Mark } from '../ui/CandleChart'
import { href, setQuery, useRoute } from '../ui/router'
import { Picker } from './StockAnalysis'

const ASSET_KEY = 'piyasa.dip.varlik'
const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* depolama kapalı */ } }
const pct = (v: number, d = 0) => (v > 0.00005 ? '+' : v < -0.00005 ? '−' : '') + '%' + Fmt.number(Math.abs(v * 100), d)
const ten = (v: number) => Fmt.number(Math.round(v * 10), 0)
const price = (v: number) => Fmt.number(v, v >= 1000 ? 0 : v >= 10 ? 2 : 4)
const dayDate = (d: number) => barDate('D', d * 86400)
const share = (v: number) => '%' + Fmt.number(v * 100, v < 0.1 ? 1 : 0)

export function Extremes() {
  const { query } = useRoute()
  const id = (query.get('v') ?? read(ASSET_KEY) ?? 'NASDAQ:NVDA').toUpperCase()
  const [data, setData] = useState<{ id: string; d?: ExtremeData } | undefined>()
  useEffect(() => {
    let alive = true
    setData((x) => (x?.id === id ? x : undefined))
    void loadExtremes(id).then((d) => { if (alive) setData({ id, d }) })
    return () => { alive = false }
  }, [id])
  const pick = (v: string) => { write(ASSET_KEY, v); setQuery('v', v, true) }
  return (
    <>
      <header className="an-head wb-head"><h2>Satış abartıldı mı? Dönüşe yakın bir yerde miyiz?</h2></header>
      <Picker current={isStock(id) ? id : undefined} onPick={pick} />
      <div className="wb-assets" role="group" aria-label="Varlık">
        {MACRO_ASSETS.map((a) => <button key={a.id} type="button" className="chip" aria-pressed={a.id === id} onClick={() => pick(a.id)}>{a.short}</button>)}
      </div>
      {!data ? <p className="an-answer" aria-live="polite">Geçmiş yükleniyor…</p>
        : !data.d ? <p className="an-answer">{Fmt.ticker(id)} için günlük veri yok.</p>
          : <Result key={id} d={data.d} />}
    </>
  )
}

function Result({ d }: { d: ExtremeData }) {
  const b = d.subject.frames.D!, n = b.t.length, name = d.subject.short, m = d.market
  const view = useMemo(() => {
    const S = extremeScore(b)
    if (!m) return { S, now: S[n - 1], marks: [] as Mark[] }
    const marks: Mark[] = []
    let last = -1e9
    for (let i = 260; i < n; i++) {
      const st = statusOf(m, S[i], breadthAt(m, b.t[i]))
      if ((st === 'strong' || st === 'near') && i - last >= 21) {
        last = i
        marks.push({ index: i, outcome: i + 63 < n ? (b.c[i + 63] > b.c[i] ? 'up' : 'down') : 'open', label: st === 'strong' ? undefined : '' })
      }
    }
    return { S, now: S[n - 1], marks }
  }, [b, m, n])
  if (!m) return <p className="an-answer">Bu varlık için karşılaştırma verisi yok.</p>
  const br = breadthAt(m, b.t[n - 1])
  const st = statusOf(m, view.now, br)
  const pctile = percentileOf(m, view.now)
  const trig = st !== 'strong' && st !== 'near' ? priceForScore(b, m.th.q01) : undefined
  const head: Record<Status, string> = {
    strong: `${name}: satış abartılı. Düşüş geçmişin en sert %1’lik dilimi içinde ve pazar genelinde panik satışı var.`,
    near: m.breadth ? `${name}: abartılı satışa yakın. Düşüş en sert %2’lik dilimde ve pazar genelinde satış var.` : `${name}: düşüş kendi geçmişinin en sert %2’lik dilimi içinde.`,
    alone: `${name} sert düşüyor ama tek başına; pazar sakin. Geçmişte bu, dönüş işareti olmadı.`,
    stretched: `${name}: düşüş sert ama abartılı değil.`,
    none: `${name}: abartılı bir satış yok.`,
  }
  const tone = st === 'strong' || st === 'near' ? 'up' : st === 'alone' ? 'down' : ''
  const rule = m.breadth ? m.rules.strong : m.rules.near
  return (
    <>
      <p className={'an-answer tn-answer ' + tone} aria-live="polite">{head[st]}</p>

      <div className="ex-gauges">
        <Gauge title={`${name} ne kadar sert düştü`} value={pctile < 1 ? `en sert %${Fmt.number(pctile * 100, pctile < 0.02 ? 1 : 0)}’lik dilim` : 'olağan aralıkta'}
          fill={Math.max(0, Math.min(1, view.now / (m.th.q005 * 1.25)))} mark={m.th.q01 / (m.th.q005 * 1.25)} markLabel="eşik: en sert %1"
          note={`Son 1 hafta, 1 ay, 3 ayın hareketi, 200 günlük ortalamaya uzaklık ve RSI; ${name} varlığının kendi oynaklığına göre ölçülür ve ${m.label} içindeki bütün günlerle karşılaştırılır.`} />
        {m.breadth && br != null && (
          <Gauge title="Pazar genelinde satış" value={`hisselerin ${share(br)}’i aşırı satılmış`} fill={Math.min(1, br / (m.breadth.q95 * 2))} mark={0.5} markLabel={`panik eşiği: ${share(m.breadth.q95)}`}
            note={`${m.label} içinde aynı gün sert düşüşte olan hisselerin payı. Sakin bir günde ${share(m.breadth.q90 / 3)} civarındadır.`} />
        )}
      </div>

      {st !== 'strong' && (
        <p className="tn-say ex-where">
          {trig && trig < b.c[n - 1]
            ? <>Fiyat yaklaşık <b className="num">{price(trig)}</b> düzeyine inerse (bugünden <b className="num">{pct(trig / b.c[n - 1] - 1)}</b>) düşüş en sert %1’lik dilime girer{m.breadth ? <>; abartılı satış için ayrıca pazar genelinde satışın panik eşiğini geçmesi gerekir{br != null ? ` (şu an ${share(br)}, eşik ${share(m.breadth.q95)})` : ''}</> : null}.</>
            : st === 'alone' ? <>Düşüş zaten en sert dilimde; eksik olan pazar genelindeki satış{br != null && m.breadth ? ` (şu an ${share(br)}, eşik ${share(m.breadth.q95)})` : ''}.</> : null}
        </p>
      )}

      {rule && <Evidence m={m} rule={rule} name={name} kind={m.breadth ? 'strong' : 'near'} />}
      {m.breadth && m.rules.alone && <Alone s={m.rules.alone} label={m.label} />}
      {m.breadth && m.episodes.length > 0 && <Episodes m={m} />}
      {m.strategy && <StrategyView s={m.strategy} m={m} />}

      <CandleChart bars={b} tf="D" title={d.subject.label} marks={view.marks} defaultRange="all"
        legend={<><span><b className="cc-arrow up">▲</b>{m.breadth ? 'abartılı satış' : 'en sert düşüş'}; 3 ay sonra yukarıda</span><span><b className="cc-arrow down">▲</b>3 ay sonra aşağıda</span><span><b className="cc-arrow">▲</b>3 ay dolmadı</span></>} />

      {m.rules.top && <Top s={m.rules.top} />}

      <details className="an-how">
        <summary>Nasıl hesaplanıyor, nelere dikkat etmeli</summary>
        <ul>
          <li><b>Düşüşün sertliği</b>: son 1 hafta, 1 ay ve 3 ayın hareketi, 200 günlük ortalamaya uzaklık ve RSI’ın ortalaması. Hareketler varlığın kendi oynaklığına bölünür: oynak bir hissede %20 düşüş olağan, sakin bir hissede olağanüstü olabilir.</li>
          <li><b>Dilim</b>: bu puan, aynı pazardaki bütün hisselerin 2014–2020 arasındaki bütün günleriyle karşılaştırılır. “En sert %1” o günlerin yüzde birinden daha sert demektir.</li>
          <li><b>Pazar genelinde satış</b>: aynı gün sert düşüşte olan hisselerin payı. Panik eşiği, 2021 öncesi günlerin en yüksek %5’lik dilimidir.</li>
          <li><b>Neden ikisi birlikte</b>: bir hisse pazar sakinken tek başına sert düşüyorsa genellikle hisseye özgü kötü bir haber vardır ve düşüş sürer. Bütün pazar panikle satılırken iyi hisseler de satılır; abartı ve sonrasındaki toparlanma burada görülür. Sınama bunu doğruladı.</li>
          <li><b>Sınama</b>: eşikler yalnızca 2021 öncesinden seçildi; 2021 sonrası, yöntemin hiç görmediği dönemdir. Aynı hissede iki sinyal arasında en az 21 işlem günü aranır.</li>
          <li><b>Sınırı</b>: sinyal dibi değil, dibe yakın bölgeyi gösterir; sonrasında fiyat bir süre daha düşebilir (tabloda “arada en fazla düşüş”). Panik dönemleri seyrektir: sonuçlar on kadar ayrı döneme dayanır. Kur krizi gibi ülkeye özgü çöküşlerde (BIST, 2018) toparlanma gelmeyebilir.</li>
          <li>BIST hisseleri dolar bazında değerlendirilir. Makro varlıklarda pazar genişliği olmadığı için yalnızca varlığın kendi düşüşüne bakılır; kanıt zayıftır.{d.generated ? ` Veri ${Fmt.dateTime(d.generated)} itibarıyla.` : ''}</li>
          <li>Bu bir yatırım tavsiyesi değildir.</li>
        </ul>
        <p><a href={href('sozluk/abartili-satis')}>Sözlükte ayrıntısı</a>. <a href={href('analiz/olaylar')}>Olaylar</a>: belirli bir olaydan sonra geçmişte ne olduğu.</p>
      </details>
    </>
  )
}

function Gauge({ title, value, fill, mark, markLabel, note }: { title: string; value: string; fill: number; mark: number; markLabel: string; note: string }) {
  return (
    <section className="ex-gauge">
      <h3>{title}</h3>
      <p className="ex-val">{value}</p>
      <div className="tn-meter" aria-hidden><i style={{ width: `${fill * 100}%` }} /><b style={{ left: `${mark * 100}%` }} /></div>
      <p className="tn-meter-note">çizgi: {markLabel}</p>
      <p className="tn-say tn-dim">{note}</p>
    </section>
  )
}

const Row = ({ label, s, b }: { label: string; s: Block; b: Block }) => (
  <tr>
    <th scope="row">{label}<span className="s">{Fmt.number(s.n, 0)} sinyal</span></th>
    {HORIZONS.map((_, k) => <td key={k} className={'c ' + (s.h[k][0] >= b.h[k][0] + 0.05 ? 'pos' : s.h[k][0] <= b.h[k][0] - 0.05 ? 'neg' : '')}><b className="num">{ten(s.h[k][0])}/10</b><span className="s num">her zaman {ten(b.h[k][0])}/10</span><span className="s num">ortanca {pct(s.h[k][1], 1)}</span></td>)}
    <td className="c"><b className="num">{pct(s.adv, 1)}</b><span className="s num">her zaman {pct(b.adv, 1)}</span></td>
  </tr>
)

function Evidence({ m, rule, name, kind }: { m: MarketExtremes; rule: RuleStats; name: string; kind: 'strong' | 'near' }) {
  const post = rule.post, years = rule.years.filter((y) => y[1] >= 5), better = years.filter((y) => y[2] > y[3]).length
  return (
    <section className="an-group ex-evidence">
      <h3>{kind === 'strong' ? 'Geçmişte abartılı satıştan sonra ne oldu' : `Geçmişte ${m.label.toLocaleLowerCase('tr')} en sert düşüşlerden sonra ne oldu`}</h3>
      <p className="tn-say">
        {kind === 'strong' ? `${m.label} içinde hem hissenin hem pazarın sert düştüğü anlar.` : 'Varlığın kendi geçmişinin en sert %2’lik düşüşleri.'}{' '}
        Eşiklerin seçilmediği 2021 sonrası dönemde, sinyalden 3 ay sonra fiyat <b className="num">10 seferin {ten(post.sig.h[2][0])}</b> tanesinde yukarıdaydı; herhangi bir günde alınsaydı 10 seferin {ten(post.base.h[2][0])} tanesinde. Ortanca getiri <b className="num">{pct(post.sig.h[2][1], 1)}</b> (her zaman {pct(post.base.h[2][1], 1)}).
        {' '}Sinyalden sonra fiyat ortanca <b className="num">{pct(post.sig.adv, 1)}</b> daha düştü; kötü durumların dörtte birinde {pct(post.sig.adv25, 0)}.
      </p>
      <div className="mc-scroll">
        <table className="result-table ex-table">
          <thead><tr><th>Sinyalden sonra yukarıda</th>{HORIZON_LABEL.map((h) => <th key={h} className="c">{h} sonra</th>)}<th className="c">Arada en fazla düşüş</th></tr></thead>
          <tbody>
            <Row label="2021 sonrası (sınama)" s={rule.post.sig} b={rule.post.base} />
            <Row label="2014–2020 (eşiklerin seçildiği)" s={rule.pre.sig} b={rule.pre.base} />
          </tbody>
        </table>
      </div>
      {years.length > 0 && (
        <>
          <p className="tn-say tn-dim">Yıl yıl, 1 ay sonra yukarıda olma oranı (sinyal / her zaman): {better} / {years.length} yılda sinyal daha iyi.</p>
          <div className="ex-years">
            {years.map(([y, n, a, bb]) => (
              <div key={y} className={a > bb ? 'pos' : 'neg'} title={`${y}: ${n} sinyal; 1 ay sonra yukarıda %${Math.round(a * 100)}, her zaman %${Math.round(bb * 100)}`}>
                <span className="bar"><i className="a" style={{ height: `${a * 100}%` }} /><i className="b" style={{ bottom: `${bb * 100}%` }} /></span>
                <em>{y}</em>
              </div>
            ))}
          </div>
        </>
      )}
      {m.breadth && m.th && rule.post.sig.h[0][1] > 0.15 && <p className="tn-say tn-dim">Not: 2021 sonrasındaki sinyallerin çoğu Aralık 2021’deki kur dalgalanmasına denk gelir; TL’nin günler içinde dolara karşı sert değer kazanması, dolar bazında 1 haftalık getiriyi olağanüstü yükseltti. 2018 kur krizinde ise dolar bazında düşüş sürdü (aşağıdaki dönem listesi).</p>}
      {name && kind === 'near' && <p className="tn-say tn-dim">Makro varlıklarda fark küçüktür; bu sonucu tek başına bir dönüş işareti sayma.</p>}
    </section>
  )
}

function Episodes({ m }: { m: MarketExtremes }) {
  const up = m.episodes.filter((e) => e.h[2] > 0).length
  return (
    <section className="an-group">
      <h3>Bütün panik dönemleri: {m.episodes.length} dönemin {up} tanesinde 3 ay sonra yukarıda</h3>
      <div className="mc-scroll">
        <table className="result-table ex-table ex-ep">
          <thead><tr><th>Dönem</th><th className="r">Sinyal veren hisse</th><th className="r">1 ay sonra</th><th className="r">3 ay sonra</th><th className="r">Arada en fazla düşüş</th></tr></thead>
          <tbody>
            {m.episodes.map((e) => (
              <tr key={e.from}>
                <td>{dayDate(e.from)}{e.to - e.from > 3 ? ` – ${dayDate(e.to)}` : ''}</td>
                <td className="r num">{e.stocks}</td>
                <td className={'r num ' + (e.h[1] > 0 ? 'pos' : 'neg')}>{pct(e.h[1], 1)}</td>
                <td className={'r num ' + (e.h[2] > 0 ? 'pos' : 'neg')}><b>{pct(e.h[2], 1)}</b></td>
                <td className="r num">{pct(e.adv, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tn-say tn-dim">Her satır o dönemde sinyal veren hisselerin ortancasıdır. Getiriler sinyal günündeki kapanıştan.</p>
    </section>
  )
}

function Alone({ s, label }: { s: RuleStats; label: string }) {
  const p = s.post
  const worse = p.sig.h[2][0] < p.base.h[2][0] - 0.03
  return (
    <section className="tn-card ex-alone">
      <h3>Hisse tek başına düşüyorsa: abartı değil</h3>
      <p className="tn-say">{label} içinde pazar sakinken tek başına en sert düşüşe giren hisselerde 3 ay sonra fiyat 10 seferin {ten(p.sig.h[2][0])} tanesinde yukarıdaydı (her zaman {ten(p.base.h[2][0])}); arada ortanca {pct(p.sig.adv, 1)} daha düştü. {worse ? 'Yani düşüş çoğunlukla sürdü.' : 'Yani herhangi bir günden farkı yok.'} Genellikle hisseye özgü bir haber vardır.</p>
    </section>
  )
}

function Top({ s }: { s: RuleStats }) {
  const p = s.post
  return (
    <section className="tn-card ex-top">
      <h3>Tepe: güvenilir bir işaret yok</h3>
      <p className="tn-say">Aynı yöntem sert yükselişlerde de sınandı. Yükselişin en sert %1’lik dilimine girdikten 1 ay sonra fiyat 10 seferin {ten(p.sig.h[1][0])} tanesinde aşağıdaydı (her zaman {ten(p.base.h[1][0])}); 3 ay sonra {ten(p.sig.h[2][0])} (her zaman {ten(p.base.h[2][0])}). Sert yükselişler çoğunlukla sürüyor; “bu kadarı fazla” denilen yer tepe çıkmıyor.</p>
    </section>
  )
}

const pa = (v: number) => (Number.isFinite(v) ? pct(v, 1) : '—')
const IDX_NAME: Record<string, string> = { 'ABD hisseleri': 'S&P 500', 'BIST hisseleri (dolar bazında)': 'BIST 100 (dolar)' }

/** Kurala göre işlem yapılsaydı: birikim eğrisi, dönem özetleri, rastgele hisse kontrolü, yıl yıl */
function StrategyView({ s, m }: { s: Strategy; m: MarketExtremes }) {
  const idx = IDX_NAME[m.label] ?? 'endeks'
  const post = s.post, all = s.all
  const beats = post.mixed.cagr > post.bh.cagr + 0.005, randBetter = post.randMixed.cagr >= post.mixed.cagr - 0.002
  const verdict = !beats
    ? `Bu kural 2021 sonrasında ${idx}’u geçemedi: yıllık ${pa(post.mixed.cagr)}, ${idx} ${pa(post.bh.cagr)}.`
    : randBetter
      ? `Kural ${idx}’u geçti (2021 sonrası yıllık ${pa(post.mixed.cagr)}, ${idx} ${pa(post.bh.cagr)}). Ama aynı günlerde rastgele hisseler alınsaydı sonuç benzer ya da daha iyi olurdu (${pa(post.randMixed.cagr)}). Yani kazanç hisse seçiminden değil, panik anında hisse almaktan geliyor.`
      : `Kural ${idx}’u geçti (2021 sonrası yıllık ${pa(post.mixed.cagr)}, ${idx} ${pa(post.bh.cagr)}) ve aynı günlerde rastgele hisse almaktan da iyi (${pa(post.randMixed.cagr)}).`
  const rows: [string, (x: Strategy['all']) => Metrics, string?][] = [
    [`${idx} + kural`, (x) => x.mixed, 'main'],
    [`${idx} + aynı günlerde rastgele hisse`, (x) => x.randMixed],
    [`Yalnız ${idx}`, (x) => x.bh],
  ]
  return (
    <section className="an-group ex-strategy">
      <h3>Bu kuralla yatırım yapılsaydı</h3>
      <p className="tn-say">
        Sermaye normalde {idx}’ta durur. Abartılı satış sinyali gelen her hisseye sermayenin 1/20’si ayrılır (aynı anda 20’den fazla sinyal varsa eşit bölünür); sinyal ertesi gün açılışta alınır, {s.hold} işlem günü (yaklaşık 3 ay) sonra satılır. Her alış ve satışta %{Fmt.number(s.cost * 100, 1)} maliyet düşülür.
      </p>
      <p className={'an-answer ex-verdict ' + (beats && !randBetter ? 'up' : beats ? '' : 'down')}>{verdict}</p>
      <Curve s={s} idx={idx} />
      <div className="mc-scroll">
        <table className="result-table ex-table ex-strat">
          <thead><tr><th>Portföy</th><th className="r">Yıllık getiri<span className="s">bütün dönem</span></th><th className="r">En kötü düşüş<span className="s">bütün dönem</span></th><th className="r">Yıllık getiri<span className="s">2021 sonrası</span></th><th className="r">En kötü düşüş<span className="s">2021 sonrası</span></th></tr></thead>
          <tbody>
            {rows.map(([label, f, cls]) => (
              <tr key={label} className={cls}>
                <th scope="row">{label}</th>
                <td className="r num">{pa(f(all).cagr)}</td><td className="r num">{pa(f(all).mdd)}</td>
                <td className="r num">{pa(f(post).cagr)}</td><td className="r num">{pa(f(post).mdd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tn-say tn-dim">
        İşlemler: {Fmt.number(s.trades.n, 0)} alım; {ten(s.trades.win)}/10 tanesi kârla kapandı, ortanca {pa(s.trades.med)}; en kötü yirmide biri {pa(s.trades.worst)} ya da daha kötü.
        {' '}2021 sonrası: {Fmt.number(s.tradesPost.n, 0)} alım, {ten(s.tradesPost.win)}/10 kârlı, ortanca {pa(s.tradesPost.med)}.
        {' '}Tutma süresine göre yıllık getiri (bütün dönem): {s.variants.map((v) => `${v.hold === 21 ? '1 ay' : v.hold === 63 ? '3 ay' : '6 ay'} ${pa(v.all.cagr)}`).join(', ')}; {idx} {pa(all.bh.cagr)}.
      </p>
      <details className="an-how st-frame">
        <summary>Yıl yıl getiri</summary>
        <div className="mc-scroll">
          <table className="result-table ex-table">
            <thead><tr><th>Yıl</th><th className="r">{idx} + kural</th><th className="r">Yalnız {idx}</th><th className="r">Fark</th></tr></thead>
            <tbody>{s.years.map(([y, a, b]) => <tr key={y}><td>{y}</td><td className="r num">{pa(a)}</td><td className="r num">{pa(b)}</td><td className={'r num ' + (a - b > 0.002 ? 'pos' : a - b < -0.002 ? 'neg' : '')}>{Math.abs(a - b) < 0.002 ? 'sinyal yok' : pa(a - b)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </section>
  )
}

function Curve({ s, idx }: { s: Strategy; idx: string }) {
  const pts = s.curve
  if (pts.length < 10) return null
  const W = 720, H = 220, P = { l: 8, r: 64, t: 10, b: 22 }
  const vals = pts.flatMap((p) => [p[1], p[2]]), lo = Math.log(Math.min(...vals)), hi = Math.log(Math.max(...vals))
  const x = (k: number) => P.l + (k / (pts.length - 1)) * (W - P.l - P.r)
  const y = (v: number) => P.t + (1 - (Math.log(v) - lo) / (hi - lo || 1)) * (H - P.t - P.b)
  const line = (k: 1 | 2) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join('')
  const split = pts.findIndex((p) => p[0] * 86400 >= Date.UTC(2021, 0, 1) / 1000)
  const years = pts.map((p, i) => [new Date(p[0] * 864e5).getUTCFullYear(), i] as const).filter((v, i, a) => i === 0 || v[0] !== a[i - 1][0]).filter((v) => v[0] % 2 === 0)
  const last = pts[pts.length - 1]
  return (
    <figure className="sc ex-curve">
      <figcaption>100 birimle başlansaydı<span>Logaritmik ölçek. Kesikli çizgi: eşiklerin seçilmediği dönemin başı (2021).</span></figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${idx} + kural ${Fmt.number(last[1] * 100, 0)}, yalnız ${idx} ${Fmt.number(last[2] * 100, 0)}`}>
        {years.map(([yr, i]) => <g key={yr}><line className="sc-grid" x1={x(i)} x2={x(i)} y1={P.t} y2={H - P.b} /><text className="sc-tick" x={x(i)} y={H - 6} textAnchor="middle">{yr}</text></g>)}
        {split > 0 && <line className="sc-level" x1={x(split)} x2={x(split)} y1={P.t} y2={H - P.b} />}
        <path d={line(2)} className="ex-line idx" />
        <path d={line(1)} className="ex-line strat" />
        <text className="sc-tick ex-end strat" x={W - P.r + 6} y={y(last[1]) + 4}>{Fmt.number(last[1] * 100, 0)}</text>
        <text className="sc-tick ex-end" x={W - P.r + 6} y={y(last[2]) + 4}>{Fmt.number(last[2] * 100, 0)}</text>
      </svg>
      <p className="sc-legend"><span><i className="k ex-k strat" />{idx} + kural</span><span><i className="k ex-k idx" />yalnız {idx}</span></p>
    </figure>
  )
}
