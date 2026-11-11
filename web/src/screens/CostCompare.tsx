import { useMemo, useState } from 'react'
import { bankRoute, breakEven, certRoute, evaluate, fundRoute, RATES, type Outcome, type Route, type Scenario } from '../core/costs'
import * as Fmt from '../core/format'
import type { BanksData } from '../data/premium'
import { Segmented } from '../ui/overlay'

type MetalKey = 'gold' | 'silver'
interface Inputs { metal: MetalKey; amount: number; years: number; growth: number; commission: number }
const DEFAULTS: Inputs = { metal: 'gold', amount: 100_000, years: 1, growth: 30, commission: 1 }
const KEY = 'piyasa.costs.v1'
/** Varsayımlar: borsada alış-satış farkının yarısı; fonların yıllık gideri (GLDTR için yayımlanan %0,47) */
const EXCHANGE_SPREAD = 0.001
const FUND_FEE = 0.0047
/** Canlı banka fiyatı yokken kullanılan tipik makas (her yönde %1,3) */
const FALLBACK_BANK = { bid: 98.7, ask: 101.3 }

const load = (): Inputs => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { return DEFAULTS } }
const tl = (v: number) => Fmt.number(v, 0) + ' ₺'
const pct = (v: number, d = 1) => '%' + Fmt.number(v * 100, d)

/** Banka mı, fon mu? Tüm masraflarıyla (makas, BSMV, komisyon, yönetim gideri, stopaj) karşılaştırma. */
export function CostCompare({ banks, certPremium }: { banks?: BanksData; certPremium?: number }) {
  const [inp, setInp] = useState<Inputs>(load)
  const set = (p: Partial<Inputs>) => setInp((x) => { const n = { ...x, ...p }; try { localStorage.setItem(KEY, JSON.stringify(n)) } catch { /* yok say */ } return n })
  const gold = inp.metal === 'gold'
  const s: Scenario = { amount: Math.max(0, inp.amount || 0), years: inp.years, annualGrowth: (inp.growth || 0) / 100, commission: Math.max(0, inp.commission || 0) / 1000 }

  const routes = useMemo<Route[]>(() => {
    const live = (banks?.banks ?? []).filter((b) => b[inp.metal]).map((b) => bankRoute(b.id, b.name, b[inp.metal]!))
    const bank = live.length ? live : [bankRoute('banka', 'Banka (tipik makas)', FALLBACK_BANK)]
    const fund = gold ? fundRoute('fon', 'Altın fonu (GLDTR, ZGOLD, ISGLK)', FUND_FEE, EXCHANGE_SPREAD) : fundRoute('fon', 'Gümüş fonu (GMSTR)', FUND_FEE, EXCHANGE_SPREAD)
    return [...bank, fund, ...(gold ? [certRoute('sertifika', 'Altın sertifikası (ALTIN.S1)', EXCHANGE_SPREAD)] : [])]
  }, [banks, inp.metal, gold])

  const rows = useMemo(() => routes.map((r) => evaluate(r, s)).sort((a, b) => b.net - a.net), [routes, s.amount, s.years, s.annualGrowth, s.commission])
  // Sertifika primliyken masrafı düşük görünse de prim riski taşır: özet banka ile fonu karşılaştırır
  const risky = (r: Outcome) => r.route.kind === 'cert' && (certPremium ?? 0) > 0.02
  const best = rows.find((r) => !risky(r)) ?? rows[0]
  const fund = rows.find((r) => r.route.kind === 'fund')!
  const bestBank = rows.find((r) => r.route.kind === 'bank')!
  const even = breakEven(fund.route, bestBank.route, s)
  const metal = gold ? 'altın' : 'gümüş'
  const liveBanks = !!banks?.banks.some((b) => b[inp.metal])

  return (
    <section className="bt-sect cost">
      <h2>Banka mı, fon mu?</h2>
      <p className="note" style={{ marginTop: -4 }}>Aynı parayla {metal} alıp bir süre sonra satarsan, her yolun toplam masrafı ve elinde kalan tutar.</p>
      <div className="cost-form">
        <Segmented value={inp.metal} onChange={(metal) => set({ metal })} label="Maden" options={[{ value: 'gold', label: 'Altın' }, { value: 'silver', label: 'Gümüş' }]} />
        <Segmented value={inp.years} onChange={(years) => set({ years })} label="Süre" options={[{ value: 0.5, label: '6 ay' }, { value: 1, label: '1 yıl' }, { value: 3, label: '3 yıl' }, { value: 5, label: '5 yıl' }]} />
        <label>Tutar (₺)<input type="number" inputMode="numeric" min={0} step={1000} value={inp.amount} onChange={(e) => set({ amount: Number(e.target.value) })} /></label>
        <label>Beklenen yıllık artış (%)<input type="number" inputMode="decimal" step={5} value={inp.growth} onChange={(e) => set({ growth: Number(e.target.value) })} /></label>
        <label>Aracı kurum komisyonu (binde)<input type="number" inputMode="decimal" min={0} step={0.1} value={inp.commission} onChange={(e) => set({ commission: Number(e.target.value) })} /></label>
      </div>

      <p className="prem-lead" aria-live="polite">
        {metal[0].toUpperCase() + metal.slice(1)} {s.annualGrowth >= 0 ? `yılda ${pct(s.annualGrowth, 0)} artarsa` : `yılda ${pct(-s.annualGrowth, 0)} düşerse`} en avantajlı yol: <b>{best.route.name}</b>. {tl(s.amount)} yatırıp {inp.years === 0.5 ? '6 ay' : `${inp.years} yıl`} sonra satınca elinde <b className="num">{tl(best.net)}</b> kalır; toplam masraf <b className="num">{tl(best.cost)}</b>.
        {' '}{even == null
          ? (fund.net >= bestBank.net ? `Bu sürede fon, ${bestBank.route.name} karşısında her artış oranında önde.` : `Bu sürede ${bestBank.route.name}, fon karşısında her artış oranında önde.`)
          : <>Başa baş noktası yıllık <b className="num">{pct(even, 0)}</b> artış: {evaluate(fund.route, { ...s, annualGrowth: even - 0.01 }).net > evaluate(bestBank.route, { ...s, annualGrowth: even - 0.01 }).net ? 'altında fon, üstünde banka' : 'altında banka, üstünde fon'} daha avantajlı.</>}
      </p>

      <div className="bt-scroll">
        <table className="result-table bt-table cost-table">
          <thead><tr>
            <th>Yol</th><th className="r">Makas</th><th className="r">BSMV</th><th className="r">Komisyon</th><th className="r">Yönetim</th><th className="r">Stopaj</th><th className="r">Toplam masraf</th><th className="r">Elde kalan</th>
          </tr></thead>
          <tbody>{rows.map((r) => <Row key={r.route.id} r={r} best={r === best} amount={s.amount} />)}</tbody>
        </table>
      </div>
      {gold && certPremium != null && certPremium > 0.01 && (
        <p className="note">ALTIN.S1’in masrafı en düşük, ama şu an gram altının {pct(certPremium)} üstünde işlem görüyor. Tablodaki hesap bu primin satarken de aynı kalacağını varsayar; prim kapanırsa sertifika o kadar kaybettirir. Bu yüzden öneride sayılmadı.</p>
      )}

      <details className="bt-how">
        <summary>Hesaba katılanlar ve varsayımlar</summary>
        <ul>
          <li><b>Banka (kaydi {metal} hesabı):</b> alış ve satış fiyatı arasındaki makas{liveBanks ? ', bankaların kendi sitelerinde yayımladığı fiyatlardan' : ' (canlı banka fiyatı alınamadı; her yönde %1,3 varsayıldı)'}. Alımda {pct(RATES.bankBsmv)} BSMV (kambiyo vergisi). Satış kazancından vergi kesilmez, saklama ücreti yoktur.{banks?.generated ? ` Fiyatlar: ${Fmt.dateTime(banks.generated)}.` : ''}</li>
          <li><b>Fon (borsa yatırım fonu):</b> aracı kurum komisyonu (alışta ve satışta, üzerine %5 BSMV), borsadaki alış-satış farkı (her yönde {pct(EXCHANGE_SPREAD)} varsayıldı), yıllık yönetim gideri ({pct(FUND_FEE, 2)}; GLDTR için yayımlanan oran, diğer fonlarda farklı olabilir) ve satışta kazanç üzerinden {pct(RATES.fundTax)} stopaj (9 Temmuz 2025 ve sonrasında alınan paylar).</li>
          <li><b>Altın sertifikası:</b> komisyon ve borsa makası; stopaj %0. Karşılığında gram altına göre değişken bir prim taşır.</li>
          <li>Stopaj TL kazanç üzerinden kesilir: fiyat ne kadar artarsa fonun vergisi o kadar büyür. Banka makası ise sabittir; bu yüzden az artışta fon, çok artışta banka öne geçer.</li>
          <li>Bankaların makası mesai dışında ve hafta sonu genişler; mobil uygulamadaki fiyat sitedekinden farklı olabilir. Fiziki altında ayrıca işçilik ve saklama riski vardır; burada yalnızca kaydi hesap karşılaştırılır.</li>
          <li>Vergi oranları Cumhurbaşkanı kararıyla sık değişir (Kasım 2026 itibarıyla geçerli olanlar kullanıldı). Karar vermeden önce bankandan ve aracı kurumundan doğrula.</li>
        </ul>
      </details>
    </section>
  )
}

function Row({ r, best, amount }: { r: Outcome; best: boolean; amount: number }) {
  const cell = (v: number) => <td className="r num hide-s">{v > 0.5 ? tl(v) : '—'}</td>
  const p = r.parts
  return (
    <tr className={best ? 'is-buy' : undefined}>
      <td>
        <span className="n">{r.route.name}</span>
        <span className="s">{r.route.kind === 'bank' ? `makas ${pct(r.route.buySpread + r.route.sellSpread)}` : r.route.kind === 'fund' ? 'stopaj %17,5' : 'stopaj yok, primli'}</span>
      </td>
      {cell(p.spread)}{cell(p.buyTax)}{cell(p.commission)}{cell(p.fee)}{cell(p.gainTax)}
      <td className="r num">{tl(r.cost)}<span className="s">{amount > 0 ? pct(r.costRate) : ''}</span></td>
      <td className={'r num' + (best ? ' pos' : '')} style={{ fontWeight: 600 }}>{tl(r.net)}</td>
    </tr>
  )
}
