/**
 * Güçlü kurulumlar: pazardaki tüm hisselerde, üç ayrı dönemde sınanmış az sayıda dip/tepe kurulumu ve
 * seçilen hissenin şu an bunlara göre durumu.
 */
import * as Fmt from '../core/format'
import { HORIZON, INDEX_NAME, PATH_DAYS, PERIOD_LABELS, REGIME_LABEL, SETUPS, STRONG, type Basis, type SetupEvidence, type SetupNow } from '../core/setups'
import type { SetupData } from '../data/bars'
import { Icon } from '../ui/Icon'
import { Segmented } from '../ui/overlay'
import { href } from '../ui/router'
import { EventChart, PathChart, StateChart } from '../ui/SignalChart'

const pct = (v?: number, d = 1) => (v == null ? '—' : (v > 0.00005 ? '+' : v < -0.00005 ? '−' : '') + '%' + Fmt.number(Math.abs(v * 100), d))
const p0 = (v: number) => '%' + Fmt.number(v * 100, 0)
const price = (v: number) => Fmt.number(v, v >= 1000 ? 0 : v >= 10 ? 2 : 4)
const MARKET = { TR: 'BIST', US: 'ABD' } as const
const moved = (s: SetupNow) => (s.setup.side === 'dip' ? 'yukarıdaydı' : 'aşağıdaydı')

/** Sayfa başı: güçlü kurulumlara göre cevap ve tek cümlelik gerekçe */
export function setupHeadline(d: SetupData): { answer: string; sub: string } {
  const strong = d.list.filter((s) => s.strength?.strong)
  const market = MARKET[d.market]
  const usd = d.basis === 'usd'
  if (!strong.length) return {
    answer: `${market} hisselerinde${usd ? ', dolar bazında da' : ''} güvenilirliği kanıtlanmış bir kurulum yok.`,
    sub: `${SETUPS.length} dip ve tepe kurulumu ${Fmt.number(d.stocks, 0)} ${market} hissesinde${usd ? ' dolar bazlı fiyatlarla' : ''} üç ayrı dönemde sınandı; hiçbiri üç dönemin üçünde de olağandan belirgin biçimde iyi sonuç vermedi. Aşağıda her kurulumun dönem dönem sonucu ve bu hissenin şu anki durumu var; bunlar güvenilir sinyal değildir.`,
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

export function SetupsView({ d, symbol, onBasis }: { d: SetupData; symbol: string; onBasis: (b: Basis) => void }) {
  const strong = d.list.filter((s) => s.strength?.strong)
  // Güçlüler: önce açık olanlar, sonra bugünkü piyasa durumuna uyanlar
  const order = (s: SetupNow) => (s.active ? 0 : s.regimeOk ? 1 : 2)
  const shown = [...strong].sort((a, b) => order(a) - order(b) || (b.strength!.hit - b.strength!.base) - (a.strength!.hit - a.strength!.base))
  // Güçlü olmayanlar: bugünkü piyasa durumuna uyanlar ve en zayıf dönemi en az kötü olanlar önce
  const weakest = (s: SetupNow) => Math.min(...s.evidence!.periods.map((p) => (p[0] >= STRONG.n ? p[1] - p[2] : -1)))
  const rest = d.list.filter((s) => !s.strength?.strong && s.evidence).sort((a, b) => Number(b.regimeOk) - Number(a.regimeOk) || weakest(b) - weakest(a))
  const anyActive = strong.some((s) => s.active)
  return (
    <>
      <p className="st-alarm">
        {strong.length > 0 && <a className="btn small" href={href('alarmlar', { tur: 'sinyal', s: symbol })}><Icon name="bell" />{anyActive ? 'Yeni kurulum oluşunca haber ver' : 'Güçlü kurulum oluşunca haber ver'}</a>}
        <a className="btn ghost small" href={href('alarmlar', { tur: 'fiyat', s: symbol })}>Fiyat alarmı kur</a>
      </p>
      {d.market === 'TR' && (
        <div className="st-basis">
          <Segmented value={d.basis} onChange={onBasis} label="Fiyat bazı" options={[{ value: 'usd', label: 'Dolar bazında' }, { value: 'try', label: 'TL bazında' }]} />
          <BasisNote d={d} />
        </div>
      )}
      {d.regimeNow != null && <p className="st-regime">Piyasa durumu: {INDEX_NAME[d.market]}{d.basis === 'usd' ? ' (dolar bazında)' : ''} 200 günlük ortalamasının <b>{d.regimeNow ? 'üstünde' : 'altında'}</b>.</p>}
      <StateChart c={d.ctx.c} t={d.ctx.t} sma200={d.ctx.s.sma200} rsi={d.ctx.s.rsi} vol={d.ctx.vol} unit={d.basis === 'usd' ? 'dolar bazında' : undefined} />

      {shown.length > 0 && (
        <section className="an-group">
          <h3>Güçlü kurulumlar ({MARKET[d.market]} hisselerinde üç dönemde de tutmuş)</h3>
          <div className="vd-list">{shown.map((s) => <SetupBlock key={s.setup.id + s.regime} s={s} d={d} />)}</div>
        </section>
      )}

      {rest.length > 0 && (
        <details className="an-how st-frame" open={!strong.length || undefined}>
          <summary>{strong.length ? 'Güçlü sayılmayan kurulumlar' : 'Sınanan kurulumlar'} ve dönem dönem sonuçları ({rest.length})</summary>
          <p className="sc-legend"><span><i className="k dot good" />kurulumun isabeti (olağandan en az 5 puan iyi)</span><span><i className="k dot" />kurulumun isabeti (değil)</span><span><i className="k tick" />aynı dönemin olağanı</span></p>
          <SetupTable rows={rest.slice(0, 10)} />
          {rest.length > 10 && (
            <details className="an-how st-frame">
              <summary>Kalan {rest.length - 10} kurulum</summary>
              <SetupTable rows={rest.slice(10)} />
            </details>
          )}
        </details>
      )}
    </>
  )
}

/** Kurulumların dönem dönem sonucu: her hücrede nokta isabet, çentik olağan */
function SetupTable({ rows }: { rows: SetupNow[] }) {
  return (
    <table className="result-table st-table">
            <thead><tr><th>Kurulum</th>{PERIOD_LABELS.map((p) => <th key={p} className="r hide-s">{p}</th>)}<th className="r">Bu hissede şu an</th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.setup.id + s.regime}>
                  <td><span className="n">{s.setup.label}</span><span className="s">{s.setup.side === 'dip' ? 'Dip' : 'Tepe'}; {REGIME_LABEL[s.regime]}. {s.strength?.reason ? 'Güçlü değil: ' + s.strength.reason + '.' : ''}</span></td>
                  {s.evidence!.periods.map((p, k) => <td key={k} className="r num hide-s"><Mini p={p} />{p[0] ? p0(p[1]) : '—'}<span className="s">olağan {p0(p[2])}, {Fmt.number(p[0], 0)} kez</span></td>)}
                  <td className="r"><span className="prem-st">{s.active ? 'Oluştu' : s.stockOk ? 'Piyasa durumu uymuyor' : 'Yok'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
  )
}

/** BIST: seçilen bazda hisselerin olağan sonucu (enflasyonun etkisini görünür kılar) */
function BasisNote({ d }: { d: SetupData }) {
  const base = d.list.find((s) => s.regime === 'any' && s.setup.side === 'dip' && s.evidence)?.evidence?.periods
  if (!base) return null
  return (
    <p className="note">
      {d.basis === 'usd' ? 'Fiyatlar her günün Dolar/TL kuruyla dolara çevrildi; göstergeler ve sonuçlar dolar üzerinden.' : 'Fiyatlar TL; yüksek enflasyon dönemlerinde nominal yükseliş sonuçları olduğundan iyi gösterir.'}
      {' '}BIST hisselerinin herhangi bir günden 3 ay sonra {d.basis === 'usd' ? 'dolar bazında' : 'TL bazında'} yukarıda olma oranı: {base.map((p, k) => `${PERIOD_LABELS[k]} ${p0(p[2])}`).join(', ')}.
    </p>
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
      <div className="st-charts two">
        <Periods s={s} />
        {s.evidence?.path && s.evidence.basePath && <PathChart days={PATH_DAYS} path={s.evidence.path} base={s.evidence.basePath} n={st.n} />}
      </div>
      <ul className="st-checks-list">
        {s.conds.map((c) => (
          <li key={c.label} className={c.ok ? 'ok' : 'no'}>
            <Icon name={c.ok ? 'check' : 'close'} label={c.ok ? 'Sağlanıyor' : 'Sağlanmıyor'} />
            <div><b>{c.label}</b><span>{c.now}{c.trigger != null ? `; sıradaki gün ${d.basis === 'usd' && d.fx ? `${price(c.trigger * d.fx)} TL (kur değişmezse)` : price(c.trigger)} ${side === 'dip' ? 'altında' : 'üstünde'} kapanırsa sağlanır (${pct(c.trigger / d.bars.c[d.bars.c.length - 1] - 1)})` : ''}.</span></div>
          </li>
        ))}
        {s.regime !== 'any' && (
          <li className={s.regimeOk ? 'ok' : 'no'}>
            <Icon name={s.regimeOk ? 'check' : 'close'} label={s.regimeOk ? 'Sağlanıyor' : 'Sağlanmıyor'} />
            <div><b>{INDEX_NAME[d.market]} 200 günlük ortalamasının {s.regime === 'bear' ? 'altında' : 'üstünde'}</b><span>şu an {d.regimeNow ? 'üstünde' : 'altında'}.</span></div>
          </li>
        )}
      </ul>
      {s.events.length >= 3 ? (
        <>
          <p className="st-own-cap">Bu hissede oluştuğu {s.events.length} gün</p>
          <EventChart bars={d.bars} events={s.events} side={side} />
        </>
      ) : s.events.length > 0 && (
        <details className="an-how st-frame">
          <summary>Bu hissede oluştuğu {s.events.length} gün (grafik)</summary>
          <EventChart bars={d.bars} events={s.events} side={side} />
        </details>
      )}
    </article>
  )
}

/** Tablo hücresi için küçük dönem göstergesi: nokta isabet, çentik olağan */
function Mini({ p }: { p: SetupEvidence['periods'][number] }) {
  if (!p[0]) return null
  return <span className="hitbar" aria-hidden><i className="b" style={{ left: `${p[2] * 100}%` }} /><i className={'h' + (p[1] - p[2] >= STRONG.diff ? ' good' : '')} style={{ left: `${p[1] * 100}%` }} /></span>
}

/** Üç dönemin sonucu: çubuk kurulumun isabeti, çentik aynı dönemin olağanı */
function Periods({ s }: { s: SetupNow }) {
  return (
    <div className="st-periods" role="img" aria-label={s.evidence!.periods.map((p, k) => `${PERIOD_LABELS[k]}: ${p0(p[1])}, olağan ${p0(p[2])}`).join('; ')}>
      {s.evidence!.periods.map((p, k) => (
        <div key={k}>
          <span className="lab">{PERIOD_LABELS[k]}</span>
          <span className="track"><i className="f" style={{ width: `${p[1] * 100}%` }} /><i className="b" style={{ left: `${p[2] * 100}%` }} /></span>
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
      <li><b>Dolar bazı</b> (BIST): TL fiyatları her günün Dolar/TL kuruyla dolara çevrilir; göstergeler, piyasa durumu ve sonuçlar dolar üzerinden hesaplanır. Böylece enflasyondan gelen nominal yükseliş “sinyal tuttu” diye sayılmaz. Tetik fiyatı, bugünkü kur sabit kalırsa geçerli olan TL karşılığıdır.</li>
      <li>BIST’te hiçbir kurulum, TL ya da dolar bazında, üç dönemin üçünde de tutmadı. Dolar bazında dip kurulumları son iki dönemde olağandan 3–6 puan iyi, ama 3 ay sonra yukarıda olma oranları %45–58 arasında; güvenilir sayılacak düzeyde değil. TL bazında: 2020–2023’te çok iyi görünen dip kurulumları 2024’ten sonra olağanın altında kaldı. Tepe (satım) tarafında iki pazarda da güvenilir kurulum bulunamadı.</li>
    </>
  )
}
