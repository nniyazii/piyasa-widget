import { useMemo, useState } from 'react'
import { bankRoute, breakEven, certRoute, evaluate, fundRoute, physicalRoute, RATES, type Outcome, type Route, type Scenario } from '../core/costs'
import * as Fmt from '../core/format'
import type { BanksData } from '../data/premium'
import { href } from '../ui/router'

type MetalKey = 'gold' | 'silver'
/** own: kullanıcının kendi bankasından girdiği alış/satış fiyatı (TL/gram), maden başına */
interface Inputs { metal: MetalKey; amount: number; years: number; growth: number; commission: number; own: Partial<Record<MetalKey, { bid?: number; ask?: number }>> }
const DEFAULTS: Inputs = { metal: 'gold', amount: 100_000, years: 1, growth: 30, commission: 1, own: {} }
const KEY = 'piyasa.costs.v1'
/** Varsayımlar: borsada alış-satış farkının yarısı; fonların yıllık gideri (GLDTR için yayımlanan %0,47) */
const EXCHANGE_SPREAD = 0.001
const FUND_FEE = 0.0047
/** Canlı banka fiyatı yokken kullanılan tipik makas (her yönde %1,3) */
const FALLBACK_BANK = { bid: 98.7, ask: 101.3 }

const load = (): Inputs => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { return DEFAULTS } }
const tl = (v: number) => Fmt.number(v, 0) + ' ₺'
const pct = (v: number, d = 1) => '%' + Fmt.number(v * 100, d)
const scenario = (inp: Inputs): Scenario => ({ amount: Math.max(0, inp.amount || 0), years: inp.years, annualGrowth: (inp.growth || 0) / 100, commission: Math.max(0, inp.commission || 0) / 1000 })

function routesFor(metal: MetalKey, banks: BanksData | undefined, own?: { bid?: number; ask?: number }): Route[] {
  const gold = metal === 'gold'
  const live = (banks?.banks ?? []).filter((b) => b[metal]).map((b) => bankRoute(b.id, b.name, b[metal]!))
  // Fiziki gümüşte ad maden adına göre: aynı kaynak hem gram altın hem gümüş fiyatı verir
  const physical = (banks?.physical ?? []).filter((b) => b[metal]).map((b) => physicalRoute(b.id, gold ? b.name : b.name.replace('gram altın', 'gümüş'), b[metal]!))
  const mine = own?.bid && own.ask && own.ask > own.bid && own.ask / own.bid < 1.2 ? [bankRoute('kendi', 'Kendi bankam', { bid: own.bid, ask: own.ask })] : []
  const bank = live.length || mine.length ? [...mine, ...live] : [bankRoute('banka', 'Banka (tipik makas)', FALLBACK_BANK)]
  const fund = gold ? fundRoute('fon', 'Altın fonu (GLDTR, ZGOLD, ISGLK)', FUND_FEE, EXCHANGE_SPREAD) : fundRoute('fon', 'Gümüş fonu (GMSTR)', FUND_FEE, EXCHANGE_SPREAD)
  return [...bank, ...physical, fund, ...(gold ? [certRoute('sertifika', 'Altın sertifikası (ALTIN.S1)', EXCHANGE_SPREAD)] : [])]
}

/** Sertifika primliyken masrafı düşük görünse de prim riski taşır: öneride sayılmaz */
const risky = (r: Outcome, certPremium?: number) => r.route.kind === 'cert' && (certPremium ?? 0) > 0.02

/** Kayıtlı senaryoyla en avantajlı yol (özet sayfası için). */
export function bestRoute(metal: MetalKey, banks: BanksData | undefined, certPremium?: number): Outcome | undefined {
  const inp = load()
  const rows = routesFor(metal, banks, inp.own[metal]).map((r) => evaluate(r, scenario(inp))).sort((a, b) => b.net - a.net)
  return rows.find((r) => !risky(r, certPremium)) ?? rows[0]
}

/** Nereden almalı? Banka, fiziki, fon ve sertifika; tüm masraflarıyla (makas, BSMV, komisyon, yönetim gideri, stopaj). */
export function CostCompare({ banks, certPremium }: { banks?: BanksData; certPremium?: number }) {
  const [inp, setInp] = useState<Inputs>(load)
  const set = (p: Partial<Inputs>) => setInp((x) => { const n = { ...x, ...p }; try { localStorage.setItem(KEY, JSON.stringify(n)) } catch { /* yok say */ } return n })
  const gold = inp.metal === 'gold'
  const setOwn = (p: { bid?: number; ask?: number }) => set({ own: { ...inp.own, [inp.metal]: { ...inp.own[inp.metal], ...p } } })
  const ownQ = inp.own[inp.metal]
  const ownInvalid = !!ownQ?.bid && !!ownQ.ask && !(ownQ.ask > ownQ.bid && ownQ.ask / ownQ.bid < 1.2)
  const s = scenario(inp)

  const routes = useMemo(() => routesFor(inp.metal, banks, ownQ), [banks, inp.metal, ownQ?.bid, ownQ?.ask])
  // Elde kalana göre sıralı; primli sertifika (öneride sayılmaz) en sonda
  const rows = useMemo(() => routes.map((r) => evaluate(r, s)).sort((a, b) => Number(risky(a, certPremium)) - Number(risky(b, certPremium)) || b.net - a.net), [routes, s.amount, s.years, s.annualGrowth, s.commission, certPremium])
  const best = rows.find((r) => !risky(r, certPremium)) ?? rows[0]
  const fund = rows.find((r) => r.route.kind === 'fund')!
  const bestBank = rows.find((r) => r.route.kind === 'bank')!
  const even = breakEven(fund.route, bestBank.route, s)
  const metal = gold ? 'altın' : 'gümüş'
  const liveBanks = !!banks?.banks.some((b) => b[inp.metal])
  const maxCost = Math.max(...rows.map((r) => r.cost), 1)
  const fundBelow = even != null && evaluate(fund.route, { ...s, annualGrowth: even - 0.01 }).net > evaluate(bestBank.route, { ...s, annualGrowth: even - 0.01 }).net

  return (
    <section className="cost">
      <header className="an-head">
        <h2>{gold ? 'Altını' : 'Gümüşü'} nereden almalı?</h2>
        <p className="an-answer" aria-live="polite">
          <b>{best.route.name}</b>. Elinde <b className="num">{tl(best.net)}</b> kalır; toplam masraf <b className="num">{tl(best.cost)}</b>.
        </p>
      </header>

      {/* Senaryo bir cümle olarak okunur; altı çizili yerler değiştirilebilir */}
      <p className="cost-say">
        <label><input className="w-amount" type="number" inputMode="numeric" min={0} step={1000} value={inp.amount} onChange={(e) => set({ amount: Number(e.target.value) })} aria-label="Tutar (₺)" /> ₺</label> ile{' '}
        <select value={inp.metal} onChange={(e) => set({ metal: e.target.value as MetalKey })} aria-label="Maden"><option value="gold">altın</option><option value="silver">gümüş</option></select> alıp{' '}
        <select value={inp.years} onChange={(e) => set({ years: Number(e.target.value) })} aria-label="Süre"><option value={0.5}>6 ay</option><option value={1}>1 yıl</option><option value={3}>3 yıl</option><option value={5}>5 yıl</option></select> sonra satarsam; fiyat yılda{' '}
        <label>%<input className="w-pct" type="number" inputMode="decimal" step={5} value={inp.growth} onChange={(e) => set({ growth: Number(e.target.value) })} aria-label="Beklenen yıllık artış (%)" /></label> artar, aracı kurum binde{' '}
        <input className="w-pct" type="number" inputMode="decimal" min={0} step={0.1} value={inp.commission} onChange={(e) => set({ commission: Number(e.target.value) })} aria-label="Aracı kurum komisyonu (binde)" /> komisyon alırsa.
      </p>

      <p className="an-sub">
        {even == null
          ? (fund.net >= bestBank.net ? `Bu sürede fon, ${bestBank.route.name} karşısında her artış oranında önde.` : `Bu sürede ${bestBank.route.name}, fon karşısında her artış oranında önde.`)
          : <>Banka ile fon arasında başa baş noktası yıllık <b className="num">{pct(even, 0)}</b> artış: {fundBelow ? 'altında fon, üstünde banka' : 'altında banka, üstünde fon'} daha avantajlı. Fonun vergisi kazançla büyür, bankanın makası sabittir.</>}
      </p>

      {banks?.session === false && (
        <p className="note warn">Banka fiyatları mesai dışında okundu ({Fmt.dateTime(banks.generated)}). Bankalar mesai dışında ve hafta sonu makası belirgin biçimde açar; hafta içi 09:30–17:30 arasında makaslar çok daha dardır ve sıralama değişir.</p>
      )}
      {banks?.offHoursAt != null && (
        <p className="note">Şu an banka mesaisi dışında; karşılaştırma mesai içindeki son fiyatlarla ({Fmt.dateTime(banks.generated)}) yapıldı. Şu an alırsan makas daha geniş olur.</p>
      )}

      <ol className="cost-list">
        {rows.map((r) => <CostRow key={r.route.id} r={r} best={r === best} max={maxCost} amount={s.amount} />)}
      </ol>
      <p className="cost-legend" aria-hidden="true">
        <span><i className="seg spread" />Makas</span><span><i className="seg tax" />Vergi (BSMV, stopaj)</span><span><i className="seg fee" />Komisyon ve yönetim</span>
        <span className="hint">Ayrıntı için satıra dokun</span>
      </p>

      {gold && certPremium != null && certPremium > 0.01 && (
        <p className="note">ALTIN.S1’in masrafı en düşük, ama öneride sayılmadı: şu an gram altının {pct(certPremium)} üstünde işlem görüyor. Hesap bu primin satarken de aynı kalacağını varsayar; prim kapanırsa sertifika o kadar kaybettirir.</p>
      )}
      <details className="an-how cost-own">
        <summary>Bankam ya da kuyumcum listede yok</summary>
        <p>Örneğin İş Bankası: uygulamasındaki gram {metal} alış ve satış fiyatını gir, tabloya “Kendi bankam” olarak eklensin.</p>
        <div className="cost-own-form">
          <label>Bankanın alışı (₺)<input type="number" inputMode="decimal" min={0} step="any" value={ownQ?.bid ?? ''} onChange={(e) => setOwn({ bid: Number(e.target.value) || undefined })} /></label>
          <label>Bankanın satışı (₺)<input type="number" inputMode="decimal" min={0} step="any" value={ownQ?.ask ?? ''} onChange={(e) => setOwn({ ask: Number(e.target.value) || undefined })} /></label>
        </div>
        {ownInvalid && <p className="note" style={{ color: 'var(--down)' }}>Satış fiyatı alıştan yüksek olmalı (bankanın sana sattığı fiyat).</p>}
      </details>

      <details className="an-how">
        <summary>Hesaba katılanlar ve varsayımlar</summary>
        <ul>
          <li><b>Banka (kaydi {metal} hesabı):</b> alış ve satış fiyatı arasındaki makas{liveBanks ? ', bankaların kendi sitelerinde yayımladığı fiyatlardan (Kuveyt Türk, Enpara, Akbank, Yapı Kredi, Ziraat; Ziraat’te internet kuru ve mevduat hesabı satırı). İş Bankası sitesinde otomatik okumaya izin vermediği için elle girilebilir' : ' (canlı banka fiyatı alınamadı; her yönde %1,3 varsayıldı)'}. Alımda {pct(RATES.bankBsmv)} BSMV (kambiyo vergisi). Satış kazancından vergi kesilmez, saklama ücreti yoktur.{banks?.generated ? ` Fiyatlar: ${Fmt.dateTime(banks.generated)}.` : ''}</li>
          <li><b>Fiziki {metal} (kuyumcu):</b> yalnızca alış-satış makası; Altınkaynak’ın yayımladığı fiyatlardan{gold ? ' (paketsiz gram altın ve 995 ayar külçe)' : ''}. Alımda BSMV, satışta gelir vergisi yok; külçe tesliminde KDV yok. Hesapta olmayanlar: saklama (kasa kirası), çalınma riski, küçük gramajlı ve paketli ürünlerde daha geniş makas{gold ? '' : '. Fiziki gümüşte makas çok geniştir; mamul ve takıda ayrıca KDV vardır'}. Kuyumcular arasında fiyat farkı olur.</li>
          <li><b>Fon (borsa yatırım fonu):</b> aracı kurum komisyonu (alışta ve satışta, üzerine %5 BSMV), borsadaki alış-satış farkı (her yönde {pct(EXCHANGE_SPREAD)} varsayıldı), yıllık yönetim gideri ({pct(FUND_FEE, 2)}; GLDTR için yayımlanan oran, diğer fonlarda farklı olabilir) ve satışta kazanç üzerinden {pct(RATES.fundTax)} stopaj (9 Temmuz 2025 ve sonrasında alınan paylar).</li>
          <li><b>Altın sertifikası:</b> komisyon ve borsa makası; stopaj %0. Karşılığında gram altına göre değişken bir prim taşır.</li>
          <li>Bankaların makası mesai dışında ve hafta sonu genişler; mobil uygulamadaki fiyat sitedekinden farklı olabilir. Banka satırları kaydi hesap içindir; bankadan fiziki teslim alınırsa ayrıca ücret ödenir.</li>
          <li>Vergi oranları Cumhurbaşkanı kararıyla sık değişir (Kasım 2026 itibarıyla geçerli olanlar kullanıldı). Karar vermeden önce bankandan ve aracı kurumundan doğrula.</li>
        </ul>
        <p><a href={href('sozluk/masraflar')}>Makas, BSMV ve stopaj nedir?</a></p>
      </details>
    </section>
  )
}

/** Bir yol: ad, masraf çubuğu (en pahalıya göre ölçekli), masraf ve elde kalan. Dokununca kalem kalem döküm. */
function CostRow({ r, best, max, amount }: { r: Outcome; best: boolean; max: number; amount: number }) {
  const p = r.parts
  const w = (v: number) => `${(v / max) * 100}%`
  const kind = r.route.kind === 'bank' ? `banka hesabı, makas ${pct(r.route.buySpread + r.route.sellSpread)}`
    : r.route.kind === 'physical' ? `kuyumcu, makas ${pct(r.route.buySpread + r.route.sellSpread)}, vergi yok`
      : r.route.kind === 'fund' ? 'borsa, stopaj %17,5' : 'borsa, stopaj yok, primli'
  const items: [string, number][] = [['Makas', p.spread], ['BSMV', p.buyTax], ['Komisyon', p.commission], ['Yönetim gideri', p.fee], ['Stopaj', p.gainTax]]
  return (
    <li className={'cost-row' + (best ? ' best' : '')}>
      <details>
        <summary>
          <span className="name"><span className="n">{r.route.name}{best && <em>En avantajlı</em>}{r.route.kind === 'cert' && !best && <em className="risk">Prim riski</em>}</span><span className="s">{kind}</span></span>
          <span className="bar" aria-hidden="true">
            <i className="seg spread" style={{ width: w(p.spread) }} /><i className="seg tax" style={{ width: w(p.buyTax + p.gainTax) }} /><i className="seg fee" style={{ width: w(p.commission + p.fee) }} />
          </span>
          <span className="cost-v num">{tl(r.cost)}<span className="s">masraf{amount > 0 ? `, ${pct(r.costRate)}` : ''}</span></span>
          <span className="net num">{tl(r.net)}<span className="s">elde kalan</span></span>
        </summary>
        <dl className="cost-parts">
          {items.filter(([, v]) => v > 0.5).map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="num">{tl(v)}</dd></div>)}
          {!items.some(([, v]) => v > 0.5) && <div><dt>Masraf yok</dt><dd /></div>}
        </dl>
      </details>
    </li>
  )
}
