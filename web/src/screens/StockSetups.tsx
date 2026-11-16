/**
 * Güçlü kurulumlar: pazardaki tüm hisselerde, üç ayrı dönemde sınanmış az sayıda dip/tepe kurulumu ve
 * seçilen hissenin şu an bunlara göre durumu.
 */
import * as Fmt from '../core/format'
import { HORIZON, INDEX_NAME, PERIOD_LABELS, REGIME_LABEL, SETUPS, STRONG, type SetupNow } from '../core/setups'
import type { SetupData } from '../data/bars'
import { Icon } from '../ui/Icon'
import { href } from '../ui/router'
import { EventChart } from '../ui/SignalChart'

const pct = (v?: number, d = 1) => (v == null ? '—' : (v > 0.00005 ? '+' : v < -0.00005 ? '−' : '') + '%' + Fmt.number(Math.abs(v * 100), d))
const p0 = (v: number) => '%' + Fmt.number(v * 100, 0)
const price = (v: number) => Fmt.number(v, v >= 1000 ? 0 : v >= 10 ? 2 : 4)
const MARKET = { TR: 'BIST', US: 'ABD' } as const
const moved = (s: SetupNow) => (s.setup.side === 'dip' ? 'yukarıdaydı' : 'aşağıdaydı')

/** Sayfa başı: güçlü kurulumlara göre cevap ve tek cümlelik gerekçe */
export function setupHeadline(d: SetupData): { answer: string; sub: string } {
  const strong = d.list.filter((s) => s.strength?.strong)
  const market = MARKET[d.market]
  if (!strong.length) return {
    answer: `${market} hisselerinde güvenilirliği kanıtlanmış bir kurulum yok.`,
    sub: `${SETUPS.length} dip ve tepe kurulumu ${Fmt.number(d.stocks, 0)} ${market} hissesinde üç ayrı dönemde sınandı; hiçbiri üç dönemin üçünde de olağandan belirgin biçimde iyi sonuç vermedi. Aşağıda her kurulumun dönem dönem sonucu ve bu hissenin şu anki durumu var; bunlar güvenilir sinyal değildir.`,
  }
  const lead = d.lead
  if (lead?.active) {
    const st = lead.strength!
    return {
      answer: `Güçlü ${lead.setup.side === 'dip' ? 'dip' : 'tepe'} kurulumu oluştu.`,
      sub: `${lead.setup.label}, ${REGIME_LABEL[lead.regime]}. ${market} hisselerinde bu durum ${Fmt.number(st.n, 0)} kez sınandı: 3 ay sonra fiyat, üç dönemin en kötüsünde bile ${p0(st.hit)} ${moved(lead)} (aynı dönemin olağanı ${p0(st.base)}).`,
    }
  }
  if (lead?.distance != null) return {
    answer: `Güçlü kuruluma ${pct(Math.abs(lead.distance)).replace('+', '')} var.`,
    sub: `En yakın güçlü kurulum: “${lead.setup.label}”, ${REGIME_LABEL[lead.regime]}. Geçmişte 3 ay sonra en kötü dönemde bile ${p0(lead.strength!.hit)} ${moved(lead)} (olağan ${p0(lead.strength!.base)}).`,
  }
  const here = strong.filter((s) => s.regimeOk)
  return {
    answer: 'Şu an güçlü bir kurulum yok.',
    sub: here.length ? 'Bu hisse, güçlü kurulumların hiçbirine yakın değil. Koşullar ve uzaklıklar aşağıda.' : `Güçlü kurulumlar şu anki piyasa durumunda geçerli değil (${INDEX_NAME[d.market]} 200 günlük ortalamasının ${d.regimeNow ? 'üstünde' : 'altında'}).`,
  }
}

export function SetupsView({ d, symbol }: { d: SetupData; symbol: string }) {
  const strong = d.list.filter((s) => s.strength?.strong)
  // Güçlüler: önce açık olanlar, sonra bugünkü piyasa durumuna uyanlar
  const order = (s: SetupNow) => (s.active ? 0 : s.regimeOk ? 1 : 2)
  const shown = [...strong].sort((a, b) => order(a) - order(b) || (b.strength!.hit - b.strength!.base) - (a.strength!.hit - a.strength!.base))
  const rest = d.list.filter((s) => !s.strength?.strong && s.evidence)
  const anyActive = strong.some((s) => s.active)
  return (
    <>
      <p className="st-alarm">
        {strong.length > 0 && <a className="btn small" href={href('alarmlar', { tur: 'sinyal', s: symbol })}><Icon name="bell" />{anyActive ? 'Yeni kurulum oluşunca haber ver' : 'Güçlü kurulum oluşunca haber ver'}</a>}
        <a className="btn ghost small" href={href('alarmlar', { tur: 'fiyat', s: symbol })}>Fiyat alarmı kur</a>
      </p>
      {d.regimeNow != null && <p className="st-regime">Piyasa durumu: {INDEX_NAME[d.market]} 200 günlük ortalamasının <b>{d.regimeNow ? 'üstünde' : 'altında'}</b>.</p>}

      {shown.length > 0 && (
        <section className="an-group">
          <h3>Güçlü kurulumlar ({MARKET[d.market]} hisselerinde üç dönemde de tutmuş)</h3>
          <div className="vd-list">{shown.map((s) => <SetupBlock key={s.setup.id + s.regime} s={s} d={d} />)}</div>
        </section>
      )}

      {rest.length > 0 && (
        <details className="an-how st-frame">
          <summary>{strong.length ? 'Güçlü sayılmayan kurulumlar' : 'Sınanan kurulumlar'} ve dönem dönem sonuçları ({rest.length})</summary>
          <table className="result-table st-table">
            <thead><tr><th>Kurulum</th>{PERIOD_LABELS.map((p) => <th key={p} className="r hide-s">{p}</th>)}<th className="r">Bu hissede şu an</th></tr></thead>
            <tbody>
              {rest.map((s) => (
                <tr key={s.setup.id + s.regime}>
                  <td><span className="n">{s.setup.label}</span><span className="s">{s.setup.side === 'dip' ? 'Dip' : 'Tepe'}; {REGIME_LABEL[s.regime]}. {s.strength?.reason ? 'Güçlü değil: ' + s.strength.reason + '.' : ''}</span></td>
                  {s.evidence!.periods.map((p, k) => <td key={k} className="r num hide-s">{p[0] ? p0(p[1]) : '—'}<span className="s">olağan {p0(p[2])}, {Fmt.number(p[0], 0)} kez</span></td>)}
                  <td className="r"><span className="prem-st">{s.active ? 'Oluştu' : s.stockOk ? 'Piyasa durumu uymuyor' : 'Yok'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </>
  )
}

function SetupBlock({ s, d }: { s: SetupNow; d: SetupData }) {
  const st = s.strength!
  const side = s.setup.side
  return (
    <article className={'st-sig' + (s.active ? ' strong' : '')}>
      <h3>{side === 'dip' ? 'Dip kurulumu' : 'Tepe kurulumu'}; {REGIME_LABEL[s.regime]}</h3>
      <p className="vd-act">{s.setup.label}<span className="vd-str">{s.active ? 'Şu an oluştu' : !s.regimeOk ? 'Piyasa durumu uymuyor' : 'Bekleniyor'}</span></p>
      <dl className="st-facts">
        <div><dt>3 ay sonra {side === 'dip' ? 'yukarıda' : 'aşağıda'} (en kötü dönem)</dt><dd className="num">{p0(st.hit)}<small>olağan {p0(st.base)}; toplam {Fmt.number(st.n, 0)} kez, {s.evidence!.stocks} hisse</small></dd></div>
        <div><dt>Bu hissede</dt><dd className="num">{s.ownDone ? `${s.ownHits} / ${s.ownDone}` : s.events.length ? `${s.events.length} kez` : 'hiç oluşmadı'}<small>{s.ownDone > 0 ? 'kez tuttu' : s.events.length ? 'sonucu bekleniyor' : ''}</small></dd></div>
        <div><dt>Şu an</dt><dd className="num">{s.active ? 'Oluştu' : s.distance != null && s.regimeOk ? <>{pct(s.distance)} uzakta</> : 'Uzak'}</dd></div>
      </dl>
      <Periods s={s} />
      <ul className="st-checks-list">
        {s.conds.map((c) => (
          <li key={c.label} className={c.ok ? 'ok' : 'no'}>
            <Icon name={c.ok ? 'check' : 'close'} label={c.ok ? 'Sağlanıyor' : 'Sağlanmıyor'} />
            <div><b>{c.label}</b><span>{c.now}{c.trigger != null ? `; sıradaki gün ${price(c.trigger)} ${side === 'dip' ? 'altında' : 'üstünde'} kapanırsa sağlanır (${pct(c.trigger / d.bars.c[d.bars.c.length - 1] - 1)})` : ''}.</span></div>
          </li>
        ))}
        {s.regime !== 'any' && (
          <li className={s.regimeOk ? 'ok' : 'no'}>
            <Icon name={s.regimeOk ? 'check' : 'close'} label={s.regimeOk ? 'Sağlanıyor' : 'Sağlanmıyor'} />
            <div><b>{INDEX_NAME[d.market]} 200 günlük ortalamasının {s.regime === 'bear' ? 'altında' : 'üstünde'}</b><span>şu an {d.regimeNow ? 'üstünde' : 'altında'}.</span></div>
          </li>
        )}
      </ul>
      {s.events.length > 0 && (
        <details className="an-how st-frame">
          <summary>Bu hissede oluştuğu {s.events.length} gün (grafik)</summary>
          <EventChart bars={d.bars} events={s.events} side={side} />
        </details>
      )}
    </article>
  )
}

/** Üç dönemin sonucu: nokta kurulumun isabeti, çentik aynı dönemin olağanı */
function Periods({ s }: { s: SetupNow }) {
  return (
    <div className="st-periods" role="img" aria-label={s.evidence!.periods.map((p, k) => `${PERIOD_LABELS[k]}: ${p0(p[1])}, olağan ${p0(p[2])}`).join('; ')}>
      {s.evidence!.periods.map((p, k) => (
        <div key={k}>
          <span className="lab">{PERIOD_LABELS[k]}</span>
          <span className="track"><i className="b" style={{ left: `${p[2] * 100}%` }} /><i className="h" style={{ left: `${p[1] * 100}%` }} /></span>
          <span className="val num"><b>{p0(p[1])}</b> olağan {p0(p[2])}<em>{Fmt.number(p[0], 0)} kez</em></span>
        </div>
      ))}
    </div>
  )
}

export function SetupsHow({ d }: { d: SetupData }) {
  return (
    <>
      <li><b>Neden kurulum?</b> Tek bir hissenin kendi geçmişi, bir sinyali güvenle sınamaya yetmiyor (hisse başına 10–30 örnek). Bu yüzden az sayıda, önceden tanımlı kurulum {MARKET[d.market]} pazarındaki {Fmt.number(d.stocks, 0)} hissenin tamamında sınanır: binlerce örnek.</li>
      <li><b>Kurulum</b> = hissenin durumu (günlük göstergeler) + piyasanın durumu ({INDEX_NAME[d.market]} 200 günlük ortalamasının neresinde). Sonuç {HORIZON} işlem günü (yaklaşık 3 ay) sonra ölçülür.</li>
      <li><b>Güçlü</b> sayılması için üç ayrı dönemin ({PERIOD_LABELS.join('; ')}) üçünde de: en az {STRONG.n} örnek, isabet aynı dönemin olağanından en az {STRONG.diff * 100} puan yüksek ve dipte en az %{STRONG.dipHit * 100}. Gösterilen isabet, üç dönemin en kötüsüdür.</li>
      <li><b>Olağan</b>: aynı piyasa durumundaki herhangi bir günden 3 ay sonra fiyatın yukarıda olma oranı. Piyasa düşüşteyken hisselerin çoğu zaten toparlanır; kurulumun değeri bu orana eklediği kadardır.</li>
      <li><b>Sınırları</b>: kurulumlar hisseye özgü bir üstünlük göstermez; sinyalden sonra hissenin endeksi geçme oranı yaklaşık yarı yarıyadır. Yakaladıkları şey, sert düşüşlerden sonra piyasanın toparlanmasıdır. Evren bugün işlem gören hisselerden oluşur (borsadan çıkanlar yok), bu oranları bir miktar iyimser gösterir.</li>
      <li>BIST’te hiçbir kurulum üç dönemin üçünde de tutmadı: 2020–2023’te çok iyi görünen dip kurulumları 2024’ten sonra olağanın altında kaldı. Tepe (satım) tarafında iki pazarda da güvenilir kurulum bulunamadı.</li>
    </>
  )
}
