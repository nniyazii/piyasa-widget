/**
 * Analiz › Hisse: seçilen hissede yakın zamanda ne oldu ve bu olaylardan sonra geçmişte ne oldu.
 *   #/analiz/hisse/NASDAQ:SNDK          #/analiz/hisse/BIST:THYAO?e=rsi-30
 * Mum grafik tezgâhı (aylık, haftalık, günlük), aynı olayın pazar genelindeki sonucu ve güçlü kurulumlar.
 */
import { useEffect, useRef, useState } from 'react'
import type { SearchHit } from '../core/catalog'
import * as Fmt from '../core/format'
import type { World } from '../core/macro'
import type { Basis } from '../core/setups'
import { sentence, TF_LABEL, type Tf } from '../core/study'
import { marketOfSubject } from '../core/subject'
import { chartUrl } from '../core/tradingview'
import { loadBars, loadSetups, loadSymbols, resolveSymbol, type SetupData } from '../data/bars'
import { customEvent } from '../core/study'
import { useCustomEvents } from '../data/custom'
import { loadWorld } from '../data/macro'
import { loadMarketEvents, type MarketLookup } from '../data/marketEvents'
import { useApp } from '../data/store'
import { loadSubject, type Subject } from '../data/subjects'
import { search } from '../data/tv'
import { Icon } from '../ui/Icon'
import { href, navigate, useRoute } from '../ui/router'
import { setupHeadline, SetupsHow, SetupsView } from './StockSetups'
import { recentOf, savedTf, Workbench } from './Workbench'

const LAST_KEY = 'piyasa.hisse'
const BASIS_KEY = 'piyasa.hisse.baz'
const savedBasis = (): Basis => { try { return localStorage.getItem(BASIS_KEY) === 'try' ? 'try' : 'usd' } catch { return 'usd' } }
const EXAMPLES = ['NASDAQ:SNDK', 'BIST:THYAO', 'NASDAQ:NVDA', 'BIST:ASELS']

interface Loaded { symbol: string; subject?: Subject; setups?: SetupData; market?: MarketLookup; world?: World; /** Veri yoksa: kopyadaki aynı kodlu semboller; failed: sembol kopyada var ama indirilemedi */ matches?: string[]; failed?: boolean }

export function StockAnalysis({ symbol }: { symbol?: string }) {
  const sym = symbol?.toUpperCase()
  const { query } = useRoute()
  const [state, setState] = useState<Loaded | undefined>()
  const [attempt, setAttempt] = useState(0)
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
    setState((s) => (s?.symbol === sym ? s : undefined))
    void (async () => {
      const [subject, raw, world] = await Promise.all([loadSubject(sym, basis === 'usd'), loadBars(sym), loadWorld()])
      if (!subject) {
        // Sembol başka bir borsa koduyla ya da yalnızca kısa kodla gelmiş olabilir: kopyadaki karşılığına geç
        const r = await resolveSymbol(sym)
        if (!alive) return
        if (r && !r.known && r.matches.length === 1) { navigate('analiz/hisse/' + r.matches[0], Object.fromEntries(query), true); return }
        setState({ symbol: sym, world, matches: r && !r.known ? r.matches : undefined, failed: !r || r.known })
        return
      }
      const [setups, market] = await Promise.all([
        loadSetups(sym, raw?.D, basis).catch(() => undefined),
        subject?.market ? loadMarketEvents(subject.market === 'TR' ? (subject.usd ? 'TR_USD' : 'TR') : 'US') : undefined,
      ])
      if (!alive) return
      setState({ symbol: sym, subject, setups, market, world })
      if (subject) try { localStorage.setItem(LAST_KEY, sym) } catch { /* depolama kapalı */ }
    })()
    return () => { alive = false }
  }, [sym, basis, attempt])

  return (
    <>
      <Picker current={sym} />
      {!sym ? <Empty />
        : !state ? <p className="an-answer" aria-live="polite">{Fmt.ticker(sym)} geçmişi yükleniyor…</p>
          : !state.subject ? <Missing symbol={sym} matches={state.matches} failed={state.failed} onRetry={() => { setState(undefined); setAttempt((n) => n + 1) }} />
            : <Result key={sym} s={state} basis={basis} onBasis={setBasis} initialEvent={query.get('e') ?? undefined} initialTf={((t) => (t === 'M' || t === 'W' || t === 'D' ? t : undefined))(query.get('tf'))} />}
    </>
  )
}

// ------------------------------------------------------------------ hisse seçimi

function Picker({ current }: { current?: string }) {
  const app = useApp()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[] | undefined>()
  const [known, setKnown] = useState<Set<string> | undefined>()
  useEffect(() => { void loadSymbols().then((l) => { if (l) setKnown(new Set(l)) }) }, [])
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (q.trim().length < 2) { setHits(undefined); return }
    const ac = new AbortController()
    const id = setTimeout(() => { search(q, ac.signal).then((h) => { const list = h.filter((x) => x.type !== 'economic'); setHits(known ? [...list.filter((x) => known.has(x.symbol.toUpperCase())), ...list.filter((x) => !known.has(x.symbol.toUpperCase()))] : list) }).catch(() => { /* iptal */ }) }, 250)
    return () => { clearTimeout(id); ac.abort() }
  }, [q, known])
  const go = (s: string) => { setQ(''); setHits(undefined); navigate('analiz/hisse/' + s) }
  const own = app.instruments.filter((i) => !!marketOfSubject(i.symbol) && (!known || known.has(i.symbol.toUpperCase())) && !/:(IXIC|NDX|SPX|DJI)$/.test(i.symbol) && !/XU\d|ALTIN|GLDTR|GMSTR/.test(i.symbol) && i.symbol !== current).slice(0, 6)
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
            <li key={h.symbol} className={known && !known.has(h.symbol.toUpperCase()) ? 'off' : undefined}><button type="button" onClick={() => go(h.symbol)}><b>{h.ticker}</b><span>{h.name}</span><em>{h.exchange}{known && !known.has(h.symbol.toUpperCase()) ? ', veri yok' : ''}</em></button></li>
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
        <h2>Bu hissede yakın zamanda ne oldu, benzer olaylardan sonra geçmişte ne oldu?</h2>
        <p className="an-answer">Bir hisse seç; geçmişi taransın.</p>
      </header>
      <p className="an-sub">
        Aylık, haftalık ve günlük mum grafikte fiyat, trend, gösterge ve hacim olayları aranır: sert düşüş, ortalamanın kırılması, RSI’ın 30’un altına inmesi, hacimli satış gibi.
        Her olayın hissedeki tüm geçmiş örnekleri grafikte işaretlenir; sonraki dört vadede fiyatın yukarıda olma oranı, hissenin olağan oranıyla ve aynı olayın pazardaki tüm hisselerdeki sonucuyla yan yana gösterilir.
      </p>
    </>
  )
}

function Missing({ symbol, matches, failed, onRetry }: { symbol: string; matches?: string[]; failed?: boolean; onRetry: () => void }) {
  if (failed) return (
    <>
      <header className="an-head">
        <h2>{Fmt.ticker(symbol)}</h2>
        <p className="an-answer">Geçmiş veri indirilemedi.</p>
      </header>
      <p className="an-sub">Bağlantı kesilmiş ya da yavaş olabilir; veri dosyası birkaç megabayttır. Yeniden dene.</p>
      <p className="st-alarm"><button type="button" className="btn primary small" onClick={onRetry}><Icon name="refresh" />Yeniden dene</button></p>
    </>
  )
  return (
    <>
      <header className="an-head">
        <h2>{symbol.includes(':') ? symbol : Fmt.ticker(symbol)}</h2>
        <p className="an-answer">{matches?.length ? 'Bu kodla birden fazla hisse var; hangisi?' : 'Bu sembolün geçmiş verisi kopyada yok.'}</p>
      </header>
      {matches && matches.length > 0 && <p className="st-quick">{matches.map((m) => <a key={m} href={href('analiz/hisse/' + m)}>{m.replace(':', ' : ')}</a>)}</p>}
      <p className="an-sub">Analiz için BIST hisseleri, piyasa değeri 10 milyar doların üstündeki ABD hisseleri ve başlıca endeks, kur ve madenler hazır tutuluyor. Başka borsalardaki kayıtlar (örneğin bir ABD hissesinin başka ülkede işlem gören karşılığı) kapsam dışıdır. Kopya her iş günü yenilenir; yeni halka açılan hisseler birkaç hafta içinde eklenir.</p>
    </>
  )
}

// ------------------------------------------------------------------ sonuç

function Result({ s, basis, onBasis, initialEvent, initialTf }: { s: Loaded; basis: Basis; onBasis: (b: Basis) => void; initialEvent?: string; initialTf?: Tf }) {
  const subject = s.subject!
  const code = subject.short
  const custom = useCustomEvents()
  // Başlık: kayıtlı zaman diliminde en belirgin yakın olay; yoksa diğer zaman dilimlerine bakılır
  const first = savedTf('W')
  const order = [first, ...(['W', 'D', 'M'] as Tf[]).filter((t) => t !== first)]
  let lead: { tf: Tf; event: string; text: string; clear: boolean } | undefined
  for (const tf of order) {
    const r = recentOf(subject, tf, s.world, custom.map(customEvent)).studies
    const top = r.find((x) => x.best) ?? (lead ? undefined : r[0])
    if (top && (!lead || (top.best && !lead.clear))) lead = { tf, event: top.def.id, text: sentence(code, top), clear: !!top.best }
    if (lead?.clear) break
  }
  const head = s.setups ? setupHeadline(s.setups) : undefined
  const strongOn = s.setups?.list.some((x) => x.active && x.strength?.strong)
  return (
    <>
      <header className="an-head">
        <h2>{code}: yakın zamanda ne oldu, bundan sonrası için geçmiş ne söylüyor?</h2>
        <p className="an-answer ev-answer" aria-live="polite">{lead ? lead.text : 'Yakın zamanda dikkat çekici bir olay olmadı.'}</p>
      </header>
      <p className="an-sub">
        {lead ? `${TF_LABEL[lead.tf]} veriden. ${lead.clear ? '' : 'Bu olay geçmişte yönü belirgin biçimde değiştirmemiş. '}` : ''}
        Grafikte bir olay seç: hissedeki tüm geçmiş örnekleri işaretlenir, sonrasındaki yön olasılıkları üstte durur. {strongOn ? 'Ayrıca şu an güçlü bir kurulum açık (aşağıda).' : ''}
      </p>
      {subject.market === 'TR' && (
        <div className="wb-basis">
          <div className="segmented" role="group" aria-label="Fiyat bazı">
            <button type="button" aria-pressed={basis === 'usd'} onClick={() => onBasis('usd')}>Dolar bazında</button>
            <button type="button" aria-pressed={basis === 'try'} onClick={() => onBasis('try')}>TL</button>
          </div>
          <span className="note">{subject.usd ? 'Fiyatlar Dolar/TL kuruna bölündü: TL’deki enflasyon yükselişi olduğundan büyük göstermesin diye.' : 'TL fiyatlarında enflasyon nedeniyle “yukarıda olma” oranları yüksek çıkar; olağan oranla farkına bak.'}</span>
        </div>
      )}

      <Workbench subject={subject} world={s.world} defaultTf="W" initialEvent={initialEvent} initialTf={initialTf} lead={lead} market={s.market} />

      <p className="st-alarm"><a className="btn ghost small" href={href('alarmlar', { tur: 'fiyat', s: s.symbol })}><Icon name="bell" />Fiyat alarmı kur</a><a className="btn ghost small" href={chartUrl(s.symbol)} target="_blank" rel="noreferrer"><Icon name="external" />TradingView’de aç</a></p>

      {s.setups && head && (
        <section className="an-group">
          <h3>Güçlü kurulumlar: pazar genelinde üç ayrı dönemde sınanmış dip ve tepe durumları</h3>
          <p className="an-sub"><b>{head.answer}</b> {head.sub}</p>
          <details className="an-how st-frame" open={strongOn || undefined}>
            <summary>Kurulumlar, koşullar ve bu hissedeki geçmiş örnekler</summary>
            <SetupsView d={s.setups} symbol={s.symbol} onBasis={onBasis} />
          </details>
        </section>
      )}

      <details className="an-how">
        <summary>Nasıl hesaplanıyor, nelere dikkat etmeli</summary>
        <ul>
          <li><b>Olay</b>: bir durumun başladığı mumdur (RSI’ın 30’un altına indiği ilk mum gibi). Aynı olayın iki başlangıcı arasında bir süre aranır; böylece tek bir hareket birkaç kez sayılmaz.</li>
          <li><b>Yukarıda olma oranı</b>: olayın geçmişteki her örneğinden sonra, seçilen vadede fiyatın daha yukarıda olduğu örneklerin payı. Olay yakın zamanda gerçekleştiyse ölçüm, olaydan bugüne geçen süre kadar ilerlenip oradan yapılır; yani tablo “bugünden sonrası” içindir.</li>
          <li><b>Olağan</b>: hissenin herhangi bir mumundan aynı süre sonraki yukarıda olma oranı. Sürekli yükselen bir hissede her olaydan sonra fiyat yukarıdadır; asıl bilgi olağanla farktır.</li>
          <li><b>Renkli hücre</b> (belirgin): en az 8 örnek, olağandan en az 12 puan fark, %95 güven aralığı olağan oranı dışarıda bırakıyor ve geçmişin iki yarısında da aynı yönde. Rastgele yürüyüş verisinde bu şartları olayların %5’inden azı sağlar; yine de onlarca olay birden sınandığı için tek bir renkli hücre şans olabilir.</li>
          <li><b>Aralık</b>: gerçek oranın %80 olasılıkla içinde bulunduğu aralık. Örnek azsa aralık geniştir; 10 örnekte %70, “%45 ile %87 arası” demektir.</li>
          <li><b>Pazar geneli</b>: aynı olay o pazardaki tüm hisselerde binlerce kez gerçekleşmiştir. Tek hissedeki 10–20 örnek şansa açıktır; pazar genelindeki sonuç ve üç ayrı dönemdeki tutarlılığı, hissedeki bulgunun ne kadar ciddiye alınacağını gösterir. İkisi aynı yöndeyse bulgu daha güvenilirdir.</li>
          {s.setups && <SetupsHow d={s.setups} />}
          <li><b>Araştırmanın sınırı</b>: tek hisseye özgü kurallar ileriye dönük sınamada zayıf kaldı (%54’e karşı olağan %47) ve BIST’te üç dönemde birden tutan bir dip kurulumu bulunamadı. Bu sayfa bu yüzden “al/sat sinyali” vermez; olaydan sonra geçmişte ne olduğunu, örnek sayısı ve belirsizliğiyle birlikte gösterir.</li>
          <li>Veri TradingView’den: haftalık en çok 1000, günlük 3000 mum; aylık mumlar haftalıktan türetilir. Fiyatlar bölünme ve temettüye göre düzeltilmiştir. {subject.generated ? `Geçmiş ${Fmt.dateTime(subject.generated)} kopyasından; son mum canlı fiyatla (BIST’te 15 dakika gecikmeli) güncellenir.` : ''}</li>
        </ul>
        <p><a href={href('sozluk/olay-incelemesi')}>Sözlükte ayrıntısı</a></p>
      </details>
    </>
  )
}
