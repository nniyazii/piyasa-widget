import type { Reliability } from '../core/backtest'
import * as Fmt from '../core/format'
import type { ScoreEntry } from '../data/reliability'

const tier = (r: Reliability) =>
  r.score == null ? 'none' : r.label === 'Güçlü' ? 'strong' : r.label === 'Orta' ? 'mid' : r.label === 'Zayıf' ? 'weak' : 'bad'

const pts = (v?: number) => (v == null ? '—' : (v > 0.0005 ? '+' : v < -0.0005 ? '−' : '') + Fmt.number(Math.abs(v * 100), 1) + ' puan')
const span = (years: number) => (years === 0.5 ? 'son 6 ay' : `son ${years} yıl`)

/** Kısa rozet: skor ve etiket. Liste kartlarında ve liste başlığında. */
export function ReliabilityBadge({ entry, compact }: { entry: ScoreEntry; compact?: boolean }) {
  const r = entry.rel
  const title = r.score == null
    ? `Güvenilirlik: yetersiz veri (${span(entry.years)} içinde ${r.episodes} giriş)`
    : `Güvenilirlik ${r.score}/100, ${r.label.toLowerCase()}. ${span(entry.years)} testine göre${entry.source === 'local' ? ' (senin testin)' : ''}.`
  return (
    <span className={'rel-badge ' + tier(r)} title={title} aria-label={title}>
      <Meter value={r.score} />
      {r.score != null && <b className="num">{r.score}</b>}
      {!compact && <span>{r.score == null ? 'Yetersiz veri' : r.label}</span>}
    </span>
  )
}

function Meter({ value }: { value?: number }) {
  // Dört dilim: 0–30, 30–50, 50–70, 70–100 — dolu dilim sayısı etiketle aynı
  const filled = value == null ? 0 : value >= 70 ? 4 : value >= 50 ? 3 : value >= 30 ? 2 : 1
  return <span className="rel-meter" aria-hidden>{[0, 1, 2, 3].map((i) => <i key={i} className={i < filled ? 'on' : ''} />)}</span>
}

/** Test sonucunda: skor, düz bir cümleyle anlamı ve bileşenleri. */
export function ReliabilityPanel({ rel, years, bench }: { rel: Reliability; years: number; bench?: string }) {
  const idx = bench ?? 'endeks'
  const edge = rel.edge3m ?? rel.edge1m
  const horizon = rel.edge3m != null ? '3 ay' : '1 ay'
  const t = [rel.t1m, rel.t3m].filter((x): x is number => x != null)
  const tAvg = t.length ? t.reduce((a, b) => a + b, 0) / t.length : undefined
  const strength = tAvg == null ? 'ölçülemedi' : tAvg >= 2 ? 'güçlü' : tAvg >= 1 ? 'orta' : tAvg >= 0 ? 'zayıf; şans eseri olabilir' : 'ters yönde'
  return (
    <section className={'bt-sect rel-panel ' + tier(rel)}>
      <h2>Güvenilirlik</h2>
      <div className="rel-head">
        <div className="rel-score">
          <b className="num">{rel.score ?? '—'}</b>
          <span>{rel.score != null ? <>/100 <em>{rel.label}</em></> : <em>Yetersiz veri</em>}</span>
        </div>
        <p>
          {rel.score == null
            ? `Skor için en az 6 ayda giriş ve toplam 15 giriş gerekiyor; ${span(years)} içinde ${rel.months} ayda ${rel.episodes} giriş var. Dönemi uzatmayı dene.`
            : <>Listeye giren hisseler, girdikten {horizon} sonra {idx} karşısında ortalama <b className="num">{edge == null ? '—' : Fmt.number(Math.abs(edge * 100), 1) + ' puan'}</b> {edge != null && edge < 0 ? 'geride kaldı' : 'öne geçti'}.
              {rel.consistency != null && <> Farkın pozitif olduğu ayların oranı <b className="num">%{Fmt.number(rel.consistency * 100, 0)}</b>.</>} Sonucun istatistiksel gücü {strength}.</>}
        </p>
      </div>
      <dl className="bt-kv rel-kv">
        <div><dt>Endekse göre, 1 ay</dt><dd className="num">{pts(rel.edge1m)}</dd></div>
        <div><dt>Endekse göre, 3 ay</dt><dd className="num">{pts(rel.edge3m)}</dd></div>
        <div><dt>İstatistiksel güç (t)</dt><dd className="num">{tAvg == null ? '—' : Fmt.number(tAvg, 2)}</dd></div>
        <div><dt>Pozitif ay oranı</dt><dd className="num">{rel.consistency == null ? '—' : '%' + Fmt.number(rel.consistency * 100, 0)}</dd></div>
        <div><dt>Örnek</dt><dd className="num">{rel.months} ay, {rel.episodes} giriş</dd></div>
      </dl>
      {rel.lookahead && <p className="note">Koşullarda geçmişi bilinmeyen, bugünkü değerle sabit alınan bir alan var; sonuç iyimser olabileceği için skor dörtte bir düşürüldü.</p>}
      <details className="bt-how">
        <summary>Skor nasıl hesaplanıyor</summary>
        <ul>
          <li>Her girişin 1 ay ve 3 ay sonraki getirisinden aynı dönemdeki {idx} getirisi çıkarılır; aynı ay içindeki girişlerin ortalaması alınır. Böylece tek bir kalabalık gün sonucu tek başına belirlemez.</li>
          <li><b>Güç (%50)</b>: aylık farkların ortalamasının, dağınıklığına göre sıfırdan ne kadar uzak olduğu (t değeri). 3 aylık pencereler üst üste bindiği için örnek sayısı üçte bire indirilir.</li>
          <li><b>Tutarlılık (%30)</b>: farkın pozitif olduğu ayların oranı.</li>
          <li><b>Örnek (%20)</b>: giriş olan ay sayısı ve toplam giriş.</li>
          <li>70 ve üstü güçlü, 50–69 orta, 30–49 zayıf, altı güvenilmez. Geçmişteki başarı geleceği garanti etmez; skor yalnızca listenin geçmişte tutarlı bir üstünlük gösterip göstermediğini özetler.</li>
        </ul>
      </details>
    </section>
  )
}
