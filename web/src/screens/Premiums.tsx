import { monthLabel, type Advice } from '../core/advice'
import * as Fmt from '../core/format'
import { FUND_BUY, METALS, TYPICAL_DAYS, type PremiumRow } from '../core/premium'
import { chartUrl } from '../core/tradingview'
import { refreshPremiums, usePremiums } from '../data/premium'
import { Icon } from '../ui/Icon'

const pct = (v?: number) => (v == null ? '—' : (v > 0.00005 ? '+' : v < -0.00005 ? '−' : '') + '%' + Fmt.number(Math.abs(v * 100), 1))
const tl = (v?: number, d = 2) => (v == null ? '—' : Fmt.number(v, d) + ' ₺')

/** Avantajlı fiyatlar: altın ve gümüş ürünleri içlerindeki madenin değerine göre nerede? */
export function Premiums() {
  const s = usePremiums()
  const buys = s.rows.filter((r) => r.signal === 'buy')
  const gold = s.rows.find((r) => r.pair.metal === 'GOLD')?.gram
  const silver = s.rows.find((r) => r.pair.metal === 'SILVER')?.gram
  return (
    <div className="prem">
      <p className="lede">
        Altın ve gümüşe dayalı borsa ürünleri, içlerindeki madenin değerinden pahalıya (primli) ya da ucuza (iskontolu) işlem görebilir.
        Bu liste farkı canlı izler ve ürün değerinin altına indiğinde işaretler.
      </p>
      <p className="prem-lead" aria-live="polite">
        {!s.rows.length ? (s.error ?? 'Fiyatlar alınıyor…')
          : !s.open ? 'BIST şu an kapalı. Aşağıdaki farklar son kapanış fiyatına göredir; maden fiyatı o zamandan beri değiştiği için sinyal verilmez.'
            : buys.length ? <><b>{buys.map((r) => r.pair.code).join(', ')}</b> {buys.length === 1 ? 'içindeki değerin altında' : 'içlerindeki değerin altında'}: al sinyali.</>
              : 'Şu an değerinin altında işlem gören yok.'}
      </p>
      <div className="detail-actions" style={{ margin: '10px 0 4px' }}>
        <button className="btn" onClick={() => void refreshPremiums()} disabled={s.loading}><Icon name="refresh" className={s.loading ? 'spin' : undefined} />Yenile</button>
        <span className="note" style={{ margin: 0 }}>
          {s.time ? `${Fmt.time(s.time)} itibarıyla` : ''}{gold ? `, gram altın ${tl(gold, 0)}` : ''}{silver ? `, gram gümüş ${tl(silver)}` : ''}
        </span>
      </div>
      {s.error && s.rows.length > 0 && <p className="note" style={{ color: 'var(--down)' }}>{s.error}; son bilinen değerler gösteriliyor.</p>}

      {s.rows.length > 0 && (
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
      )}

      {s.advices.length > 0 && (
        <section className="bt-sect">
          <h2>Birikim önerileri</h2>
          <p className="note" style={{ marginTop: -4 }}>Bugünkü oran, kendi geçmişinin ortancasıyla karşılaştırılır. Ortancadan uzaklaştıkça sinyal güçlenir.</p>
          <div className="adv-list">{s.advices.map((a) => <AdviceCard key={a.id} a={a} />)}</div>
        </section>
      )}

      <details className="bt-how" style={{ marginTop: 18 }}>
        <summary>Nasıl hesaplanıyor, nelere dikkat etmeli</summary>
        <ul>
          <li><b>Gram fiyatı</b> = ons fiyatı ($) × Dolar/TL ÷ 31,1035. Ons ve kur anlıktır; BIST fiyatları 15 dakika gecikmelidir.</li>
          <li><b>ALTIN.S1</b> her zaman 0,01 gram altındır. İçindeki değer = gram altın × 0,01; fark doğrudan buna göredir. Sertifika çoğu zaman primlidir (son 2,5 yılda ortanca +%10); gram altının altına indiği günler seyrektir (günlerin yaklaşık %6’sı) ve <b>al sinyali</b> bu durumda verilir.</li>
          <li><b>Fonlarda</b> (GLDTR, ZGOLD, ISGLK, GMSTR) bir payın karşılığı olan maden miktarı sabit değildir: GMSTR’nin bir payı 1 gram değil, bugün yaklaşık 6 gram gümüşe denktir ve yönetim ücreti nedeniyle bu miktar yılda yaklaşık %2 azalır. Bu yüzden “olağan” miktar son {TYPICAL_DAYS} işlem gününün ortancasından bulunur; fark bu düzeye göredir. Fon olağan düzeyinin en az %{Math.abs(FUND_BUY * 100)} altına indiğinde <b>al sinyali</b>, en az %2 üstüne çıktığında “pahalı” yazar.</li>
          <li>Sinyal, ürünün madene göre ucuzladığını söyler; madenin kendisinin yükseleceğini söylemez. Altın düşerse iskontolu alınan ürün de düşer.</li>
          <li>Geçmişte bu sinyallerden sonraki 1 ayda ürünler madene göre ortalama 1–3 puan daha iyi getirdi (GMSTR’de 3 puan, altın fonlarında 0,5–1,3 puan; ISGLK’de fark görülmedi). Bu ölçüm günlük kapanışlarla yapıldı; BIST ile maden piyasasının kapanış saatleri farklı olduğu için sonuç olduğundan iyi görünebilir.</li>
          <li><b>Ev mi, altın mı (dolar mı)?</b> Konut fiyat endeksi (TCMB, TRHPI) gram altına ya da Dolar/TL’ye bölünür: evin altın ya da dolar cinsinden fiyatı. Bugünkü değer, endeksin başladığı 2010’dan bu yanaki aylık ortancayla karşılaştırılır. Ortancanın altındaysa ev ucuzdur (“boz, ev al”), üstündeyse pahalıdır (“biriktir”). En düşük ya da en yüksek %25’lik dilimdeyse sinyal güçlüdür.</li>
          <li>Konut endeksi yaklaşık iki ay gecikmeyle açıklanır ve Türkiye ortalamasıdır; şehir, semt ve tek tek evler çok farklı olabilir. Son değer, son 3 ayın artış hızıyla bugüne taşınır. Öneri, alım masraflarını, kirayı ve kredi faizini hesaba katmaz.</li>
          <li><b>Altın mı, gümüş mü?</b> Rasyo = ons altın ÷ ons gümüş. Son 20 yılın aylık ortancasının üstündeyse gümüş altına göre ucuzdur (“altın sat, gümüş al”), altındaysa altın ucuzdur. Rasyo yıllarca ortancadan uzak kalabilir; öneri bir zamanlama garantisi değildir.</li>
          <li>BIST kapalıyken sinyal verilmez. Resmî tatiller bilinmediği için tatil günlerinde fark yanıltıcı olabilir. Alım satımda aracı kurum komisyonu ve alış-satış farkı da hesaba katılmalıdır.</li>
        </ul>
      </details>
    </div>
  )
}

const pct0 = (v: number) => '%' + Fmt.number(Math.abs(v * 100), 0)

function AdviceCard({ a }: { a: Advice }) {
  const home = a.id !== 'gold-silver'
  const what = a.id === 'home-gold' ? 'altın' : 'dolar'
  // Çubuk: geçmişin en düşüğü–en yükseği; koyu bant orta %50, çizgi ortanca, nokta bugün
  const pos = (v: number) => Math.max(0, Math.min(100, ((v - a.min) / (a.max - a.min || 1)) * 100))
  return (
    <article className={'adv ' + (a.strength === 'strong' ? 'strong' : 'weak')}>
      <h3>{a.title}</h3>
      <p className="adv-act">{a.action}<span className="adv-str">{a.strength === 'strong' ? 'Güçlü sinyal' : 'Zayıf sinyal'}</span></p>
      <p className="adv-why">
        {home
          ? <>Ev, {what} cinsinden uzun dönem ortancasının <b className="num">{pct0(a.vsMedian)}</b> {a.vsMedian < 0 ? 'altında' : 'üstünde'}. Geçmişte bugünkünden {a.cheap ? 'pahalı' : 'ucuz'} olduğu ayların oranı <b className="num">{pct0(a.cheap ? 1 - a.percentile : a.percentile)}</b>.</>
          : <>1 ons altın <b className="num">{Fmt.number(a.value, 1)}</b> ons gümüş ediyor; son 20 yılın ortancası <b className="num">{Fmt.number(a.median, 1)}</b>. Rasyo {a.cheap ? 'düşükken altın gümüşe' : 'yüksekken gümüş altına'} göre ucuzdur.</>}
      </p>
      <div className="adv-bar" role="img" aria-label={`Bugünkü oran geçmiş aralığın yüzde ${Math.round(a.percentile * 100)} diliminde`}>
        <span className="band" style={{ left: `${pos(a.p25)}%`, width: `${pos(a.p75) - pos(a.p25)}%` }} />
        <span className="med" style={{ left: `${pos(a.median)}%` }} />
        <span className="now" style={{ left: `${pos(a.value)}%` }} />
      </div>
      <div className="adv-ends">
        <span>{home ? 'ev ucuz' : `altın ucuz (${Fmt.number(a.min, 0)})`}</span>
        <span>{home ? 'ev pahalı' : `gümüş ucuz (${Fmt.number(a.max, 0)})`}</span>
      </div>
      <p className="adv-note">
        {monthLabel(a.since)} sonrası {a.months} ay.
        {a.hpiMonth != null && <> Konut endeksi en son {monthLabel(a.hpiMonth)} için açıklandı{a.hpiGap ? `; ${a.hpiGap} aylık artış tahminle eklendi` : ''}.</>}
      </p>
    </article>
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
