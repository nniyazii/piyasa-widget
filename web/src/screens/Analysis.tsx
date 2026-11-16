/**
 * Analiz: bir sayfa, bir soru. Her sayfada önce cevap, sonra veri, en altta hesabın açıklaması.
 *   #/analiz             Görünüm: her varlık için birleştirilmiş görüş ve pratik sorular
 *   #/analiz/urunler     Altın ve gümüş ürünleri değerinin altında mı?
 *   #/analiz/maliyet     Nereden almalı? (banka, fiziki, fon)
 *   #/analiz/birikim     Birikimimi neye çevirmeliyim? (ev, altın, dolar, gümüş)
 *   #/analiz/para-arzi   Para arzına göre ne ucuz, ne pahalı?
 *   #/analiz/hisse/:sembol  Hissede geçmişte tutmuş dip ya da tepe sinyali var mı?
 *   #/analiz/makro       Makro tablo geçmişte hangi dönemlere benziyor, sonrasında ne oldu?
 */
import { useEffect, type ReactNode } from 'react'
import { monthLabel, type Advice } from '../core/advice'
import * as Fmt from '../core/format'
import { FUND_BUY, METALS, TYPICAL_DAYS, type PremiumRow } from '../core/premium'
import { chartUrl } from '../core/tradingview'
import { refreshPremiums, usePremiums, type PremiumState } from '../data/premium'
import { Icon } from '../ui/Icon'
import { href } from '../ui/router'
import { bestRoute, CostCompare } from './CostCompare'
import { Macro } from './Macro'
import { Outlook } from './Outlook'
import { StockAnalysis } from './StockAnalysis'

const TABS = [
  { path: '', label: 'Görünüm' },
  { path: 'makro', label: 'Makro' },
  { path: 'para-arzi', label: 'Para arzı' },
  { path: 'birikim', label: 'Birikim' },
  { path: 'urunler', label: 'Ürünler' },
  { path: 'maliyet', label: 'Nereden almalı' },
  { path: 'hisse', label: 'Hisse' },
]

const pct = (v?: number) => (v == null ? '—' : (v > 0.00005 ? '+' : v < -0.00005 ? '−' : '') + '%' + Fmt.number(Math.abs(v * 100), 1))
const pct0 = (v: number) => '%' + Fmt.number(Math.abs(v * 100), 0)
const tl = (v?: number, d = 2) => (v == null ? '—' : Fmt.number(v, d) + ' ₺')

export function Analysis({ tab, arg }: { tab?: string; arg?: string }) {
  const s = usePremiums()
  const current = TABS.find((t) => t.path === (tab ?? '')) ?? TABS[0]
  // Dar ekranda sekmeler kayar: seçili olan görünür kalsın
  useEffect(() => { document.querySelector('.an-tabs a[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [current])
  return (
    <div className="an">
      <nav className="an-tabs" aria-label="Analiz sayfaları">
        {TABS.map((t) => <a key={t.path} href={href('analiz' + (t.path ? '/' + t.path : ''))} aria-current={t === current ? 'page' : undefined}>{t.label}</a>)}
      </nav>
      {current.path === 'hisse' ? <StockAnalysis symbol={arg} />
        : current.path === 'makro' ? <Macro />
        : current.path === '' ? <Outlook practical={s.rows.length || s.advices.length ? <Overview s={s} /> : undefined} />
        : !s.rows.length && !s.advices.length
        ? <p className="an-answer" aria-live="polite">{s.error ?? 'Fiyatlar alınıyor…'}</p>
        : current.path === 'urunler' ? <Products s={s} />
          : current.path === 'maliyet' ? <Where s={s} />
            : current.path === 'birikim' ? <Savings s={s} />
              : current.path === 'para-arzi' ? <Money s={s} />
                : <Overview s={s} />}
      <p className="an-foot">
        <button className="btn ghost small" onClick={() => void refreshPremiums()} disabled={s.loading}><Icon name="refresh" className={s.loading ? 'spin' : undefined} />Yenile</button>
        <span>{s.time ? `${Fmt.time(s.time)} itibarıyla. ` : ''}Piyasa yatırım tavsiyesi vermez; bunlar geçmiş verilere dayalı göstergelerdir.</span>
      </p>
    </div>
  )
}

/** Sayfa başı: soru küçük, cevap büyük. */
function Question({ q, children }: { q: string; children: ReactNode }) {
  return (
    <header className="an-head">
      <h2>{q}</h2>
      <p className="an-answer" aria-live="polite">{children}</p>
    </header>
  )
}

function How({ children, term }: { children: ReactNode; term?: string }) {
  return (
    <details className="an-how">
      <summary>Nasıl hesaplanıyor, nelere dikkat etmeli</summary>
      <ul>{children}</ul>
      {term && <p><a href={href('sozluk/' + term)}>Sözlükte ayrıntısı</a></p>}
    </details>
  )
}

// ------------------------------------------------------------------ özet

function Overview({ s }: { s: PremiumState }) {
  const buys = s.rows.filter((r) => r.signal === 'buy')
  const nearest = [...s.rows].filter((r) => r.premium != null).sort((a, b) => a.premium! - b.premium!)[0]
  const cert = s.rows.find((r) => r.pair.symbol === 'BIST:ALTIN')?.premium
  const gold = bestRoute('gold', s.banks, cert), silver = bestRoute('silver', s.banks, cert)
  const adv = (id: Advice['id']) => [...s.advices, ...s.money].find((a) => a.id === id)
  const strong = [...s.advices, ...s.money].filter((a) => a.strength === 'strong').length + (s.open ? buys.length : 0)
  const A = ({ q, id, to }: { q: string; id: Advice['id']; to: string }) => {
    const a = adv(id)
    return a ? <Row q={q} to={to} strong={a.strength === 'strong'} note={a.strength === 'strong' ? 'güçlü sinyal' : 'zayıf sinyal'}>{a.action}</Row> : null
  }
  return (
    <>
      <section className="an-group ov-practical">
        <h3>Pratik sorular: {strong ? `bugün ${strong} güçlü sinyal var` : 'bugün güçlü bir sinyal yok'}</h3>
        <p className="note">Her sorunun cevabı tek satırda; güçlü sinyaller işaretli. Gerekçesi için satıra dokun.</p>
      </section>

      <section className="an-group">
        <h3>Altın ve gümüş ürünleri</h3>
        <Row q="Değerinin altında işlem gören var mı?" to="urunler" strong={s.open && buys.length > 0}
          note={!s.open ? 'BIST kapalı' : buys.length ? 'al sinyali' : nearest ? `en yakını ${nearest.pair.code} (${pct(nearest.premium)})` : undefined}>
          {!s.open ? 'Sinyal seans içinde verilir' : buys.length ? buys.map((r) => r.pair.code).join(', ') : 'Şu an yok'}
        </Row>
        {gold && <Row q="Altını nereden almalı?" to="maliyet" note={`masraf ${pct0(gold.costRate)}`}>{gold.route.name}</Row>}
        {silver && <Row q="Gümüşü nereden almalı?" to="maliyet" note={`masraf ${pct0(silver.costRate)}`}>{silver.route.name}</Row>}
      </section>

      <section className="an-group">
        <h3>Hisse</h3>
        <Row q="Bir hissede geçmişte tutmuş dip ya da tepe sinyali var mı?" to="hisse">Hisse seç, geçmişi taransın</Row>
      </section>

      {s.advices.length > 0 && (
        <section className="an-group">
          <h3>Birikim</h3>
          <A q="Altınım var; ev alayım mı?" id="home-gold" to="birikim" />
          <A q="Dolarım var; ev alayım mı?" id="home-usd" to="birikim" />
          <A q="Altın mı, gümüş mü?" id="gold-silver" to="birikim" />
        </section>
      )}

      {s.money.length > 0 && (
        <section className="an-group">
          <h3>Para arzına göre</h3>
          <A q="Dolar" id="m2-usdtry" to="para-arzi" />
          <A q="Ons altın" id="m2-gold-usd" to="para-arzi" />
          <A q="Gram altın" id="m2-gold-try" to="para-arzi" />
          <A q="BIST 100" id="m2-bist" to="para-arzi" />
          <A q="Ev" id="m2-home" to="para-arzi" />
        </section>
      )}
    </>
  )
}

/** Özet satırı: soru → cevap. Güçlü sinyaller işaretli. */
function Row({ q, to, note, strong, children }: { q: string; to: string; note?: string; strong?: boolean; children: ReactNode }) {
  return (
    <a className={'an-row' + (strong ? ' strong' : '')} href={href('analiz/' + to)}>
      <span className="q">{q}</span>
      <span className="a">{children}</span>
      {note && <span className="n">{note}</span>}
      <Icon name="chevron" />
    </a>
  )
}

// ------------------------------------------------------------------ ürünler

function Products({ s }: { s: PremiumState }) {
  const buys = s.rows.filter((r) => r.signal === 'buy')
  const gold = s.rows.find((r) => r.pair.metal === 'GOLD')?.gram, silver = s.rows.find((r) => r.pair.metal === 'SILVER')?.gram
  return (
    <>
      <Question q="Altın ve gümüş ürünleri değerinin altında mı?">
        {!s.open ? 'BIST şu an kapalı; sinyal seans içinde verilir.'
          : buys.length ? <><b>{buys.map((r) => r.pair.code).join(', ')}</b> {buys.length === 1 ? 'içindeki madenin değerinin altında' : 'içlerindeki madenin değerinin altında'}.</>
            : 'Şu an değerinin altında işlem gören yok.'}
      </Question>
      <p className="an-sub">
        Borsadaki altın ve gümüş ürünleri, içlerindeki madenin değerinden pahalıya (primli) ya da ucuza (iskontolu) işlem görebilir.
        {gold ? ` Gram altın ${tl(gold, 0)}` : ''}{silver ? `, gram gümüş ${tl(silver)}.` : ''}
        {!s.open && ' Aşağıdaki farklar son kapanışa göredir; maden fiyatı o zamandan beri değişti.'}
      </p>
      <p className="st-alarm"><a className="btn small" href={href('alarmlar', { tur: 'avantaj' })}><Icon name="bell" />Al sinyali gelince haber ver</a></p>
      {s.error && <p className="note" style={{ color: 'var(--down)' }}>{s.error}; son bilinen değerler gösteriliyor.</p>}

      <table className="result-table prem-table">
        <thead><tr><th>Ürün</th><th className="r">Fiyat</th><th className="r hide-s">İçindeki değer</th><th className="r">Fark</th><th className="r">Durum</th></tr></thead>
        <tbody>
          {s.rows.map((r) => (
            <tr key={r.pair.symbol} className={s.open && r.signal === 'buy' ? 'is-buy' : undefined}>
              <td>
                <a href={chartUrl(r.pair.symbol)} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                  <span className="n">{r.pair.code}</span><span className="s">{r.pair.name}</span>
                </a>
              </td>
              <td className="r num" style={{ fontWeight: 600 }}>{tl(r.price)}</td>
              <td className="r num hide-s">{tl(r.fair)}<span className="s">{content(r)}</span></td>
              <td className={'r num ' + (r.premium == null ? '' : r.premium <= 0 ? 'pos' : '')} style={{ fontWeight: 600 }}>
                {pct(r.premium)}<span className="s">{r.basis === 'fixed' ? METALS[r.pair.metal].label + 'a göre' : 'olağan düzeyine göre'}</span>
              </td>
              <td className="r"><Status row={r} open={s.open} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <How term="prim-iskonto">
        <li><b>Gram fiyatı</b> = ons fiyatı ($) × Dolar/TL ÷ 31,1035. Ons ve kur anlıktır; BIST fiyatları 15 dakika gecikmelidir.</li>
        <li><b>ALTIN.S1</b> her zaman 0,01 gram altındır; fark doğrudan gram altına göredir. Sertifika çoğu zaman primlidir (son 2,5 yılda ortanca +%10); gram altının altına indiği günler seyrektir (günlerin yaklaşık %6’sı) ve <b>al sinyali</b> bu durumda verilir.</li>
        <li><b>Fonlarda</b> (GLDTR, ZGOLD, ISGLK, GMSTR) bir payın karşılığı olan maden miktarı sabit değildir: GMSTR’nin bir payı 1 gram değil, yaklaşık 6 gram gümüşe denktir ve bu miktar yılda yaklaşık %2 azalır. “Olağan” miktar son {TYPICAL_DAYS} işlem gününün ortancasıdır. Fon bunun en az %{Math.abs(FUND_BUY * 100)} altına indiğinde <b>al sinyali</b>, en az %2 üstüne çıktığında “pahalı” yazar.</li>
        <li>Sinyal, ürünün madene göre ucuzladığını söyler; madenin kendisinin yükseleceğini söylemez.</li>
        <li>Geçmişte bu sinyallerden sonraki 1 ayda ürünler madene göre ortalama 1–3 puan daha iyi getirdi (GMSTR’de 3 puan, altın fonlarında 0,5–1,3 puan; ISGLK’de fark görülmedi). Ölçüm günlük kapanışlarla yapıldı; BIST ile maden piyasasının kapanış saatleri farklı olduğu için sonuç olduğundan iyi görünebilir.</li>
        <li>BIST kapalıyken sinyal verilmez. Resmî tatiller bilinmediği için tatil günlerinde fark yanıltıcı olabilir.</li>
      </How>
    </>
  )
}

const content = (r: PremiumRow) =>
  r.grams == null ? 'geçmiş verisi bekleniyor' : `${r.basis === 'fixed' ? '' : '≈ '}${Fmt.number(r.grams, r.grams < 1 ? 4 : 2).replace(/0+$/, '').replace(/,$/, '')} ${METALS[r.pair.metal].unit}`

function Status({ row, open }: { row: PremiumRow; open: boolean }) {
  if (row.signal === 'unknown') return <span className="prem-st">{row.price == null ? 'Fiyat yok' : 'Bilinmiyor'}</span>
  if (!open) return <span className="prem-st">BIST kapalı</span>
  if (row.signal === 'buy') return <span className="prem-st buy">Al sinyali</span>
  if (row.signal === 'high') return <span className="prem-st high">Pahalı</span>
  return <span className="prem-st">{row.basis === 'fixed' ? 'Primli' : 'Olağan'}</span>
}

// ------------------------------------------------------------------ nereden almalı

function Where({ s }: { s: PremiumState }) {
  return <CostCompare banks={s.banks} certPremium={s.rows.find((r) => r.pair.symbol === 'BIST:ALTIN')?.premium} />
}

// ------------------------------------------------------------------ birikim ve para arzı

function Savings({ s }: { s: PremiumState }) {
  const strong = s.advices.filter((a) => a.strength === 'strong')
  return (
    <>
      <Question q="Birikimimi neye çevirmeliyim?">
        {strong.length ? <>{strong.map((a) => a.action).join('. ')}.</> : 'Şu an güçlü bir sinyal yok; oranlar olağan aralıkta.'}
      </Question>
      <p className="an-sub">Her oran kendi geçmiş ortancasıyla karşılaştırılır. Ortancadan uzaklaştıkça sinyal güçlenir.</p>
      <div className="vd-list">{s.advices.map((a) => <Verdict key={a.id} a={a} />)}</div>
      <How term="ev-altin">
        <li><b>Ev mi, altın mı (dolar mı)?</b> Konut fiyat endeksi (TCMB, TRHPI) gram altına ya da Dolar/TL’ye bölünür: evin altın ya da dolar cinsinden fiyatı. Bugünkü değer, endeksin başladığı 2010’dan bu yanaki aylık ortancayla karşılaştırılır. Ortancanın altındaysa ev ucuzdur (“boz, ev al”), üstündeyse pahalıdır (“biriktir”).</li>
        <li>İki öneri ters çıkabilir: altın dolar bazında çok yükseldiyse aynı ev az gram altın ama çok dolar eder.</li>
        <li>Konut endeksi yaklaşık iki ay gecikmeyle açıklanır ve Türkiye ortalamasıdır; şehir, semt ve tek tek evler çok farklı olabilir. Son değer, son 3 ayın artış hızıyla bugüne taşınır. Öneri alım masraflarını, kirayı ve kredi faizini hesaba katmaz.</li>
        <li><b>Altın mı, gümüş mü?</b> Rasyo = ons altın ÷ ons gümüş. Son 20 yılın aylık ortancasının üstündeyse gümüş altına göre ucuzdur (“altın sat, gümüş al”), altındaysa altın ucuzdur. Yalnızca son 10 yıla bakılsaydı ortanca daha yüksek çıkardı; dönem seçimi sonucu etkiler.</li>
        <li>En düşük ya da en yüksek %25’lik dilimde sinyal güçlüdür. Oranlar yıllarca ortancadan uzak kalabilir; öneri bir zamanlama garantisi değildir.</li>
      </How>
    </>
  )
}

function Money({ s }: { s: PremiumState }) {
  const cheap = s.money.filter((a) => a.cheap).map((a) => a.subject!), dear = s.money.filter((a) => !a.cheap).map((a) => a.subject!)
  const list = (x: string[]) => x.join(', ')
  return (
    <>
      <Question q="Para arzına göre ne ucuz, ne pahalı?">
        {!s.money.length ? 'Para arzı verisi alınamadı.'
          : <>{cheap.length ? <><b>Ucuz:</b> {list(cheap)}. </> : ''}{dear.length ? <><b>Pahalı:</b> {list(dear)}.</> : ''}</>}
      </Question>
      <p className="an-sub">Para basıldıkça fiyatların da artması beklenir. Her fiyat ilgili para arzına (M2) bölünür ve kendi geçmiş ortancasıyla karşılaştırılır: ortancanın üstündeyse fiyat, basılan paradan hızlı artmıştır.</p>
      <div className="vd-list">{s.money.map((a) => <Verdict key={a.id} a={a} />)}</div>
      <How term="para-arzi">
        <li><b>M2</b>, dolaşımdaki para ile vadesiz ve vadeli mevduatın toplamıdır.</li>
        <li><b>Dolar</b> için Türkiye M2’si ABD M2’sine bölünür (TL arzı dolar arzından ne kadar hızlı büyüdü) ve Dolar/TL bu orana bölünür. “Dolar sat” doların pahalı, TL’nin ucuz olduğu anlamına gelir.</li>
        <li><b>Ons altın</b> ABD M2’sine; <b>gram altın, BIST 100 ve konut endeksi</b> Türkiye M2’sine bölünür.</li>
        <li>Geçmiş, Türkiye verisinin başladığı Aralık 2005’ten (ons altında 1993’ten, evde 2010’dan) bu yanadır.</li>
        <li>Türkiye M2’si döviz mevduatını da TL karşılığıyla içerir; kur yükselince M2 de büyür. Bu yüzden dolar ve altın bu ölçüyle olduğundan biraz ucuz görünür.</li>
        <li>Para arzı gecikmeli açıklanır; son değer bugüne taşınır.</li>
        <li>Bu bir değerleme göstergesidir, zamanlama sinyali değildir: oranlar yıllarca ortancadan uzak kalabilir. Birikim sayfasındaki önerilerle farklı çıkabilir, çünkü farklı şeyi ölçer.</li>
      </How>
    </>
  )
}

/**
 * Tek bir değerlendirme: solda konu ve cevap, sağda geçmiş aralıktaki yeri. Gerekçe bir cümle; dipnotlar küçük.
 * Çubuk: açık zemin geçmişin en düşüğü–en yükseği, koyu bant orta %50, çizgi ortanca, nokta bugün.
 */
function Verdict({ a }: { a: Advice }) {
  const money = a.subject != null
  const home = !money && a.id !== 'gold-silver'
  const what = a.id === 'home-gold' ? 'altın' : 'dolar'
  const pos = (v: number) => Math.max(0, Math.min(100, ((v - a.min) / (a.max - a.min || 1)) * 100))
  const subj = money ? (a.subject!.startsWith('BIST') ? a.subject! : a.subject!.toLocaleLowerCase('tr-TR')) : ''
  return (
    <article className={'vd ' + (a.strength === 'strong' ? 'strong' : 'weak')}>
      <div className="vd-main">
        <h3>{money ? `${a.subject}, ${a.basis}` : a.title}</h3>
        <p className="adv-act vd-act">{a.action}<span className="vd-str">{a.strength === 'strong' ? 'Güçlü sinyal' : 'Zayıf sinyal'}</span></p>
        <p className="vd-why">
          {money
            ? <>Uzun dönem ortancasının <b className="num">{pct0(a.vsMedian)}</b> {a.vsMedian < 0 ? 'altında' : 'üstünde'}: {subj} {a.cheap ? 'ucuz' : 'pahalı'}{a.id === 'm2-usdtry' ? (a.cheap ? ', TL pahalı' : ', TL ucuz') : ''}.</>
            : home
              ? <>Ev, {what} cinsinden uzun dönem ortancasının <b className="num">{pct0(a.vsMedian)}</b> {a.vsMedian < 0 ? 'altında' : 'üstünde'}.</>
              : <>1 ons altın <b className="num">{Fmt.number(a.value, 1)}</b> ons gümüş ediyor; son 20 yılın ortancası <b className="num">{Fmt.number(a.median, 1)}</b>.</>}
        </p>
      </div>
      <div className="vd-range">
        <div className="vd-bar" role="img" aria-label={`Bugünkü oran geçmiş aralığın yüzde ${Math.round(a.percentile * 100)} diliminde`}>
          <span className="band" style={{ left: `${pos(a.p25)}%`, width: `${pos(a.p75) - pos(a.p25)}%` }} />
          <span className="med" style={{ left: `${pos(a.median)}%` }} />
          <span className="now" style={{ left: `${pos(a.value)}%` }} />
        </div>
        <div className="vd-ends">
          <span>{money ? 'ucuz' : home ? 'ev ucuz' : `altın ucuz (${Fmt.number(a.min, 0)})`}</span>
          <span>{money ? 'pahalı' : home ? 'ev pahalı' : `gümüş ucuz (${Fmt.number(a.max, 0)})`}</span>
        </div>
        <p className="vd-note">
          Geçmişte bugünkünden {a.cheap ? 'pahalı' : 'ucuz'} olduğu ayların oranı {pct0(a.cheap ? 1 - a.percentile : a.percentile)} ({monthLabel(a.since)} sonrası {a.months} ay).
          {a.m2Month != null && <> Para arzı en son {monthLabel(a.m2Month)} için açıklandı.</>}
          {a.hpiMonth != null && <> Konut endeksi en son {monthLabel(a.hpiMonth)} için açıklandı{a.hpiGap ? `; ${a.hpiGap} aylık artış tahminle eklendi` : ''}.</>}
        </p>
      </div>
    </article>
  )
}
