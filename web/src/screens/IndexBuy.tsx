/**
 * Analiz › Endeks (açılış sayfası): S&P 500 ya da Nasdaq 100 ne zaman, hangi düzeyden alınır?
 *   #/analiz?e=SPX   #/analiz?e=NDX
 * Bütün tarihsel düşüşler, düşüşlerden sonra ne olduğu, düşüşü beklemenin düzenli alıma göre sonucu ve bugünkü durum.
 * Hesap research/index-dips.research.ts ile yapılır (data/index-dips.json); grafik endeksin aylık mumları.
 */
import { useEffect, useMemo, useState } from 'react'
import * as Fmt from '../core/format'
import { episodes, type IndexDips, type IndexDipsFile, type RuleResult, type Windows } from '../core/indexDips'
import { loadSubject, type Subject } from '../data/subjects'
import { CandleChart, type Mark } from '../ui/CandleChart'
import { href, setQuery, useRoute } from '../ui/router'

let file: Promise<IndexDipsFile | undefined> | undefined
const load = () => (file ??= fetch('data/index-dips.json', { cache: 'no-cache' }).then((r) => (r.ok ? (r.json() as Promise<IndexDipsFile>) : undefined)).catch(() => undefined).then((f) => { if (!f) file = undefined; return f }))
const KEY = 'piyasa.endeks'
const pct = (v: number | undefined, d = 0) => (v == null || !Number.isFinite(v) ? '—' : (v > 0.00005 ? '+' : v < -0.00005 ? '−' : '') + '%' + Fmt.number(Math.abs(v * 100), d))
const p0 = (v: number) => '%' + Fmt.number(v * 100, 0)
const ten = (v: number) => Fmt.number(Math.round(v * 10), 0)
const price = (v: number) => Fmt.number(v, 0)
const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
const ym = (s?: string) => (s ? `${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}` : 'sürüyor')
/** Türkçe ekler: "9’unda", "24’ünde", "1966’dan", "1985’ten" */
const LOC1 = ['', 'inde', 'sinde', 'ünde', 'ünde', 'inde', 'sında', 'sinde', 'inde', 'unda'], LOC10 = ['', 'unda', 'sinde', 'unda', 'ında', 'sinde', 'ında', 'inde', 'inde', 'ında']
const loc = (n: number) => `${n}’${n % 10 ? LOC1[n % 10] : n % 100 ? LOC10[(n % 100) / 10] : 'ünde'}`
const ABL1 = ['', 'den', 'den', 'ten', 'ten', 'ten', 'dan', 'den', 'den', 'dan'], ABL10 = ['', 'dan', 'den', 'dan', 'tan', 'den', 'tan', 'den', 'den', 'dan']
const abl = (n: number) => `${n}’${n % 10 ? ABL1[n % 10] : n % 100 ? ABL10[(n % 100) / 10] : 'den'}`
const ago = (m?: number) => (m == null ? '—' : m >= 24 ? `${Fmt.number(m / 12, 1)} yıl` : `${m} ay`)

export function IndexBuy() {
  const { query } = useRoute()
  const id = (() => { const v = (query.get('e') ?? (() => { try { return localStorage.getItem(KEY) } catch { return null } })() ?? 'SPX').toUpperCase(); return v === 'NDX' ? 'NDX' : 'SPX' })()
  const [f, setF] = useState<IndexDipsFile | null | undefined>()
  const [sub, setSub] = useState<Subject | undefined>()
  useEffect(() => { void load().then((x) => setF(x ?? null)) }, [])
  useEffect(() => { let alive = true; setSub(undefined); void loadSubject(id).then((s) => { if (alive) setSub(s) }); return () => { alive = false } }, [id])
  const pick = (v: string) => { try { localStorage.setItem(KEY, v) } catch { /* depolama kapalı */ } setQuery('e', v, true) }
  const d = f?.indices[id]
  return (
    <>
      <header className="an-head wb-head">
        <h2>S&P 500 ve Nasdaq 100: ne zaman, hangi düzeyden alınır?</h2>
        <div className="segmented" role="group" aria-label="Endeks">
          {(['SPX', 'NDX'] as const).map((k) => <button key={k} type="button" aria-pressed={k === id} onClick={() => pick(k)}>{k === 'SPX' ? 'S&P 500' : 'Nasdaq 100 (QQQ)'}</button>)}
        </div>
      </header>
      {f === undefined ? <p className="an-answer" aria-live="polite">Geçmiş yükleniyor…</p>
        : !d ? <p className="an-answer">Endeks verisi alınamadı.</p>
          : <Body d={d} sub={sub} generated={f!.generated} />}
    </>
  )
}

function Body({ d, sub, generated }: { d: IndexDips; sub?: Subject; generated: number }) {
  const strat = d.strategies, ws = strat.map((s) => s.w20 ?? s.w10)
  const span = d.strategies.some((s) => s.w20) ? '20' : '10'
  const lo = Math.min(...ws.map((w) => w.beat)), hi = Math.max(...ws.map((w) => w.beat))
  const dcaWins = hi < 0.5
  const n = d.now, rule = (id: string) => d.rules.find((r) => r.id === id)!
  const all = rule('all'), noUr = rule('dd20noUr'), ur = rule('dd20ur')
  const lumpNow = d.lump.every((l) => l.beat < 0.5)
  const marks = useMemo((): Mark[] => {
    const M = sub?.frames.M
    if (!M) return []
    return episodes(M.c, 0.1).map((e) => ({ index: e.trough, outcome: e.recover != null ? 'up' : 'open' }))
  }, [sub])
  return (
    <>
      <p className="an-answer tn-answer" aria-live="polite">
        {dcaWins ? `Her ay düzenli al. ${abl(Number(d.from.slice(0, 4)))} bu yana bütün ${span} yıllık dönemlerde, düşüşü bekleyen kurallar düzenli alımı ancak dönemlerin %${Math.round(lo * 100)}–${loc(Math.round(hi * 100))} geçti.` : `Düşüşü beklemek bazı dönemlerde düzenli alımı geçti; aşağıdaki tabloya bak.`}
      </p>
      <p className="tn-say">
        {rule('dd20').h[1][0] >= all.h[1][0] + 0.05
          ? <>Düşüşten sonra getiri gerçekten daha yüksek: {d.name} zirveden en az %20 aşağıdayken 12 ay sonra 10 seferin {loc(Math.round(rule('dd20').h[1][0] * 10))} yukarıdaydı (herhangi bir ayda {ten(all.h[1][0])}). Ama bu düşüşler seyrek gelir; beklerken kaçan yükseliş, düşüşte kazanılandan daha pahalıya gelir.</>
          : <>{d.name} zirveden en az %20 aşağıdayken bile 12 ay sonraki sonuç herhangi bir aydan iyi değildi (10 seferin {ten(rule('dd20').h[1][0])}’e karşı {ten(all.h[1][0])}): büyük düşüşler (2000–2002 gibi) yıllarca sürebildi. Beklerken kaçan yükseliş ise kesin bir kayıp.</>}
      </p>

      <section className="an-group ix-now">
        <h3>Bugün ({n.date.split('-').reverse().join('.')})</h3>
        <div className="ex-gauges">
          <section className="ex-gauge">
            <h3>{d.name}</h3>
            <p className="ex-val num">{price(n.close)}</p>
            <p className="tn-say">Zirve {price(n.peak)}; zirveden <b className="num">{pct(n.dd, 1)}</b>.{n.vix != null ? ` VIX ${Fmt.number(n.vix, 0)}.` : ''}</p>
            <table className="result-table ix-levels">
              <thead><tr><th>Zirveden</th><th className="r">Düzey</th><th className="r">Bugünden</th></tr></thead>
              <tbody>{n.levels.map((l) => <tr key={l.dd} className={n.close <= l.price ? 'hit' : ''}><td>{pct(l.dd)}</td><td className="r num">{price(l.price)}</td><td className="r num">{n.close <= l.price ? 'geçildi' : pct(l.price / n.close - 1, 1)}</td></tr>)}</tbody>
            </table>
          </section>
          <section className="ex-gauge">
            <h3>Geçmişte bu durumdan sonra</h3>
            <p className="tn-say">Endeks {n.bucket.label} iken ({Fmt.number(n.bucket.n, 0)} ay): 12 ay sonra <b className="num">10 seferin {ten(n.bucket.up)}</b> tanesinde yukarıdaydı, ortanca <b className="num">{pct(n.bucket.med, 1)}</b>.</p>
            <p className="tn-say">Bu düzeyden sonra en az %10 daha düşüş görülme oranı: 12 ayda {p0(n.further.p10_12)}, 24 ayda {p0(n.further.p10_24)}; en az %20: 24 ayda {p0(n.further.p20_24)}.</p>
            <p className="tn-say tn-dim">{n.active.filter((a) => a !== 'near').length ? `Şu an geçerli: ${n.active.filter((a) => a !== 'near').map((a) => rule(a).label.toLocaleLowerCase('tr')).join('; ')}.` : 'Şu an hiçbir düşüş sinyali geçerli değil.'}</p>
          </section>
        </div>
      </section>

      <section className="an-group">
        <h3>Birikmiş param var: hepsini şimdi mi yatırayım?</h3>
        <p className="tn-say">{lumpNow ? 'Geçmişte çoğunlukla hepsini hemen yatırmak daha iyi sonuç verdi.' : 'Geçmişte sonuç karışık.'} Her başlangıç ayı için 5 yıl sonraki değer karşılaştırıldı ({Fmt.number(d.lump[0].n, 0)} dönem).</p>
        <table className="result-table ex-table">
          <thead><tr><th>Hepsini hemen yatırmak yerine</th><th className="r">Daha iyi olduğu dönem</th><th className="r">Ortanca fark</th><th className="r">En kötü fark</th></tr></thead>
          <tbody>{d.lump.map((l) => <tr key={l.id}><th scope="row">{l.label}</th><td className={'r num ' + (l.beat < 0.5 ? 'neg' : 'pos')}>{p0(l.beat)}</td><td className="r num">{pct(l.med, 1)}</td><td className="r num">{pct(l.worst, 1)}</td></tr>)}</tbody>
        </table>
      </section>

      <section className="an-group">
        <h3>Düşüşü beklemek işe yarar mı? Her ay düzenli alımla karşılaştırma</h3>
        <p className="tn-say">Her ay aynı tutar biriktiriliyor. Düzenli alımda hemen endeks alınır; diğerlerinde para (ya da bir kısmı) nakitte bekler, hazine faizi kazanır ve kural gerçekleşince endekse geçer. Her başlangıç ayı ayrı sınandı; tabloda dönem sonundaki birikimin düzenli alıma göre farkı var.</p>
        <div className="mc-scroll">
          <table className="result-table ex-table ix-strat">
            <thead><tr><th>Kural</th><th className="r">10 yılda düzenli alımı geçtiği dönem</th><th className="r">Ortanca fark</th><th className="r">En kötü</th>{d.strategies.some((s) => s.w20) && <><th className="r">20 yılda geçtiği dönem</th><th className="r">Ortanca fark</th></>}</tr></thead>
            <tbody>{d.strategies.map((s) => (
              <tr key={s.id}><th scope="row">{s.label}</th><W w={s.w10} />{d.strategies.some((x) => x.w20) && (s.w20 ? <><td className={'r num ' + (s.w20.beat < 0.5 ? 'neg' : 'pos')}>{p0(s.w20.beat)}</td><td className="r num">{pct(s.w20.med, 1)}</td></> : <><td /><td /></>)}</tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="an-group">
        <h3>Düşüşten sonra ne oldu</h3>
        <p className="tn-say">
          Makroda belirgin bir örüntü var: zirveden %20 düşüşte işsizlik artmıyorsa 12 ay sonra 10 seferin {loc(Math.round(noUr.h[1][0] * 10))} yukarıdaydı ve arada ortanca {pct(noUr.adv, 1)} daha düştü. İşsizlik artıyorsa (resesyon) 10 seferin {loc(Math.round(ur.h[1][0] * 10))}; arada kötü çeyrekte {pct(ur.adv25, 0)} daha düştü.
        </p>
        <div className="mc-scroll">
          <table className="result-table ex-table">
            <thead><tr><th>Durum</th><th className="r">Ay</th><th className="c">6 ay sonra</th><th className="c">12 ay sonra</th><th className="c">24 ay sonra</th><th className="r">Sonraki 12 ayda ek düşüş</th></tr></thead>
            <tbody>{d.rules.map((r) => <RuleRow key={r.id} r={r} all={all} />)}</tbody>
          </table>
        </div>
      </section>

      {sub?.frames.M && <CandleChart bars={sub.frames.M} tf="M" title={d.name} marks={marks} defaultRange="all" legend={<><span><b className="cc-arrow up">▲</b>%10’dan derin düşüşlerin dibi</span><span><b className="cc-arrow">▲</b>henüz zirveye dönülmedi</span></>} />}

      <section className="an-group">
        <h3>Bütün düşüşler ({d.episodes.length}; zirveden en az %10)</h3>
        <div className="mc-scroll">
          <table className="result-table ex-table ix-eps">
            <thead><tr><th>Zirve</th><th>Dip</th><th className="r">Derinlik</th><th className="r">Zirveden dibe</th><th className="r">Dipten zirveye</th><th className="r">Dipte VIX</th><th className="r">İşsizlik (12 ay)</th></tr></thead>
            <tbody>{d.episodes.map((e) => (
              <tr key={e.peak}><td>{ym(e.peak)}</td><td>{ym(e.trough)}</td><td className="r num"><b>{pct(e.depth)}</b></td><td className="r num">{ago(e.down)}</td><td className="r num">{e.recover ? ago(e.up) : 'sürüyor'}</td><td className="r num">{e.vix != null ? Fmt.number(e.vix, 0) : '—'}</td><td className={'r num ' + (e.ur12 != null && e.ur12 >= 0.5 ? 'neg' : '')}>{e.ur12 != null ? (e.ur12 > 0 ? '+' : '') + Fmt.number(e.ur12, 1) : '—'}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <p className="tn-say tn-dim">Diplerde (%15’ten derin düşüşler) ortanca değerler, her zamankiyle: {d.pattern.map((p) => `${p.label} ${Fmt.number(p.trough, 1)} (her zaman ${Fmt.number(p.all, 1)})`).join('; ')}. Bu değerler dipte belirgin biçimde farklı, ama dibe gelinmeden önce de uzun süre aynı düzeyde kalabiliyor; bu yüzden tek başına “dip burası” demiyor.</p>
      </section>

      <details className="an-how">
        <summary>Nasıl hesaplanıyor, nelere dikkat etmeli</summary>
        <ul>
          <li><b>Veri</b>: {d.name} aylık kapanışları ({ym(d.from)} – {ym(d.to)}, {d.months} ay). Bugünkü durum günlük kapanıştan. {d.etf} gibi fonlar bu endeksi izler.</li>
          <li><b>Temettü ve faiz</b>: endeks fiyatına yaklaşık temettü eklenir (S&P %2, Nasdaq %0,8 yıllık). Nakitte bekleyen para 3 aylık ABD hazine faizi kazanır. İkisi de bekleme kurallarının lehine değil aleyhine bir varsayım değildir; faiz bekleyen tarafa yazılır.</li>
          <li><b>Kurallar</b> önceden tanımlıdır ve veriye göre ayarlanmadı. Her başlangıç ayı ayrı bir yatırımcı gibi sınanır; bu yüzden sonuç tek bir başlangıç tarihine bağlı değildir.</li>
          <li><b>Sınırı</b>: sonuçlar ABD’nin olağanüstü güçlü 60 yılına dayanır; başka bir ülkede ya da uzun bir durgunlukta (Japonya 1990 sonrası gibi) düşüşte almak daha değerli olabilir. Vergi, döviz ve fon giderleri hesaba katılmadı.</li>
          <li>Bu bir yatırım tavsiyesi değildir.{` Veri ${Fmt.dateTime(generated)} itibarıyla.`}</li>
        </ul>
        <p><a href={href('analiz/hisse-dip')}>Hisse dipleri</a>: tek tek hisselerde abartılı satış.</p>
      </details>
    </>
  )
}

const W = ({ w }: { w: Windows }) => <><td className={'r num ' + (w.beat < 0.5 ? 'neg' : 'pos')}>{p0(w.beat)}</td><td className="r num">{pct(w.med, 1)}</td><td className="r num">{pct(w.worst, 1)}</td></>

function RuleRow({ r, all }: { r: RuleResult; all: RuleResult }) {
  return (
    <tr>
      <th scope="row">{r.label}</th>
      <td className="r num">{r.n}</td>
      {r.h.map(([u, m], k) => <td key={k} className={'c ' + (r.id === 'all' ? '' : u >= all.h[k][0] + 0.05 ? 'pos' : u <= all.h[k][0] - 0.05 ? 'neg' : '')}><b className="num">{ten(u)}/10</b><span className="s num">ortanca {pct(m, 1)}</span></td>)}
      <td className="r num">{pct(r.adv, 1)}<span className="s">kötü çeyrek {pct(r.adv25, 0)}</span></td>
    </tr>
  )
}
