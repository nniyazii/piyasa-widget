/**
 * Analiz › Hisse: seçilen hissede RSI'a dayalı dip ve tepe sinyallerinin tarihsel teyidi.
 *   #/analiz/hisse/NASDAQ:SNDK
 * Önce cevap (şu an sinyale ne kadar uzak), sonra dip ve tepe sinyali, en altta tüm eşiklerin dökümü.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import * as Fmt from '../core/format'
import {
  analyze, bestOf, durationLabel, FILTER_LABEL, INDICATOR_LABEL, RULES_PER_FRAME, TIMEFRAMES, triggerLabel, VERDICT_LABEL,
  type Analysis, type Indicator, type Side, type SignalStat, type Timeframe, type TimeframeAnalysis,
} from '../core/signals'
import { chartUrl } from '../core/tradingview'
import { loadBars, withLive, type DeepBars } from '../data/bars'
import { useApp } from '../data/store'
import type { SearchHit } from '../core/catalog'
import { scan, search } from '../data/tv'
import { href, navigate } from '../ui/router'

const LAST_KEY = 'piyasa.hisse'
const EXAMPLES = ['NASDAQ:SNDK', 'BIST:THYAO', 'NASDAQ:NVDA', 'BIST:ASELS']
const pct = (v?: number, d = 1) => (v == null ? '—' : (v > 0.00005 ? '+' : v < -0.00005 ? '−' : '') + '%' + Fmt.number(Math.abs(v * 100), d))
const price = (v?: number) => (v == null ? '—' : Fmt.number(v, v >= 1000 ? 0 : v >= 10 ? 2 : 4))
const rsiFmt = (v: number) => Fmt.number(v, 1)
/** Gösterge değeri: RSI 36,5; Bollinger −1,3σ; 200 ortalamaya uzaklık −%12; MACD işareti */
const val = (ind: Indicator, v: number) => (Number.isNaN(v) ? '—'
  : ind === 'rsi' ? rsiFmt(v)
    : ind === 'bb' ? (v < 0 ? '−' : '+') + Fmt.number(Math.abs(v), 1) + 'σ'
      : ind === 'd200' ? pct(v, 0)
        : v >= 0 ? 'sinyal çizgisinin üstünde' : 'sinyal çizgisinin altında')
/** Kuralın tam adı: "RSI ≤ 30, fiyat 200 ortalamanın üstündeyken" */
const rule = (s: SignalStat) => triggerLabel(s.trigger) + (s.filter === 'any' ? '' : ', ' + FILTER_LABEL[s.filter])
/** Türkçe ek: sayının okunuşuna göre ("30’un", "18’inde") */
const LAST = ['', 'in', 'nin', 'ün', 'ün', 'in', 'nın', 'nin', 'in', 'un']
const TENS = ['', 'un', 'nin', 'un', 'ın', 'nin', 'ın', 'in', 'in', 'ın']
const gen = (n: number) => (n % 10 ? LAST[n % 10] : n % 100 ? TENS[(n % 100) / 10] : 'ün')
/** "18’inde", "6’sında" */
const inOf = (n: number) => { const g = gen(n); const v = /[ıu]/.test(g) ? 'a' : 'e'; return `${n}’${g.startsWith('n') ? 's' + g.slice(1) : g}d${v}` }
const tfOf = (tf: Timeframe) => TIMEFRAMES.find((t) => t.id === tf)!
const dayFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
const hourFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
const monthFmt = new Intl.DateTimeFormat('tr-TR', { month: 'short', year: 'numeric' })
const when = (t: number, tf: Timeframe) => (tf === 'W' || tf === 'D' ? dayFmt : hourFmt).format(t * 1000)

interface Loaded { symbol: string; data?: DeepBars; live?: number; error?: string }

export function StockAnalysis({ symbol }: { symbol?: string }) {
  const sym = symbol?.toUpperCase()
  const [state, setState] = useState<Loaded | undefined>()
  useEffect(() => {
    if (!sym) {
      let last: string | null = null
      try { last = localStorage.getItem(LAST_KEY) } catch { /* depolama kapalı */ }
      if (last) navigate('analiz/hisse/' + last, undefined, true)
      return
    }
    let alive = true
    setState(undefined)
    void Promise.all([
      loadBars(sym),
      scan('global', { symbols: { tickers: [sym] }, columns: ['close'] }).then((r) => (typeof r[0]?.d[0] === 'number' ? (r[0].d[0] as number) : undefined)).catch(() => undefined),
    ]).then(([data, live]) => {
      if (!alive) return
      setState({ symbol: sym, data, live })
      if (data) try { localStorage.setItem(LAST_KEY, sym) } catch { /* depolama kapalı */ }
    })
    return () => { alive = false }
  }, [sym])

  const result = useMemo(() => {
    if (!state?.data) return undefined
    // Sunucudan gelen veri zaten taze; kopya saatler önce alınmış olabilir, son çubuk canlı fiyatla güncellenir
    const frames = state.data.source === 'snapshot' ? withLive(state.data.frames, state.live) : state.data.frames
    return analyze(frames)
  }, [state])

  return (
    <>
      <Picker current={sym} />
      {!sym ? <Empty />
        : !state || state.symbol !== sym ? <p className="an-answer" aria-live="polite">Geçmiş veriler alınıyor…</p>
          : !result || !result.frames.length ? <Missing symbol={sym} />
            : <Result symbol={sym} a={result} data={state.data!} live={state.data!.source === 'snapshot' && state.live != null} />}
    </>
  )
}

// ------------------------------------------------------------------ hisse seçimi

function Picker({ current }: { current?: string }) {
  const app = useApp()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[] | undefined>()
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (q.trim().length < 2) { setHits(undefined); return }
    const ac = new AbortController()
    const id = setTimeout(() => { search(q, ac.signal).then((h) => setHits(h.filter((x) => x.type !== 'economic'))).catch(() => { /* iptal */ }) }, 250)
    return () => { clearTimeout(id); ac.abort() }
  }, [q])
  const go = (s: string) => { setQ(''); setHits(undefined); navigate('analiz/hisse/' + s) }
  const own = app.instruments.filter((i) => (i.category === 'TR' || i.category === 'US') && !/XU\d|ALTIN|GLDTR|GMSTR/.test(i.symbol) && i.symbol !== current).slice(0, 6)
  const quick = own.length ? own.map((i) => ({ s: i.symbol, n: Fmt.ticker(i.symbol) })) : EXAMPLES.filter((s) => s !== current).map((s) => ({ s, n: Fmt.ticker(s) }))
  return (
    <div className="st-pick" ref={box}>
      <label className="st-search">
        <span className="sr-only">Hisse ara</span>
        <input className="input" type="search" value={q} placeholder={current ? `${Fmt.ticker(current)} yerine başka hisse ara` : 'Hisse ara: SNDK, THYAO, Apple…'}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && hits?.[0]) go(hits[0].symbol); if (e.key === 'Escape') setQ('') }} autoComplete="off" spellCheck={false} />
      </label>
      {hits && (
        <ul className="st-hits" role="listbox" aria-label="Arama sonuçları">
          {hits.length === 0 && <li className="none">Sonuç yok</li>}
          {hits.slice(0, 8).map((h) => (
            <li key={h.symbol}><button type="button" onClick={() => go(h.symbol)}><b>{h.ticker}</b><span>{h.name}</span><em>{h.exchange}</em></button></li>
          ))}
        </ul>
      )}
      {!hits && <p className="st-quick">{quick.map((x) => <a key={x.s} href={href('analiz/hisse/' + x.s)}>{x.n}</a>)}</p>}
    </div>
  )
}

function Empty() {
  return (
    <>
      <header className="an-head">
        <h2>Bu hissede geçmişte tutmuş bir dip ya da tepe sinyali var mı?</h2>
        <p className="an-answer">Bir hisse seç; geçmişi taransın.</p>
      </header>
      <p className="an-sub">
        Haftalık, günlük, 4 saatlik ve saatlik veride RSI, Bollinger bantları, 200 ortalamaya uzaklık ve MACD sinyalleri tek tek ve trend koşuluyla birlikte sınanır: geçmişteki tüm sinyaller bulunur, sonrasında ne olduğu ölçülür.
        Yalnızca hissenin olağan seyrinden belirgin biçimde iyi sonuç vermiş sinyaller “teyitli” sayılır; ardından bugünkü fiyatın o sinyale uzaklığı gösterilir.
      </p>
    </>
  )
}

function Missing({ symbol }: { symbol: string }) {
  return (
    <>
      <header className="an-head">
        <h2>{Fmt.ticker(symbol)}</h2>
        <p className="an-answer">Bu sembolün geçmiş verisi kopyada yok.</p>
      </header>
      <p className="an-sub">Analiz için BIST hisseleri, piyasa değeri 10 milyar doların üstündeki ABD hisseleri ve başlıca endeks, kur ve madenler hazır tutuluyor. Kopya her iş günü yenilenir; yeni halka açılan hisseler birkaç hafta içinde eklenir.</p>
    </>
  )
}

// ------------------------------------------------------------------ sonuç

interface Now { stat: SignalStat; frame: TimeframeAnalysis; trigger?: number; distance?: number }

function nowOf(a: Analysis, stat?: SignalStat): Now | undefined {
  if (!stat) return undefined
  const frame = a.frames.find((f) => f.tf === stat.tf)!
  const trigger = stat.active ? undefined : frame.triggers[stat.trigger.id]
  return { stat, frame, trigger, distance: trigger != null && trigger > 0 ? trigger / frame.close - 1 : undefined }
}

const sideName = (side: Side) => (side === 'dip' ? 'Dip' : 'Tepe')
const expected = (side: Side) => (side === 'dip' ? 'yukarıdaydı' : 'aşağıdaydı')

function Result({ symbol, a, data, live }: { symbol: string; a: Analysis; data: DeepBars; live: boolean }) {
  const code = Fmt.ticker(symbol)
  const dip = nowOf(a, a.bestDip), top = nowOf(a, a.bestTop)
  // Başlıkta teyitli sinyal önce gelir; ikisi de aynı düzeydeyse şu an açık olan ya da fiyata yakın olan
  const lead = [dip, top].filter((x): x is Now => !!x).sort((x, y) =>
    Number(y.stat.verdict === 'confirmed') - Number(x.stat.verdict === 'confirmed') || Number(y.stat.filterNow) - Number(x.stat.filterNow) || Number(y.stat.active) - Number(x.stat.active) || Math.abs(x.distance ?? 9) - Math.abs(y.distance ?? 9))[0]
  const longest = a.frames[0]
  return (
    <>
      <header className="an-head">
        <h2>{code}: geçmişte tutmuş bir dip ya da tepe sinyali var mı, şu an neresinde?</h2>
        <p className="an-answer" aria-live="polite">{lead ? <Headline now={lead} /> : 'Geçmişte tutmuş bir sinyal yok.'}</p>
      </header>
      <p className="an-sub">
        {lead
          ? <>{tfOf(lead.stat.tf).label} veride “{rule(lead.stat)}” kuralı <b>{lead.stat.main.n} kez</b> sinyal verdi; {durationLabel(lead.stat.main.bars, lead.frame.spacing)} sonra <b>{inOf(Math.round((lead.stat.main.hit ?? 0) * lead.stat.main.n))}</b> fiyat {expected(lead.stat.side)}. {lead.stat.verdict === 'confirmed' ? 'Sinyal teyitli.' : 'Sinyal umut verici ama teyitli değil; tek başına güvenme.'}</>
          : <>{a.frames.length} zaman diliminde {a.frames.length * RULES_PER_FRAME} kural sınandı; hiçbiri {code} hissesinin olağan seyrinden belirgin biçimde iyi sonuç vermedi. {longest.bars < 150 ? `Geçmiş kısa: ${tfOf(longest.tf).adj} veride yalnızca ${longest.bars} çubuk var.` : 'Bu hissede bu göstergeler güvenilir bir dip ya da tepe işareti vermemiş.'}</>}
      </p>

      <div className="vd-list">
        <SignalBlock side="dip" now={dip} a={a} />
        <SignalBlock side="top" now={top} a={a} />
      </div>

      <section className="an-group">
        <h3>Zaman dilimlerine göre şu an</h3>
        <table className="result-table st-table">
          <thead><tr><th>Zaman dilimi</th><th className="r">RSI</th><th className="r hide-s">200 ortalamaya göre</th><th className="r">En iyi dip</th><th className="r">En iyi tepe</th></tr></thead>
          <tbody>
            {a.frames.map((f) => (
              <tr key={f.tf}>
                <td><span className="n">{tfOf(f.tf).label}</span><span className="s">{durationLabel(f.bars, f.spacing)} veri, {monthFmt.format(f.from * 1000)}’den beri</span></td>
                <td className="r num" style={{ fontWeight: 600 }}>{rsiFmt(f.rsi)}</td>
                <td className="r num hide-s">{val('d200', f.values.d200.now)}</td>
                <td className="r"><Best s={bestOf(f.dips)} /></td>
                <td className="r"><Best s={bestOf(f.tops)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {a.frames.map((f) => <FrameDetail key={f.tf} f={f} />)}

      <details className="an-how">
        <summary>Nasıl hesaplanıyor, nelere dikkat etmeli</summary>
        <ul>
          <li><b>Göstergeler</b> (hepsi kapanıştan): RSI (14), Bollinger bantları (20 çubuk, 2 ve 2,5 standart sapma), fiyatın 200 çubukluk ortalamaya uzaklığı, MACD (12, 26, 9) kesişimi.</li>
          <li><b>Bağlam</b>: her kural tek başına ve dört koşulla birlikte sınanır: fiyat 200 ortalamanın üstünde ya da altında, 50 ortalama 200’ün üstünde ya da altında. “RSI 30’un altında, fiyat 200 ortalamanın üstündeyken” gibi.</li>
          <li><b>Sinyal</b>: gösterge eşiği geçtiği ilk çubuk. Aynı harekette tekrar saymamak için gösterge eşikten uzaklaşmadan (RSI’da 10 puan) yeni sinyal sayılmaz.</li>
          <li><b>Tuttu</b>: sinyalden belirli bir süre sonra fiyat beklenen yöndeyse (dipte yukarıda, tepede aşağıda). Süre zaman dilimine göre: haftalıkta 13 hafta, günlükte 21 gün, 4 saatlikte 20 çubuk, saatlikte 35 çubuk.</li>
          <li><b>Olağan</b>: hissenin herhangi bir andan aynı süre sonraki sonucu. Sürekli yükselen bir hissede her alım “tutar”; bu yüzden sinyal kendi başarısıyla değil, olağanla farkıyla değerlendirilir. Bağlamlı kurallarda olağan sonuç da aynı bağlamdaki çubuklardan hesaplanır.</li>
          <li><b>Teyitli</b> sayılması için hepsi gerekir: en az 8 sonuçlanmış sinyal, en az %65 isabet, isabetin güven alt sınırı (%95) olağanın üstünde, ortanca getiri olağandan iyi ve sinyaller tarih sırasıyla ikiye bölündüğünde iki yarıda da olağandan iyi. Bağlamlı kurallarda şart daha sıkı: en az 10 sinyal ve %97,5 güven.</li>
          <li><b>Umut verici</b>: en az 4 sinyal ve %60 isabetle olağandan iyi, ama teyit koşullarını sağlamıyor. <b>Yetersiz örnek</b>: 4’ten az sinyal.</li>
          <li><b>Tetik fiyatı</b>: bir sonraki çubuk bu fiyattan kapanırsa gösterge eşiğe gelir. Her yeni çubukla değişir. MACD kesişiminde tek çubukta ulaşılabiliyorsa gösterilir.</li>
          <li>Her hissede yaklaşık {4 * RULES_PER_FRAME} kural birden sınanır; bu kadar denemede birkaçı şans eseri iyi görünebilir. Aynı bulgu birkaç kuralda birden çıkıyorsa (örneğin RSI ve Bollinger aynı yeri gösteriyorsa) daha güvenilirdir. Teyit koşulları bunu azaltır, yok etmez. Geçmişte tutmuş olması gelecekte tutacağını garanti etmez.</li>
          <li>Veri TradingView’den: haftalık en çok 1000, günlük 3000, 4 saatlik 1500, saatlik 2000 çubuk. Fiyatlar bölünme ve temettüye göre düzeltilmiştir. {live ? `Geçmiş ${Fmt.dateTime(data.generated)} kopyasından; son çubuk canlı fiyatla (BIST’te 15 dakika gecikmeli) güncellendi.` : `Veri ${Fmt.dateTime(data.generated)} itibarıyla.`}</li>
        </ul>
        <p><a href={href('sozluk/rsi-sinyali')}>Sözlükte ayrıntısı</a>. <a href={chartUrl(symbol)} target="_blank" rel="noreferrer">{code} grafiği</a></p>
      </details>
    </>
  )
}

function Headline({ now }: { now: Now }) {
  const { stat, trigger, distance } = now
  const what = <>{tfOf(stat.tf).adj} veride {rule(stat)}</>
  if (stat.active) return <>{sideName(stat.side)} sinyali açık: {what}.</>
  if (!stat.filterNow) return <>{sideName(stat.side)} sinyalinin koşulu şu an yok: {what}.</>
  if (trigger == null || distance == null) return <>{sideName(stat.side)} sinyali uzak: {what}.</>
  return <>{sideName(stat.side)} sinyaline <b>{pct(Math.abs(distance)).replace('+', '')}</b> var: {what}.</>
}

function SignalBlock({ side, now, a }: { side: Side; now?: Now; a: Analysis }) {
  if (!now) {
    // Teyitli ya da umut verici sinyal yok: en çok tekrar etmiş eşiğin neden elendiğini göster
    const all = a.frames.flatMap((f) => (side === 'dip' ? f.dips : f.tops))
    const tried = all.filter((s) => s.main.n >= 4).length
    return (
      <article className="vd">
        <div>
          <h3>{sideName(side)} sinyali</h3>
          <p className="vd-act">Yok</p>
          <p className="vd-why">{tried ? `Yeterince tekrar etmiş ${tried} kuralın hiçbiri olağandan iyi sonuç vermedi.` : 'Hiçbir kural en az 4 kez tekrar etmedi; geçmiş bu sınama için kısa.'}</p>
        </div>
      </article>
    )
  }
  const { stat, frame, trigger, distance } = now
  const tf = tfOf(stat.tf)
  const m = stat.main
  const hits = Math.round((m.hit ?? 0) * m.n)
  const recent = [...stat.events].reverse().slice(0, 6)
  return (
    <article className={'vd' + (stat.verdict === 'confirmed' ? ' strong' : '')}>
      <div>
        <h3>{sideName(side)} sinyali</h3>
        <p className="vd-act">{tf.label}: {triggerLabel(stat.trigger)}<span className="vd-str">{VERDICT_LABEL[stat.verdict]}</span></p>
        {stat.filter !== 'any' && <p className="vd-why"><b>Koşul:</b> {FILTER_LABEL[stat.filter]} ({stat.filterNow ? 'şu an sağlanıyor' : 'şu an sağlanmıyor'}).</p>}
        <p className="vd-why">
          <b>{m.n} sinyalin {inOf(hits)}</b> {durationLabel(m.bars, frame.spacing)} sonra fiyat {expected(side)} (<b className="num">%{Fmt.number((m.hit ?? 0) * 100, 0)}</b>; olağan %{Fmt.number((m.baseHit ?? 0) * 100, 0)}).
          Ortanca getiri <b className="num">{pct(m.median)}</b>, olağan {pct(m.baseMedian)}.
          {stat.span > 0 && <> İlk ve son sinyal arası {durationLabel(1, stat.span)}.</>}
        </p>
        <p className="vd-why">
          <b>Şu an:</b>{' '}
          {stat.active
            ? <>sinyal açık. {stat.sinceBars != null && <>Son sinyal {stat.sinceBars === 0 ? 'bu çubukta' : `${durationLabel(stat.sinceBars, frame.spacing)} önce`} geldi{stat.sinceBars ? <>; o günden beri <span className="num">{pct(stat.sinceReturn)}</span></> : null}.</>}</>
            : trigger != null && distance != null
              ? <>{INDICATOR_LABEL[stat.trigger.ind]} <span className="num">{val(stat.trigger.ind, frame.values[stat.trigger.ind].now)}</span>. Sıradaki {tf.adj} çubuk <b className="num">{price(trigger)}</b> {side === 'dip' && stat.trigger.ind !== 'macd' ? 'altında' : side === 'top' && stat.trigger.ind !== 'macd' ? 'üstünde' : trigger < frame.close ? 'altında' : 'üstünde'} kapanırsa {stat.filterNow ? 'sinyal gelir' : 'gösterge eşiğe gelir, ama koşul sağlanmadığı için sinyal sayılmaz'}; bugünkü fiyata (<span className="num">{price(frame.close)}</span>) uzaklık <b className="num">{pct(distance)}</b>.</>
              : <>{INDICATOR_LABEL[stat.trigger.ind]} <span className="num">{val(stat.trigger.ind, frame.values[stat.trigger.ind].now)}</span>; tek çubukta sinyal gelmesi beklenmez.</>}
        </p>
      </div>
      <div className="vd-range">
        {stat.trigger.ind !== 'macd' && <LevelBar frame={frame} ind={stat.trigger.ind} level={stat.level} />}
        {recent.length > 0 && (
          <table className="st-events">
            <caption>Son sinyaller ve {durationLabel(m.bars, frame.spacing)} sonrası</caption>
            <tbody>
              {recent.map((e) => (
                <tr key={e.t}>
                  <td>{when(e.t, stat.tf)}</td>
                  <td className="r num">{price(e.price)}</td>
                  <td className={'r num ' + (e.ret[1] == null ? '' : (e.ret[1]! > 0) === (side === 'dip') ? 'pos' : 'neg')}>{e.ret[1] == null ? 'sürüyor' : pct(e.ret[1])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </article>
  )
}

/** Göstergenin bu zaman diliminde gördüğü aralık, eşik ve şu anki yeri */
function LevelBar({ frame, ind, level }: { frame: TimeframeAnalysis; ind: Indicator; level: number }) {
  const v = frame.values[ind]
  const pad = (v.max - v.min) * 0.03
  const lo = Math.min(v.min, level) - pad, hi = Math.max(v.max, level) + pad
  const x = (n: number) => `${Math.max(0, Math.min(100, ((n - lo) / (hi - lo)) * 100))}%`
  return (
    <>
      <div className="vd-bar" role="img" aria-label={`${INDICATOR_LABEL[ind]} ${val(ind, v.now)}, eşik ${val(ind, level)}; görülen aralık ${val(ind, v.min)} – ${val(ind, v.max)}`}>
        <span className="med" style={{ left: x(level) }} />
        <span className="now" style={{ left: x(v.now) }} />
      </div>
      <div className="vd-ends"><span>en düşük {val(ind, v.min)}</span><span>eşik {val(ind, level)}, şimdi {val(ind, v.now)}</span><span>en yüksek {val(ind, v.max)}</span></div>
    </>
  )
}

function Best({ s }: { s: SignalStat }) {
  if (s.verdict === 'thin' || s.verdict === 'none') return <span className="prem-st">{s.verdict === 'thin' ? 'Örnek az' : 'Yok'}</span>
  return <><span className={'prem-st' + (s.verdict === 'confirmed' ? ' buy' : '')}>{VERDICT_LABEL[s.verdict]}</span><span className="s">{rule(s)}</span></>
}

function FrameDetail({ f }: { f: TimeframeAnalysis }) {
  const tf = tfOf(f.tf)
  const horizon = durationLabel(f.dips[0].main.bars, f.spacing)
  const row = (s: SignalStat) => {
    const trig = s.active ? undefined : f.triggers[s.trigger.id]
    return (
      <tr key={s.trigger.id + s.filter} className={s.verdict === 'confirmed' ? 'is-buy' : undefined}>
        <td><span className="n">{triggerLabel(s.trigger)}</span>{s.filter !== 'any' && <span className="s">{FILTER_LABEL[s.filter]}{s.filterNow ? '' : ' (şu an sağlanmıyor)'}</span>}</td>
        <td className="r num">{s.main.n}</td>
        <td className="r num">{s.main.hit == null ? '—' : '%' + Fmt.number(s.main.hit * 100, 0)}<span className="s">olağan %{Fmt.number((s.main.baseHit ?? 0) * 100, 0)}</span></td>
        <td className="r num hide-s">{pct(s.main.median)}<span className="s">olağan {pct(s.main.baseMedian)}</span></td>
        <td className="r num">{s.active ? 'açık' : trig != null && trig > 0 ? <>{price(trig)}<span className="s">{pct(trig / f.close - 1)}</span></> : '—'}</td>
        <td className="r"><span className={'prem-st' + (s.verdict === 'confirmed' ? ' buy' : '')}>{VERDICT_LABEL[s.verdict]}</span></td>
      </tr>
    )
  }
  const good = (s: SignalStat) => s.verdict === 'confirmed' || s.verdict === 'promising'
  const part = (list: SignalStat[], title: string) => {
    const combos = list.filter((s) => s.filter !== 'any' && good(s)).sort((x, y) => Number(y.verdict === 'confirmed') - Number(x.verdict === 'confirmed') || y.score - x.score).slice(0, 8)
    return (
      <>
        <tr className="st-sep"><td colSpan={6}>{title}</td></tr>
        {list.filter((s) => s.filter === 'any').map(row)}
        {combos.length > 0 && <tr className="st-sep sub"><td colSpan={6}>Koşulla birlikte öne çıkanlar</td></tr>}
        {combos.map(row)}
      </>
    )
  }
  return (
    <details className="an-how st-frame">
      <summary>{tf.label}: tüm kurallar ({f.bars} çubuk, sonuç {horizon} sonra ölçülür)</summary>
      <table className="result-table st-table">
        <thead><tr><th>Kural</th><th className="r">Kez</th><th className="r">Tuttu</th><th className="r hide-s">Ortanca</th><th className="r">Tetik fiyatı</th><th className="r">Durum</th></tr></thead>
        <tbody>
          {part(f.dips, 'Dip (alım) kuralları: sonrasında fiyat yukarıda mı?')}
          {part(f.tops, 'Tepe (satım) kuralları: sonrasında fiyat aşağıda mı?')}
        </tbody>
      </table>
    </details>
  )
}
