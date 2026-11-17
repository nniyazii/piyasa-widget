/**
 * Analiz › Makro: para arzı, faiz, dolar, enflasyon, VIX ve emtia arasındaki tarihsel örüntüler;
 * bugüne benzeyen dönemler ve sonrasında olanlar.
 */
import { useEffect, useMemo, useState } from 'react'
import * as Fmt from '../core/format'
import { ASSETS, FEATURES, HORIZON, macroView, MIN, monthLabel, pathAfter, type AssetView, type MacroData, type MacroView, type Pattern } from '../core/macro'
import { AnalogChart, CorrCell, Spark } from '../ui/MacroCharts'
import { href } from '../ui/router'

const pct = (v?: number, d = 0) => (v == null || Number.isNaN(v) ? '—' : (v > 0.00005 ? '+' : v < -0.00005 ? '−' : '') + '%' + Fmt.number(Math.abs(v * 100), d))
const p0 = (v?: number) => (v == null ? '—' : '%' + Fmt.number(v * 100, 0))

import { loadMacro as load, OutlookLine } from './Outlook'

export function Macro() {
  const [data, setData] = useState<MacroData | null | undefined>()
  useEffect(() => { let alive = true; void load().then((d) => { if (alive) setData(d ?? null) }); return () => { alive = false } }, [])
  const m = useMemo(() => (data ? macroView(data) : undefined), [data])
  if (data === undefined) return <p className="an-answer" aria-live="polite">Makro veriler alınıyor…</p>
  if (!m) return <p className="an-answer">Makro veriler alınamadı.</p>
  return <View m={m} generated={data!.generated} />
}

const list = (a: string[]) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' ve ' + a[a.length - 1])

function View({ m, generated }: { m: MacroView; generated: number }) {
  const pro = m.assets.filter((a) => a.stance === 'lehine'), con = m.assets.filter((a) => a.stance === 'aleyhine')
  const top3 = m.analogs.list.slice(0, 3).map((x) => monthLabel(x.month))
  return (
    <>
      <header className="an-head">
        <h2>Büyük resim: makro tablo geçmişte hangi dönemlere benziyor, sonrasında ne oldu?</h2>
        <p className="an-answer" aria-live="polite">
          {pro.length || con.length
            ? <>Geçmiş örüntüler {pro.length ? <>{list(pro.map((a) => a.asset.short.toLocaleLowerCase('tr')))} lehine</> : null}{pro.length && con.length ? ', ' : ''}{con.length ? <>{list(con.map((a) => a.asset.short.toLocaleLowerCase('tr')))} aleyhine</> : null}.</>
            : 'Şu an belirgin bir makro örüntü yok.'}
        </p>
      </header>
      <p className="an-sub">Bu sayfa <a href={href('analiz/olaylar')}>Olaylar</a>’ün iki kanıtını ayrıntılı gösterir: makro örüntüler ve benzer dönemler.</p>
      <p className="an-sub">
        Bugünkü tablo en çok <b>{list(top3)}</b> dönemlerine benziyor. Şu an geçerli {m.activeConditions.length} makro durum var
        {m.activeConditions.length ? <>: {list(m.activeConditions.map((c) => `“${c.label}”`))}</> : ''}. Aşağıda her varlık için bu durumların ve benzer dönemlerin geçmişte neyle sonuçlandığı var; sonuçlar {HORIZON} ay sonrası içindir.
      </p>

      <section className="an-group">
        <h3>Makro durum (gölge bant: tarihsel her zamanki aralık)</h3>
        <div className="mc-tiles">{TILES.map((t) => <Tile key={t.id} m={m} t={t} />)}</div>
      </section>

      <section className="an-group">
        <h3>Varlıklar: geçmiş ne söylüyor ({HORIZON} ay sonrası)</h3>
        <div className="vd-list">{m.assets.map((a) => <AssetRow key={a.asset.id} a={a} m={m} />)}</div>
      </section>

      <section className="an-group">
        <h3>Bugüne en çok benzeyen dönemler ve sonraki 12 ay</h3>
        <div className="mc-scroll">
          <table className="result-table st-table mc-analogs">
            <thead><tr><th>Dönem</th>{['GOLD', 'SPX', 'DXY', 'OIL', 'USDTRY', 'XU100USD'].map((id) => <th key={id} className="r">{ASSETS.find((a) => a.id === id)!.short}</th>)}</tr></thead>
            <tbody>
              {m.analogs.list.map((x) => (
                <tr key={x.month}>
                  <td><span className="n">{monthLabel(x.month)}</span><span className="s">{FEATURES.slice(0, 5).map((f, j) => `${f.label.split(',')[0].replace('ABD ', '')} ${x.features[j] == null ? '—' : Fmt.number(x.features[j]!, f.digits ?? 1)}`).join('; ')}</span></td>
                  {['GOLD', 'SPX', 'DXY', 'OIL', 'USDTRY', 'XU100USD'].map((id) => <td key={id} className={'r num ' + (x.returns[id] == null ? '' : x.returns[id]! > 0 ? 'pos' : 'neg')}>{pct(x.returns[id])}</td>)}
                </tr>
              ))}
              <tr className="mc-now">
                <td><span className="n">Bugün ({monthLabel(m.world.now)})</span><span className="s">{FEATURES.slice(0, 5).map((f, j) => `${f.label.split(',')[0].replace('ABD ', '')} ${m.analogs.now[j] == null ? '—' : Fmt.number(m.analogs.now[j]!, f.digits ?? 1)}`).join('; ')}</span></td>
                {['GOLD', 'SPX', 'DXY', 'OIL', 'USDTRY', 'XU100USD'].map((id) => { const s = m.analogs.summary[id]; return <td key={id} className="r num">{s ? <>{s.up}/{s.n}<span className="s">ortanca {pct(s.median)}</span></> : '—'}</td> })}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="note">Benzerlik {FEATURES.length} göstergeye göre ölçülür (reel faiz, getiri eğrisi, Fed’in yönü, para arzı, enflasyon ve yönü, dolar, petrol, altın, borsa, işsizlik). Son satır, benzer dönemlerin kaçında varlığın 12 ay sonra yukarıda olduğunu gösterir.</p>
      </section>

      <Playbook m={m} />

      <section className="an-group">
        <h3>İlişkiler: varlıklar neyle birlikte hareket ediyor</h3>
        <div className="mc-scroll">
          <table className="result-table mc-heat">
            <thead><tr><th>Varlık</th>{DRIVER_ORDER.map((d) => <th key={d.id} className="r">{d.label}</th>)}</tr></thead>
            <tbody>
              {m.assets.map((a) => (
                <tr key={a.asset.id}>
                  <td><span className="n">{a.asset.short}</span></td>
                  {DRIVER_ORDER.map((d) => { const r = m.relations.find((x) => x.asset.id === a.asset.id && x.driver === d.id); return <td key={d.id} className="r">{r ? <CorrCell long={r.long} recent={r.recent} /> : null}</td> })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">Her hücrede iki değer: solda tüm geçmiş, sağda son 5 yıl. 12 aylık değişimlerin korelasyonu; +1 birlikte, −1 ters yönde hareket. İki değer çok farklıysa ilişki son yıllarda değişmiş demektir (örneğin altın uzun dönemde faizle ilgisizken son 5 yılda belirgin ters yönlü).</p>
      </section>

      <details className="an-how">
        <summary>Nasıl hesaplanıyor, nelere dikkat etmeli</summary>
        <ul>
          <li><b>Veri</b>: TradingView’in aylık serileri; çoğu 1968’den, VIX 1990’dan, Türkiye serileri 1986–2005’ten başlar. Enflasyon, para arzı ve işsizlik bir-iki ay gecikmeli açıklanır; son bilinen değer kullanılır. Veri {Fmt.dateTime(generated)} itibarıyla.</li>
          <li><b>Makro durumlar</b> önceden tanımlıdır ve her birinin ekonomik bir gerekçesi vardır (reel faiz, getiri eğrisi, para arzı, dolar, enflasyon, risk iştahı, enerji). Veriden kural türetilmez; yalnızca bu durumların geçmişte neyle sonuçlandığı ölçülür.</li>
          <li><b>Örüntü</b>: bir durum geçerliyken varlığın 12 ay sonraki getirisi, tüm ayların her zaman getirisiyle karşılaştırılır. <b>Tutarlı</b> sayılması için: en az {MIN.episodes} ayrı dönem, yukarıda olma oranında her zamankinden en az {MIN.hitDiff * 100} puan fark ve üç çağın (1990 öncesi, 1990–2007, 2008’den beri) örneği yeterli olanlarının hepsinde aynı yön.</li>
          <li><b>Ay sayısı yanıltır</b>: 12 aylık getiriler üst üste biner; “120 ay” çoğu zaman 8–15 bağımsız dönem demektir. Bu yüzden dönem sayısı ayrıca yazılır. Onlarca durum ve 11 varlık sınandığı için bazı örüntüler şans eseri tutarlı görünebilir.</li>
          <li><b>Benzer dönemler</b> en yakın {m.analogs.list.length} aydır (birbirinden en az 18 ay uzak). Sekiz örnek bir yön gösterebilir, olasılık vermez; hiçbir dönem bugünün aynısı değildir.</li>
          <li>Türkiye’ye özgü durumlar yalnızca Dolar/TL, gram altın ve BIST ile eşleştirilir. TL bazlı varlıklarda her zamanki oran enflasyon yüzünden zaten çok yüksektir; BIST için dolar bazındaki satıra bak.</li>
          <li>Bunlar yatırım tavsiyesi değildir; geçmişte ne olduğunun özeti ve bugünün o geçmişe ne kadar benzediğidir.</li>
        </ul>
        <p><a href={href('sozluk/makro-oruntu')}>Sözlükte ayrıntısı</a></p>
      </details>
    </>
  )
}

const DRIVER_ORDER = [{ id: 'DXY', label: 'Dolar endeksi' }, { id: 'REAL', label: 'Reel faiz' }, { id: 'US10Y', label: '10 yıllık faiz' }, { id: 'M2G', label: 'Para arzı' }, { id: 'USCPI', label: 'Enflasyon' }, { id: 'OIL', label: 'Petrol' }, { id: 'VIX', label: 'VIX' }]

// ------------------------------------------------------------------ makro durum kutuları

interface TileDef { id: string; label: string; series: string; unit: string; digits?: number; note?: (v: number) => string }
const TILES: TileDef[] = [
  { id: 'real', label: 'ABD reel faizi', series: 'REAL', unit: 'puan', note: (v) => (v < 0 ? 'negatif: nakit eriyor' : v > 2 ? 'yüksek: sıkı para' : 'ılımlı') },
  { id: 'curve', label: 'Getiri eğrisi (10Y − 3A)', series: 'CURVE', unit: 'puan', note: (v) => (v < 0 ? 'ters: yavaşlama beklentisi' : 'normal') },
  { id: 'fed', label: 'Fed faizi', series: 'FED', unit: '%', digits: 2 },
  { id: 'm2', label: 'ABD para arzı (yıllık)', series: 'M2G', unit: '%', note: (v) => (v > 8 ? 'hızlı büyüme' : v < 3 ? 'zayıf likidite' : 'her zaman') },
  { id: 'cpi', label: 'ABD enflasyonu', series: 'USCPI', unit: '%', note: (v) => (v > 5 ? 'yüksek' : v < 2 ? 'düşük' : 'hedefe yakın') },
  { id: 'dxy', label: 'Dolar endeksi', series: 'DXY', unit: '', digits: 1 },
  { id: 'vix', label: 'VIX', series: 'VIX', unit: '', digits: 1, note: (v) => (v > 30 ? 'panik' : v < 14 ? 'rehavet' : 'her zaman') },
  { id: 'oil', label: 'Brent petrol', series: 'OIL', unit: '$', digits: 0 },
  { id: 'hy', label: 'Kredi riski farkı', series: 'HY', unit: 'puan', note: (v) => (v > 6 ? 'stres' : 'sakin') },
  { id: 'trcpi', label: 'Türkiye enflasyonu', series: 'TRCPI', unit: '%', digits: 0 },
  { id: 'trreal', label: 'Türkiye reel politika faizi', series: 'TRREAL', unit: 'puan', digits: 0, note: (v) => (v < 0 ? 'negatif: TL eriyor' : 'pozitif') },
  { id: 'trm2', label: 'TL para arzı (yıllık)', series: 'TRM2G', unit: '%', digits: 0 },
]

function Tile({ m, t }: { m: MacroView; t: TileDef }) {
  const s = m.world.s[t.series]
  if (!s) return null
  let k = m.world.now
  while (k > m.world.now - 4 && s.at(k) == null) k--
  const now = s.at(k)
  if (now == null) return null
  const hist: number[] = []
  for (let j = s.first; j <= k; j++) { const v = s.at(j); if (v != null) hist.push(v) }
  const sorted = [...hist].sort((a, b) => a - b)
  const q = (p: number) => sorted[Math.floor(p * (sorted.length - 1))]
  const rank = sorted.filter((v) => v <= now).length / sorted.length
  const recent: number[] = []
  for (let j = k - 120; j <= k; j++) { const v = s.at(j); if (v != null) recent.push(v) }
  const ch = s.diff(k, 12)
  return (
    <div className="mc-tile">
      <span className="lab">{t.label}</span>
      <b className="num">{Fmt.number(now, t.digits ?? 1)}{t.unit === '%' ? '%' : t.unit === '$' ? ' $' : ''}</b>
      <Spark values={recent} band={[q(0.25), q(0.75)]} />
      <span className="s">{t.note ? t.note(now) + '; ' : ''}geçmişin %{Fmt.number(rank * 100, 0)}’inden yüksek{ch != null ? `; 12 ayda ${ch >= 0 ? '+' : '−'}${Fmt.number(Math.abs(ch), t.digits ?? 1)}` : ''}</span>
    </div>
  )
}

// ------------------------------------------------------------------ varlık satırı

function AssetRow({ a, m }: { a: AssetView; m: MacroView }) {
  const an = a.analog
  const paths = m.analogs.list.map((x) => ({ name: monthLabel(x.month), path: pathAfter(m.world, a.asset.id, x.month) })).filter((p) => p.path.length === HORIZON + 1)
  return (
    <article className={'st-sig mc-asset' + (a.stance === 'lehine' || a.stance === 'aleyhine' ? ' strong' : '')}>
      <h3>{a.asset.label}</h3>
      <p className="vd-act">{a.stance === 'nötr' ? 'Geçerli makro örüntü yok' : `Makro örüntüler ${a.stance}`}<span className="vd-str">yalnızca makro</span></p>
      <OutlookLine asset={a.asset.id} prefix="Bütün kanıtlarla görünüm:" />
      <dl className="st-facts">
        <div><dt>Geçerli tutarlı örüntü</dt><dd className="num">{a.active.length ? `${a.active.filter((p) => p.sign > 0).length} lehine, ${a.active.filter((p) => p.sign < 0).length} aleyhine` : 'yok'}</dd></div>
        <div><dt>Benzer dönemlerden 12 ay sonra</dt><dd className="num">{an ? <>{an.up} / {an.n} yukarıda<small>ortanca {pct(an.median)}</small></> : '—'}</dd></div>
        <div><dt>Her zaman (tüm aylar)</dt><dd className="num">{p0(a.base?.hit)}<small>ortanca {pct(a.base?.median)}</small></dd></div>
      </dl>
      {a.active.length > 0 && <ul className="mc-patterns">{a.active.map((p) => <PatternItem key={p.cond.id} p={p} />)}</ul>}
      {paths.length >= 3 && (
        <details className="an-how st-frame" open={a.stance === 'lehine' || a.stance === 'aleyhine' || undefined}>
          <summary>Benzer dönemlerden sonraki seyir (grafik)</summary>
          <AnalogChart paths={paths} label={a.asset.short} />
        </details>
      )}
    </article>
  )
}

function PatternItem({ p, withAsset }: { p: Pattern; withAsset?: boolean }) {
  return (
    <li className={p.sign > 0 ? 'pro' : 'con'}>
      <div>
        <b>{withAsset ? `${p.asset.short}: ` : ''}{p.cond.label}</b>
        <span>{p.cond.why} Geçmişte {p.episodes} ayrı dönemde ({p.n} ay) görüldü: 12 ay sonra {p.asset.short.toLocaleLowerCase('tr')} <b className="num">{p0(p.hit)}</b> yukarıdaydı (her zaman {p0(p.base)}), ortanca getiri <b className="num">{pct(p.median)}</b> (her zaman {pct(p.baseMedian)}).</span>
      </div>
      <div className="mc-eras" role="img" aria-label={p.eras.filter((e) => e.n).map((e) => `${e.label}: ${p0(e.hit)}, her zaman ${p0(e.base)}`).join('; ')}>
        {p.eras.map((e) => (
          <span key={e.label} className={e.n ? '' : 'none'}>
            <em>{e.label}</em>
            <span className="track"><i className="f" style={{ width: `${(e.hit ?? 0) * 100}%` }} />{e.base != null && <i className="b" style={{ left: `${e.base * 100}%` }} />}</span>
            <small className="num">{e.n ? `${p0(e.hit)} (${e.n} ay)` : 'veri yok'}</small>
          </span>
        ))}
      </div>
    </li>
  )
}

/** Tüm tutarlı örüntüler: önce şu an geçerli olanlar, sonra bekleyenler (başvuru listesi) */
function Playbook({ m }: { m: MacroView }) {
  const good = m.patterns.filter((p) => p.consistent).sort((x, y) => Math.abs(y.hit - y.base) - Math.abs(x.hit - x.base))
  const idle = good.filter((p) => !p.activeNow)
  return (
    <section className="an-group">
      <h3>Tarihsel örüntüler: şu an geçerli olmayanlar ({idle.length})</h3>
      <p className="note">Bu durumlar şu an geçerli değil; gerçekleştiklerinde geçmişte ne olduğunun başvuru listesi. Geçerli olanlar yukarıda, ilgili varlığın altında.</p>
      <details className="an-how st-frame">
        <summary>Listeyi göster</summary>
        <ul className="mc-patterns">{idle.map((p) => <PatternItem key={p.cond.id + p.asset.id} p={p} withAsset />)}</ul>
      </details>
    </section>
  )
}
