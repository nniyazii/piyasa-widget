/**
 * Analiz › Hisse: seçilen hissede RSI'a dayalı dip ve tepe sinyallerinin tarihsel teyidi.
 *   #/analiz/hisse/NASDAQ:SNDK
 * Önce cevap (şu an sinyale ne kadar uzak), sonra dip ve tepe sinyali, en altta tüm eşiklerin dökümü.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import * as Fmt from '../core/format'
import {
  analyze, bestOf, CONFIRM, durationLabel, indicators, marketOf, FILTER_LABEL, INDICATOR_LABEL, RULES_PER_FRAME, TIMEFRAMES, triggerLabel, VERDICT_LABEL,
  type Analysis, type Bars, type Evidence, type Indicator, type Side, type SignalStat, type Timeframe, type TimeframeAnalysis,
} from '../core/signals'
import { chartUrl } from '../core/tradingview'
import { loadBars, loadSetups, loadUniverse, withLive, type DeepBars, type SetupData } from '../data/bars'
import type { Basis } from '../core/setups'
import { setupHeadline, SetupsHow, SetupsView } from './StockSetups'
import { useApp } from '../data/store'
import type { SearchHit } from '../core/catalog'
import { scan, search } from '../data/tv'
import { Icon } from '../ui/Icon'
import { href, navigate } from '../ui/router'
import { AfterChart, HitBar, SignalChart } from '../ui/SignalChart'

const LAST_KEY = 'piyasa.hisse'
const BASIS_KEY = 'piyasa.hisse.baz'
const savedBasis = (): Basis => { try { return localStorage.getItem(BASIS_KEY) === 'try' ? 'try' : 'usd' } catch { return 'usd' } }
const EXAMPLES = ['NASDAQ:SNDK', 'BIST:THYAO', 'NASDAQ:NVDA', 'BIST:ASELS']
const pct = (v?: number, d = 1) => (v == null ? '—' : (v > 0.00005 ? '+' : v < -0.00005 ? '−' : '') + '%' + Fmt.number(Math.abs(v * 100), d))
const price = (v?: number) => (v == null ? '—' : Fmt.number(v, v >= 1000 ? 0 : v >= 10 ? 2 : 4))
const rsiFmt = (v: number) => Fmt.number(v, 1)
/** Gösterge değeri: RSI 36,5; Bollinger −1,3σ; 200 ortalamaya uzaklık −%12; MACD işareti */
const val = (ind: Indicator, v: number) => (Number.isNaN(v) ? '—'
  : ind === 'rsi' ? rsiFmt(v)
    : ind === 'bb' ? (v < 0 ? '−' : '+') + Fmt.number(Math.abs(v), 1) + 'σ'
      : ind === 'd200' || ind === 'dd' ? pct(v, 0)
        : ind === 'roc' ? (v < 0 ? '−' : '+') + Fmt.number(Math.abs(v), 1) + 'σ'
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

interface Loaded { symbol: string; data?: DeepBars; live?: number; error?: string; universe?: Awaited<ReturnType<typeof loadUniverse>>; setups?: SetupData }

export function StockAnalysis({ symbol }: { symbol?: string }) {
  const sym = symbol?.toUpperCase()
  const [state, setState] = useState<Loaded | undefined>()
  // BIST hisseleri varsayılan olarak dolar bazında değerlendirilir (TL'deki enflasyon yanıltmasın diye)
  const [basis, setBasisState] = useState<Basis>(savedBasis)
  const setBasis = (b: Basis) => { setBasisState(b); try { localStorage.setItem(BASIS_KEY, b) } catch { /* depolama kapalı */ } }
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
      loadUniverse(sym),
      loadBars(sym),
      scan('global', { symbols: { tickers: [sym] }, columns: ['close'] }).then((r) => (typeof r[0]?.d[0] === 'number' ? (r[0].d[0] as number) : undefined)).catch(() => undefined),
    ]).then(async ([universe, data, live]) => {
      // Kurulumlar günlük veriden; kopya eskiyse son gün canlı fiyatla güncellenir
      const daily = data ? (data.source === 'snapshot' ? withLive(data.frames, live) : data.frames).D : undefined
      const setups = await loadSetups(sym, daily, basis).catch(() => undefined)
      if (!alive) return
      setState({ symbol: sym, data, live, universe, setups })
      if (data) try { localStorage.setItem(LAST_KEY, sym) } catch { /* depolama kapalı */ }
    })
    return () => { alive = false }
  }, [sym, basis])

  const result = useMemo(() => {
    if (!state?.data) return undefined
    // Sunucudan gelen veri zaten taze; kopya saatler önce alınmış olabilir, son çubuk canlı fiyatla güncellenir
    const frames = state.data.source === 'snapshot' ? withLive(state.data.frames, state.live) : state.data.frames
    return { a: analyze(frames, state.universe?.rules), frames }
  }, [state])

  return (
    <>
      <Picker current={sym} />
      {!sym ? <Empty />
        : !state || state.symbol !== sym ? <p className="an-answer" aria-live="polite">Geçmiş veriler alınıyor…</p>
          : !result || !result.a.frames.length ? <Missing symbol={sym} />
            : <Result symbol={sym} a={result.a} frames={result.frames} setups={state.setups} onBasis={setBasis} data={state.data!} live={state.data!.source === 'snapshot' && state.live != null} />}
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

function Result({ symbol, a, frames, data, live, setups, onBasis }: { symbol: string; a: Analysis; frames: DeepBars['frames']; data: DeepBars; live: boolean; setups?: SetupData; onBasis: (b: Basis) => void }) {
  const code = Fmt.ticker(symbol)
  const dip = nowOf(a, a.bestDip), top = nowOf(a, a.bestTop)
  // Başlıkta teyitli sinyal önce gelir; ikisi de aynı düzeydeyse şu an açık olan ya da fiyata yakın olan
  const lead = [dip, top].filter((x): x is Now => !!x).sort((x, y) =>
    Number(y.stat.verdict === 'confirmed') - Number(x.stat.verdict === 'confirmed') || Number(y.stat.filterNow) - Number(x.stat.filterNow) || Number(y.stat.active) - Number(x.stat.active) || Math.abs(x.distance ?? 9) - Math.abs(y.distance ?? 9))[0]
  const longest = a.frames[0]
  const head = setups ? setupHeadline(setups) : undefined
  const own = (
    <>

      <div className="vd-list">
        <SignalBlock side="dip" now={dip} a={a} bars={dip && frames[dip.stat.tf]} symbol={symbol} />
        <SignalBlock side="top" now={top} a={a} bars={top && frames[top.stat.tf]} symbol={symbol} />
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

    </>
  )
  return (
    <>
      {head ? (
        <>
          <header className="an-head">
            <h2>{code}: şu an güvenilir bir dip ya da tepe durumu var mı?</h2>
            <p className="an-answer" aria-live="polite">{head.answer}</p>
          </header>
          <p className="an-sub">{head.sub}</p>
          <SetupsView d={setups!} symbol={symbol} onBasis={onBasis} />
          <details className="an-how st-own">
            <summary>Bu hisseye özgü kurallar (daha zayıf kanıt): {a.bestDip?.verdict === 'confirmed' || a.bestTop?.verdict === 'confirmed' ? 'teyitli kural var' : 'teyitli kural yok'}</summary>
            <p className="an-sub">{setups!.basis === 'usd' ? 'Bu bölüm TL fiyatlarıyla hesaplanır. ' : ''}Bu bölüm yalnızca {code} hissesinin kendi geçmişine bakar: yaklaşık {a.frames.length * RULES_PER_FRAME} kural sınanır. Örnek az olduğu için kanıt zayıftır: araştırmada teyitli kurallar sonraki dönemde %54 tuttu (olağan %47).</p>
            {own}
          </details>
        </>
      ) : (
        <>
          <header className="an-head">
            <h2>{code}: geçmişte tutmuş bir dip ya da tepe sinyali var mı, şu an neresinde?</h2>
            <p className="an-answer" aria-live="polite">{!lead ? 'Geçmişte tutmuş bir sinyal yok.' : lead.stat.verdict === 'confirmed' ? <Headline now={lead} /> : 'Teyitli bir sinyal yok.'}</p>
          </header>
          <p className="an-sub">
            {lead
              ? <>{tfOf(lead.stat.tf).label} veride “{rule(lead.stat)}” kuralı <b>{lead.stat.main.n} kez</b> sinyal verdi; {durationLabel(lead.stat.main.bars, lead.frame.spacing)} sonra <b>{inOf(Math.round((lead.stat.main.hit ?? 0) * lead.stat.main.n))}</b> fiyat {expected(lead.stat.side)}. {lead.stat.verdict === 'confirmed' ? 'Sinyal teyitli.' : 'Bu kural teyitli değil, yalnızca en yakın aday: araştırmada bu düzeydeki kurallar sonraki dönemde olağandan ayırt edilemedi.'}</>
              : <>{a.frames.length} zaman diliminde {a.frames.length * RULES_PER_FRAME} kural sınandı; hiçbiri {code} hissesinin olağan seyrinden belirgin biçimde iyi sonuç vermedi. {longest.bars < 150 ? `Geçmiş kısa: ${tfOf(longest.tf).adj} veride yalnızca ${longest.bars} çubuk var.` : 'Bu hissede bu göstergeler güvenilir bir dip ya da tepe işareti vermemiş.'}</>}
          </p>
          <p className="st-alarm"><a className="btn small" href={href('alarmlar', { tur: 'sinyal', s: symbol })}><Icon name="bell" />Sinyal gelince haber ver</a><a className="btn ghost small" href={href('alarmlar', { tur: 'fiyat', s: symbol })}>Fiyat alarmı kur</a></p>
          {own}
        </>
      )}

      <details className="an-how">
        <summary>Nasıl hesaplanıyor, nelere dikkat etmeli</summary>
        <ul>
          {setups && <SetupsHow d={setups} />}
          <li><b>Göstergeler</b> (hepsi kapanıştan): RSI (14), Bollinger bantları (20 çubuk, 2 ve 2,5 standart sapma), fiyatın 200 çubukluk ortalamaya uzaklığı, MACD (12, 26, 9) kesişimi, son 250 çubuğun zirvesinden gerileme (%15, %25, %35) ve hissenin kendi oynaklığına göre sert 5 çubukluk hareket (2 ve 3 standart sapma).</li>
          <li><b>Bağlam</b>: her kural tek başına ve dört koşulla birlikte sınanır: fiyat 200 ortalamanın üstünde ya da altında, 50 ortalama 200’ün üstünde ya da altında. “RSI 30’un altında, fiyat 200 ortalamanın üstündeyken” gibi.</li>
          <li><b>Sinyal</b>: gösterge eşiği geçtiği ilk çubuk. Aynı harekette tekrar saymamak için gösterge eşikten uzaklaşmadan (RSI’da 10 puan) yeni sinyal sayılmaz.</li>
          <li><b>Tuttu</b>: sinyalden belirli bir süre sonra fiyat beklenen yöndeyse (dipte yukarıda, tepede aşağıda). Süre zaman dilimine göre: haftalıkta 13 hafta, günlükte 21 gün, 4 saatlikte 20 çubuk, saatlikte 35 çubuk.</li>
          <li><b>Olağan</b>: hissenin herhangi bir andan aynı süre sonraki sonucu. Sürekli yükselen bir hissede her alım “tutar”; bu yüzden sinyal kendi başarısıyla değil, olağanla farkıyla değerlendirilir. Bağlamlı kurallarda olağan sonuç da aynı bağlamdaki çubuklardan hesaplanır.</li>
          <li><b>Bağımsız sinyal</b>: bir sinyalin sonucu ölçülürken gelen yeni sinyal sayılmaz; aynı hareket iki kez sayılmasın diye.</li>
          <li><b>Rastgele giriş testi</b>: aynı koşullardaki (aynı trend durumu) günlerden, aynı sayıda ve aynı aralıkla binlerce kez rastgele giriş seçilir. Bunların ne kadarı gerçek sinyaller kadar iyi sonuç verdiyse o oran, sonucun şansla açıklanma olasılığıdır.</li>
          <li><b>Teyitli</b> sayılması için dört şartın hepsi gerekir: (1) hissenin kendi geçmişinde en az {CONFIRM.n} bağımsız sinyal, en az %{CONFIRM.hit * 100} isabet ve rastgele giriş testinde %{CONFIRM.p * 100}’in altı; (2) geçmişin ilk %60’ında (keşif) ve son %40’ında (doğrulama) ayrı ayrı olağandan iyi; (3) en az {CONFIRM.years} yıllık veri; (4) aynı kural, aynı pazardaki yüzlerce hissenin toplamında da olağandan iyi.</li>
          <li><b>Zayıf kanıt</b>: hissenin kendi geçmişinde iyi görünüyor ama dört şartın hepsini sağlamıyor. Araştırmada bu düzeydeki kurallar sonraki dönemde olağandan yalnızca 1 puan iyi sonuç verdi; yani tek başına bir şey söylemez.</li>
          <li><b>Bu yöntem ne kadar güvenilir?</b> 341 hissede sınandı: kurallar geçmişin ilk %75’iyle seçildi, yöntemin hiç görmediği son %25’te ölçüldü. Teyitli kurallar o dönemde <b>%54</b> tuttu, aynı dönemin olağanı <b>%47</b> (582 sinyal). Haftalık kurallarda %59’a karşı %49; günlükte %52’ye karşı %46. Dip sinyalleri (olağandan 9 puan iyi) tepe sinyallerinden (5 puan) daha güvenilir çıktı. Ortalama getiri farkı küçük: haftalıkta yaklaşık +%3, günlükte belirsiz.</li>
          <li><b>Sınırı</b>: öngörülebilirliği yok edilmiş rastgele veride de hisselerin yaklaşık beşte birinde teyitli kural çıkıyor (gerçek veride üçte birinde). Yani teyitli bir kuralın önemli bir kısmı, hisseye özgü bir özellikten değil, kuralın pazar genelinde işe yaramasından ya da şanstan gelir. Teyit kesinlik değildir; “olağandan biraz daha sık tutmuş ve tutmaya devam etmiş” demektir.</li>
          <li>Saatlik ve 4 saatlik veriler 1–3 yılı kapsadığı için çoğu zaman “zayıf kanıt”ta kalır: araştırmada kısa geçmişe dayanan sinyaller sonraki dönemde tutmadı.</li>
          <li><b>Tetik fiyatı</b>: bir sonraki çubuk bu fiyattan kapanırsa gösterge eşiğe gelir. Her yeni çubukla değişir. MACD kesişiminde tek çubukta ulaşılabiliyorsa gösterilir.</li>
          <li>Her hissede yaklaşık {4 * RULES_PER_FRAME} kural birden sınanır; bu kadar denemede birkaçı şans eseri iyi görünebilir. Aynı bulgu birkaç kuralda birden çıkıyorsa (örneğin RSI ve Bollinger aynı yeri gösteriyorsa) daha güvenilirdir. Teyit koşulları bunu azaltır, yok etmez. Geçmişte tutmuş olması gelecekte tutacağını garanti etmez.</li>
          <li>Veri TradingView’den: haftalık en çok 1000, günlük 3000, 4 saatlik 1500, saatlik 2000 çubuk. Fiyatlar bölünme ve temettüye göre düzeltilmiştir. {live ? `Geçmiş ${Fmt.dateTime(data.generated)} kopyasından; son çubuk canlı fiyatla (BIST’te 15 dakika gecikmeli) güncellendi.` : `Veri ${Fmt.dateTime(data.generated)} itibarıyla.`}</li>
        </ul>
        <p><a href={href(setups ? 'sozluk/guclu-kurulum' : 'sozluk/rsi-sinyali')}>Sözlükte ayrıntısı</a>. <a href={chartUrl(symbol)} target="_blank" rel="noreferrer">{code} grafiği</a></p>
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

function SignalBlock({ side, now, a, bars, symbol }: { side: Side; now?: Now; a: Analysis; bars?: Bars; symbol: string }) {
  const series = useMemo(() => (bars ? indicators(bars.c) : undefined), [bars])
  if (!now || !bars || !series) {
    // Teyitli ya da umut verici sinyal yok
    const all = a.frames.flatMap((f) => (side === 'dip' ? f.dips : f.tops))
    const tried = all.filter((s) => s.main.n >= 4).length
    return (
      <article className="st-sig">
        <h3>{sideName(side)} sinyali</h3>
        <p className="vd-act">Yok</p>
        <p className="vd-why">{tried ? `Yeterince tekrar etmiş ${tried} kuralın hiçbiri olağandan iyi sonuç vermedi.` : 'Hiçbir kural en az 4 kez tekrar etmedi; geçmiş bu sınama için kısa.'}</p>
      </article>
    )
  }
  const { stat, frame, trigger, distance } = now
  const tf = tfOf(stat.tf)
  const m = stat.main
  const hits = Math.round((m.hit ?? 0) * m.n)
  const horizon = durationLabel(m.bars, frame.spacing)
  const ind = stat.trigger.ind
  return (
    <article className={'st-sig' + (stat.verdict === 'confirmed' ? ' strong' : '')}>
      <h3>{sideName(side)} sinyali</h3>
      <p className="vd-act">{tf.label}: {triggerLabel(stat.trigger)}<span className="vd-str">{VERDICT_LABEL[stat.verdict]}</span></p>
      {stat.filter !== 'any' && <p className="vd-why"><b>Koşul:</b> {FILTER_LABEL[stat.filter]} ({stat.filterNow ? 'şu an sağlanıyor' : 'şu an sağlanmıyor'}).</p>}
      <dl className="st-facts">
        <div><dt>Tuttu ({horizon} sonra)</dt><dd className="num">{hits} / {m.n}<small>%{Fmt.number((m.hit ?? 0) * 100, 0)}, olağan %{Fmt.number((m.baseHit ?? 0) * 100, 0)}</small></dd></div>
        <div><dt>Ortanca getiri</dt><dd className="num">{pct(m.median)}<small>olağan {pct(m.baseMedian)}</small></dd></div>
        <div>
          <dt>Şu an</dt>
          <dd className="num">
            {stat.active ? <>Sinyal açık{stat.sinceBars ? <small>{durationLabel(stat.sinceBars, frame.spacing)} önce geldi, o günden beri {pct(stat.sinceReturn)}</small> : null}</>
              : trigger != null && distance != null ? <>{pct(distance)} uzakta<small>tetik {price(trigger)}, fiyat {price(frame.close)}{stat.filterNow ? '' : '; koşul sağlanmıyor'}</small></>
                : <>{val(ind, frame.values[ind].now)}<small>{INDICATOR_LABEL[ind]}; tek çubukta sinyal beklenmez</small></>}
          </dd>
        </div>
      </dl>
      <Checks stat={stat} frame={frame} symbol={symbol} />
      <div className="st-charts">
        <SignalChart bars={bars} series={series} stat={stat} trigger={trigger} horizon={horizon} />
        <AfterChart bars={bars} series={series} stat={stat} unit={(b) => durationLabel(b, frame.spacing)} />
      </div>
      <details className="an-how">
        <summary>Sinyallerin listesi ({stat.events.length})</summary>
        <table className="st-events">
          <thead><tr><th>Tarih</th><th className="r">Fiyat</th><th className="r">{horizon} sonra</th><th className="r">Arada en kötü</th></tr></thead>
          <tbody>
            {[...stat.events].reverse().map((e) => (
              <tr key={e.t}>
                <td>{when(e.t, stat.tf)}</td>
                <td className="r num">{price(e.price)}</td>
                <td className={'r num ' + (e.ret[1] == null ? '' : (e.ret[1]! > 0) === (side === 'dip') ? 'pos' : 'neg')}>{e.ret[1] == null ? 'sürüyor' : pct(e.ret[1])}</td>
                <td className="r num">{pct(side === 'dip' ? e.worst : e.best)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </article>
  )
}

/** Teyidin dört şartı: her biri ne ölçtü, geçti mi */
function Checks({ stat, frame, symbol }: { stat: SignalStat; frame: TimeframeAnalysis; symbol: string }) {
  const { all, discovery, confirm, cutTime } = stat.test
  const year = (t: number) => new Date(t * 1000).getFullYear()
  const part = (e: Evidence) => (e.n ? `${e.n} sinyalin ${Math.round((e.hit ?? 0) * e.n)} tanesi tuttu (%${Fmt.number((e.hit ?? 0) * 100, 0)}; olağan %${Fmt.number((e.baseHit ?? 0) * 100, 0)})` : 'sinyal yok')
  const pText = all.p == null ? 'sınanamadı (sinyal az)' : all.p < 0.001 ? 'binde 1’den az' : '%' + Fmt.number(all.p * 100, all.p < 0.01 ? 2 : 1)
  const market = marketOf(symbol)
  const u = stat.universe
  const rows: { ok: boolean; title: string; text: string }[] = [
    { ok: stat.checks.stock, title: 'Hissenin kendi geçmişi', text: `${part(all)}. Aynı koşullarda rastgele seçilmiş günlerin bu kadar iyi sonuç verme olasılığı: ${pText}.` },
    { ok: stat.checks.periods, title: 'İki ayrı dönem', text: `Keşif (${year(frame.from)}–${year(cutTime)}): ${part(discovery)}. Doğrulama (${year(cutTime)}–${year(frame.to)}): ${part(confirm)}.` },
    { ok: stat.checks.depth, title: 'Veri derinliği', text: `${Fmt.number(stat.years, 1)} yıl sınandı; teyit için en az ${CONFIRM.years} yıl gerekir${stat.checks.depth ? '' : '. Kısa geçmişte tutmuş sinyaller sonraki dönemde çoğu zaman tutmadı'}.` },
    { ok: stat.checks.universe, title: market === 'TR' ? 'BIST geneli' : market === 'US' ? 'ABD hisseleri geneli' : 'Pazar geneli',
      text: !market ? 'Bu sembol hisse değil; pazar geneli karşılaştırması yalnızca hisselerde yapılır.'
        : !u ? 'Bu kural pazar genelinde yeterince sinyal vermedi ya da karşılaştırma verisi yüklenemedi.'
          : `Aynı kural ${u.stocks} hissede ${Fmt.number(u.n, 0)} sinyal verdi; olağandan ${u.diff >= 0 ? '' : '−'}${Fmt.number(Math.abs(u.diff * 100), 1)} puan ${u.diff >= 0 ? 'daha sık' : 'daha seyrek'} tuttu${stat.checks.universe ? '' : `. Teyit için en az ${CONFIRM.diff * 100} puan ve güçlü tutarlılık gerekir`}.` },
  ]
  const passed = rows.filter((r) => r.ok).length
  return (
    <details className="st-checks" open={stat.verdict === 'confirmed' || undefined}>
      <summary>Kanıt: 4 şarttan {passed} tanesi sağlanıyor</summary>
      <ul>
        {rows.map((r) => (
          <li key={r.title} className={r.ok ? 'ok' : 'no'}>
            <Icon name={r.ok ? 'check' : 'close'} label={r.ok ? 'Sağlanıyor' : 'Sağlanmıyor'} />
            <div><b>{r.title}</b><span>{r.text}</span></div>
          </li>
        ))}
      </ul>
      {stat.adverse != null && stat.favorable != null && (
        <p className="st-risk">Sinyalden sonra, sonuç ölçülene kadar fiyat ortanca olarak en çok <b className="num">{pct(stat.adverse)}</b> ters yöne, <b className="num">{pct(stat.favorable)}</b> beklenen yöne gitti.</p>
      )}
    </details>
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
        <td className="r num">{s.main.hit == null ? '—' : '%' + Fmt.number(s.main.hit * 100, 0)}<HitBar hit={s.main.hit} base={s.main.baseHit} /><span className="s">olağan %{Fmt.number((s.main.baseHit ?? 0) * 100, 0)}</span></td>
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
