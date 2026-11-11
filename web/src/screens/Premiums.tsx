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

      <details className="bt-how" style={{ marginTop: 18 }}>
        <summary>Nasıl hesaplanıyor, nelere dikkat etmeli</summary>
        <ul>
          <li><b>Gram fiyatı</b> = ons fiyatı ($) × Dolar/TL ÷ 31,1035. Ons ve kur anlıktır; BIST fiyatları 15 dakika gecikmelidir.</li>
          <li><b>ALTIN.S1</b> her zaman 0,01 gram altındır. İçindeki değer = gram altın × 0,01; fark doğrudan buna göredir. Sertifika çoğu zaman primlidir (son 2,5 yılda ortanca +%10); gram altının altına indiği günler seyrektir (günlerin yaklaşık %6’sı) ve <b>al sinyali</b> bu durumda verilir.</li>
          <li><b>Fonlarda</b> (GLDTR, ZGOLD, ISGLK, GMSTR) bir payın karşılığı olan maden miktarı sabit değildir: GMSTR’nin bir payı 1 gram değil, bugün yaklaşık 6 gram gümüşe denktir ve yönetim ücreti nedeniyle bu miktar yılda yaklaşık %2 azalır. Bu yüzden “olağan” miktar son {TYPICAL_DAYS} işlem gününün ortancasından bulunur; fark bu düzeye göredir. Fon olağan düzeyinin en az %{Math.abs(FUND_BUY * 100)} altına indiğinde <b>al sinyali</b>, en az %2 üstüne çıktığında “pahalı” yazar.</li>
          <li>Sinyal, ürünün madene göre ucuzladığını söyler; madenin kendisinin yükseleceğini söylemez. Altın düşerse iskontolu alınan ürün de düşer.</li>
          <li>Geçmişte bu sinyallerden sonraki 1 ayda ürünler madene göre ortalama 1–3 puan daha iyi getirdi (GMSTR’de 3 puan, altın fonlarında 0,5–1,3 puan; ISGLK’de fark görülmedi). Bu ölçüm günlük kapanışlarla yapıldı; BIST ile maden piyasasının kapanış saatleri farklı olduğu için sonuç olduğundan iyi görünebilir.</li>
          <li>BIST kapalıyken sinyal verilmez. Resmî tatiller bilinmediği için tatil günlerinde fark yanıltıcı olabilir. Alım satımda aracı kurum komisyonu ve alış-satış farkı da hesaba katılmalıdır.</li>
        </ul>
      </details>
    </div>
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
