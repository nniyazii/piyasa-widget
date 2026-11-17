/**
 * Grafik tezgâhı: bir varlıkta bir olayın tüm geçmişi.
 * Zaman dilimi ve olay seçilir; mum grafikte olayın her gerçekleşmesi işaretlenir, üstünde sonraki dört vade için
 * yön olasılıkları durur. Altında son dönemde gerçekleşen olaylar ve birlikte gerçekleşenler listelenir.
 */
import { useEffect, useMemo, useState } from 'react'
import * as Fmt from '../core/format'
import type { World } from '../core/macro'
import { macroEventDefs } from '../core/macroEvents'
import {
  agoLabel, CUSTOM_IND, customEvent, customLabel, eventDefs, GROUP_LABEL, HORIZON_LABEL, joints, LONG_MA_LABEL, prepare, RECENT_LABEL, recentStudies, sentence, study, TF_LABEL,
  type CustomCond, type CustomInd, type EventDef, type EventGroup, type HorizonStat, type Study, type Tf,
} from '../core/study'
import { customActions, useCustomEvents } from '../data/custom'
import type { Subject } from '../data/subjects'
import { barDate, CandleChart, type Mark } from '../ui/CandleChart'
import { Icon } from '../ui/Icon'
import { EventFan } from '../ui/MacroCharts'
import { href } from '../ui/router'

const TF_KEY = 'piyasa.tezgah.tf'
const p0 = (v: number) => (Number.isNaN(v) ? '—' : '%' + Fmt.number(v * 100, 0))
const pct = (v: number | undefined, d = 0) => (v == null || Number.isNaN(v) ? '—' : (v > 0.00005 ? '+' : v < -0.00005 ? '−' : '') + '%' + Fmt.number(Math.abs(v * 100), d))
export const savedTf = (fallback: Tf): Tf => { try { const v = localStorage.getItem(TF_KEY); return v === 'M' || v === 'W' || v === 'D' ? v : fallback } catch { return fallback } }

/** Bir vadenin olasılık hücresi: yukarıda olma oranı, olağan oran çentiği, güven aralığı ve ortalama hareketler */
export function Odds({ s, compact }: { s: HorizonStat; compact?: boolean }) {
  if (s.n < 5) return <td className="c ev-odds thin"><span className="s">örnek az ({s.n})</span></td>
  const tone = s.clear ? (s.up > s.base ? 'up' : 'down') : ''
  return (
    <td className={'c ev-odds ' + tone} title={`${s.n} örnek; %80 güven aralığı ${p0(s.lo)}–${p0(s.hi)}; ortanca ${pct(s.median, 1)} (olağan ${pct(s.baseMedian, 1)}); yukarıda bitenler ortalama ${pct(s.avgUp, 1)}, aşağıda bitenler ${pct(s.avgDown, 1)}`}>
      <b className="num">{p0(s.up)}</b>
      <span className="track" aria-hidden><i className="r" style={{ left: `${s.lo * 100}%`, width: `${(s.hi - s.lo) * 100}%` }} /><i className="f" style={{ left: `${s.up * 100}%` }} /><i className="b" style={{ left: `${s.base * 100}%` }} /></span>
      {compact ? <span className="s num">olağan {p0(s.base)}</span> : (
        <>
          <span className="s num">olağan {p0(s.base)}</span>
          <span className="s num">{s.n} örnek</span>
          <span className="s num">aralık {Fmt.number(s.lo * 100, 0)}–{Fmt.number(s.hi * 100, 0)}</span>
          <span className="s num" title="Yukarıda biten örneklerin ortalama kazancı ve aşağıda bitenlerin ortalama kaybı">↑ {pct(s.avgUp)} ↓ {pct(s.avgDown)}</span>
        </>
      )}
    </td>
  )
}
export function OddsTable({ stats, compact, caption }: { stats: HorizonStat[]; compact?: boolean; caption?: string }) {
  return (
    <table className={'ev-table' + (compact ? '' : ' wb-odds')}>
      {caption && <caption>{caption}</caption>}
      <thead><tr>{stats.map((x) => <th key={x.bars} className="c">{x.label}</th>)}</tr></thead>
      <tbody><tr>{stats.map((x) => <Odds key={x.bars} s={x} compact={compact} />)}</tr></tbody>
    </table>
  )
}

/** Seçilen vadede her gerçekleşmenin getirisi: bir nokta bir örnek; çizgi ortanca */
function Strip({ st, hz, picked, onPick, dates }: { st: Study; hz: number; picked?: number; onPick: (i: number) => void; dates: (i: number) => string }) {
  const pts = st.onsets.map((i) => ({ i, r: st.outcomes.get(i)![hz] })).filter((p): p is { i: number; r: number } => p.r != null)
  if (pts.length < 3) return null
  const W = 720, H = 74, P = 34
  const sorted = pts.map((p) => p.r).sort((a, b) => a - b)
  const lo = Math.min(sorted[0], -0.02), hi = Math.max(sorted[sorted.length - 1], 0.02)
  const x = (r: number) => P + ((r - lo) / (hi - lo)) * (W - 2 * P)
  const med = sorted[sorted.length >> 1]
  // Üst üste gelen noktalar dikeyde kaydırılır
  const placed: { x: number; y: number }[] = []
  const dots = pts.map((p) => { const px = x(p.r); let y = 30; while (placed.some((q) => Math.abs(q.x - px) < 9 && q.y === y)) y += y <= 30 ? (y === 30 ? -9 : -9) : 0, y = y < 3 ? 39 + placed.filter((q) => Math.abs(q.x - px) < 9).length : y; placed.push({ x: px, y }); return { ...p, px, y } })
  return (
    <figure className="sc wb-strip">
      <figcaption>Olaydan {st.stats[hz].label} sonra getiri dağılımı<span>Her nokta bir gerçekleşme; kesikli çizgi sıfır, düz çizgi ortanca ({pct(med, 1)}). Noktaya dokun: grafikte o gerçekleşme.</span></figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${pts.length} gerçekleşmenin ${pts.filter((p) => p.r > 0).length} tanesinde getiri pozitif`}>
        <line className="sc-axis" x1={P} x2={W - P} y1={56} y2={56} />
        <line className="sc-level" x1={x(0)} x2={x(0)} y1={4} y2={56} />
        <line className="sc-zero" x1={x(med)} x2={x(med)} y1={8} y2={56} />
        {dots.map((d) => <circle key={d.i} cx={d.px} cy={Math.min(48, Math.max(8, d.y))} r={d.i === picked ? 6 : 4.5} className={'sc-mark ' + (d.i === picked ? 'pick' : d.r > 0 ? 'hit' : 'miss')} onClick={() => onPick(d.i)}><title>{dates(d.i)}: {pct(d.r, 1)}</title></circle>)}
        <text className="sc-tick" x={P} y={70}>{pct(lo)}</text>
        <text className="sc-tick" x={x(0)} y={70} textAnchor="middle">0</text>
        <text className="sc-tick" x={W - P} y={70} textAnchor="end">{pct(hi)}</text>
      </svg>
    </figure>
  )
}

const IND_ORDER: CustomInd[] = ['rsi', 'bbz', 'ma', 'dd', 'move', 'ret', 'rvol']
/** Kendi olayını tanımla: tetik (gösterge bir düzeyin altına iner / üstüne çıkar) ve isteğe bağlı ek durum */
function Composer({ onDone }: { onDone: (id: string) => void }) {
  const [name, setName] = useState('')
  const [trigger, setTrigger] = useState<CustomCond>({ ind: 'rsi', op: 'below', level: 30 })
  const [useWhen, setUseWhen] = useState(false)
  const [when, setWhen] = useState<CustomCond>({ ind: 'ma', op: 'above', level: 0 })
  const Cond = ({ c, set, state }: { c: CustomCond; set: (c: CustomCond) => void; state?: boolean }) => (
    <>
      <select value={c.ind} onChange={(e) => set({ ...c, ind: e.target.value as CustomInd })} aria-label="Gösterge">{IND_ORDER.map((k) => <option key={k} value={k}>{CUSTOM_IND[k].label}</option>)}</select>{' '}
      <input className="w-pct" inputMode="decimal" value={String(c.level)} onChange={(e) => { const v = Number(e.target.value.replace(',', '.')); set({ ...c, level: Number.isFinite(v) ? v : c.level }) }} aria-label="Düzey" style={{ width: '5ch' }} />{' '}
      <select value={c.op} onChange={(e) => set({ ...c, op: e.target.value as 'below' | 'above' })} aria-label="Yön">
        <option value="below">{state ? 'altındayken' : 'altına inerse'}</option><option value="above">{state ? 'üstündeyken' : 'üstüne çıkarsa'}</option>
      </select>
    </>
  )
  const spec = { name: name.trim(), trigger, when: useWhen ? when : undefined }
  return (
    <div className="wb-composer">
      <p className="cost-say">
        <Cond c={trigger} set={setTrigger} /> olay say{useWhen ? <>; yalnızca <Cond c={when} set={setWhen} state /></> : ''}.
      </p>
      <p className="note">{CUSTOM_IND[trigger.ind].label}: {CUSTOM_IND[trigger.ind].hint}.{useWhen ? ` ${CUSTOM_IND[when.ind].label}: ${CUSTOM_IND[when.ind].hint}.` : ''}</p>
      <div className="al-go">
        <label className="wb-check"><input type="checkbox" checked={useWhen} onChange={(e) => setUseWhen(e.target.checked)} /> ek durum ekle</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={customLabel({ id: '', ...spec })} aria-label="Olayın adı (isteğe bağlı)" style={{ flex: 1, minWidth: 180 }} />
        <button className="btn primary small" type="button" onClick={() => onDone('c:' + customActions.add(spec).id)}>Kaydet ve göster</button>
      </div>
    </div>
  )
}

export interface MarketEvidence { stocks: number; n: number[]; up: number[]; base: number[]; periods: [number, number, number][] }

/** Yakın zamandaki olaylar: tezgâhla aynı hesap (başlık ve varlıklar arası liste için) */
export function recentOf(subject: Subject, tf: Tf, world?: World, custom: EventDef[] = []): { studies: Study[]; tested: number } {
  const bars = subject.frames[tf]
  if (!bars || bars.t.length < 120) return { studies: [], tested: 0 }
  const x = prepare(bars, tf)
  const defs = [...eventDefs(tf), ...(tf === 'M' && world ? macroEventDefs(world, subject.group) : []), ...custom].filter((d) => !d.needsVolume || !!x.v)
  return { studies: recentStudies(x, defs), tested: defs.length }
}
export const nameOf = (subject: Subject, def: EventDef) => (def.standalone ? def.label : `${subject.short} ${def.label}`)

export function Workbench({ subject, world, defaultTf = 'W', initialEvent, focus, lead, market, heading }: {
  subject: Subject; world?: World; defaultTf?: Tf; initialEvent?: string
  /** Dışarıdan seçim (varlıklar arası listeden): n değiştiğinde zaman dilimi ve olay buna geçer */
  focus?: { tf: Tf; event: string; n: number }
  /** Sayfa başlığındaki olay: başka bir seçim yoksa tezgâh bununla açılır */
  lead?: { tf: Tf; event: string }
  /** Pazar geneli kanıt: olay kimliği ve zaman dilimine göre */
  market?: (tf: Tf, eventId: string) => MarketEvidence | undefined
  heading?: string
}) {
  const custom = useCustomEvents()
  const available = (['M', 'W', 'D'] as Tf[]).filter((t) => (subject.frames[t]?.t.length ?? 0) > 120)
  const [tf, setTfState] = useState<Tf>(() => { const s = !initialEvent && lead ? lead.tf : savedTf(defaultTf); return available.includes(s) ? s : available.includes(defaultTf) ? defaultTf : available[0] ?? 'W' })
  const setTf = (t: Tf) => { setTfState(t); setPicked(undefined); try { localStorage.setItem(TF_KEY, t) } catch { /* depolama kapalı */ } }
  const [eventId, setEventId] = useState<string | undefined>(initialEvent ?? lead?.event)
  const [hz, setHz] = useState(2)
  const [picked, setPicked] = useState<number | undefined>()
  const [composing, setComposing] = useState(false)
  useEffect(() => { if (initialEvent) { setEventId(initialEvent); setPicked(undefined) } }, [initialEvent])
  useEffect(() => { if (focus) { setTfState(focus.tf); setEventId(focus.event); setPicked(undefined) } }, [focus?.n])
  const bars = subject.frames[tf]

  const model = useMemo(() => {
    if (!bars || bars.t.length < 60) return undefined
    const x = prepare(bars, tf)
    const defs: EventDef[] = [
      ...eventDefs(tf).filter((d) => !d.needsVolume || !!x.v),
      ...(tf === 'M' && world ? macroEventDefs(world, subject.group) : []),
      ...custom.map(customEvent).filter((d) => !d.needsVolume || !!x.v),
    ]
    const recent = recentStudies(x, defs)
    return { x, defs, recent, joints: joints(x, recent) }
  }, [bars, tf, world, subject.group, custom])

  if (!model || !bars) return <p className="note">Bu varlık için yeterli mum verisi yok.</p>
  const { x, defs, recent } = model
  const def = defs.find((d) => d.id === eventId) ?? recent[0]?.def ?? defs[0]
  const st = recent.find((s) => s.def.id === def.id) ?? study(x, def)
  const marks: Mark[] = st.onsets.map((i) => { const r = st.outcomes.get(i)![hz]; return { index: i, outcome: r == null ? 'open' : r > 0 ? 'up' : 'down' } })
  const name = def.standalone ? def.label : `${subject.short} ${def.label}`
  const dates = (i: number) => barDate(tf, x.t[i])
  const grouped = (g: EventGroup) => defs.filter((d) => d.group === g && !recent.some((r) => r.def.id === d.id))
  const ev = market?.(tf, def.id)
  const pickedOut = picked != null ? st.outcomes.get(picked) : undefined
  return (
    <section className="an-group wb">
      <h3>{heading ?? 'Grafik: olay geçmişte ne zaman oldu, sonrasında ne oldu'}</h3>
      <div className="wb-pick">
        <label className="sc-pick">Olay
          <select className="select" value={def.id} onChange={(e) => { setEventId(e.target.value); setPicked(undefined) }}>
            {recent.length > 0 && <optgroup label={`Yakın zamanda olanlar (${RECENT_LABEL[tf]})`}>{recent.map((r) => <option key={r.def.id} value={r.def.id}>{r.def.label} ({agoLabel(tf, r.recent!.elapsed)})</option>)}</optgroup>}
            {(Object.keys(GROUP_LABEL) as EventGroup[]).map((g) => grouped(g).length > 0 && <optgroup key={g} label={GROUP_LABEL[g]}>{grouped(g).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</optgroup>)}
          </select>
        </label>
        <button type="button" className="btn ghost small" onClick={() => setComposing((v) => !v)} aria-expanded={composing}><Icon name="plus" />Kendi olayını tanımla</button>
        {def.group === 'özel' && <button type="button" className="btn ghost small" onClick={() => { customActions.remove(def.id.slice(2)); setEventId(undefined) }}><Icon name="trash" />Bu olayı sil</button>}
      </div>
      {composing && <Composer onDone={(id) => { setComposing(false); setEventId(id); setPicked(undefined) }} />}

      <div className="wb-side">
        <p className="wb-name">{name}</p>
        <p className="wb-count">
          {st.onsets.length ? <><b className="num">{st.onsets.length}</b> kez oldu ({dates(st.onsets[0])} – {dates(st.onsets[st.onsets.length - 1])}).</> : 'Bu varlıkta hiç olmadı.'}
          {st.recent ? ` Sonuncusu ${agoLabel(tf, st.recent.elapsed)}${st.recent.detail ? ` (${st.recent.detail})` : ''}${st.recent.since != null ? `; o günden beri ${pct(st.recent.since, 1)}` : ''}.` : ''}
        </p>
        {st.onsets.length > 0 && <OddsTable stats={st.view} caption={st.recent ? 'Bugünden sonra yukarıda olma oranı' : 'Olaydan sonra yukarıda olma oranı'} />}
        <div className="wb-hz">
          <span>İşaret rengi ve dağılım:</span>
          <div className="segmented" role="group" aria-label="Vade">{HORIZON_LABEL[tf].map((h, i) => <button key={h} type="button" aria-pressed={hz === i} onClick={() => setHz(i)}>{h}</button>)}</div>
          <span>sonrası</span>
        </div>
        <p className="note">
          {!st.onsets.length ? 'Başka bir olay ya da zaman dilimi seç.'
            : st.recent ? `Olay yakın zamanda gerçekleşti; olasılıklar, önceki ${st.recent.stats[0].n} örnekte olaydan aynı süre geçtikten sonrası içindir.`
              : 'Olay yakın zamanda gerçekleşmedi; olasılıklar olayın gerçekleştiği mumdan sonrası içindir ve tekrar gerçekleştiğinde ne beklenebileceğini gösterir.'}
          {st.best ? ` En belirgin vade ${st.best.label}: ${p0(st.best.up)} (olağan ${p0(st.best.base)}).` : st.onsets.length ? ' Hiçbir vadede olağandan belirgin biçimde ayrışmıyor.' : ''}
        </p>
        <p className="st-alarm"><a className="btn ghost small" href={href('alarmlar', { tur: 'olay', s: subject.id, e: def.id, tf })}><Icon name="bell" />Bu olay olunca haber ver</a></p>
      </div>

      <CandleChart bars={bars} tf={tf} title={subject.label} marks={marks} selected={picked} onPick={setPicked} ma={x.ma} maLabel={LONG_MA_LABEL[tf]} rsi={x.rsi}
        controls={<div className="segmented" role="group" aria-label="Zaman dilimi">{available.map((t) => <button key={t} type="button" aria-pressed={tf === t} onClick={() => setTf(t)}>{TF_LABEL[t]}</button>)}</div>} />

      {picked != null && pickedOut && (
        <p className="wb-picked" role="status">
          <b>{dates(picked)}</b> gerçekleşmesinden sonra: {HORIZON_LABEL[tf].map((h, i) => <span key={h}>{h} <b className={'num ' + (pickedOut[i] == null ? '' : pickedOut[i]! > 0 ? 'pos' : 'neg')}>{pickedOut[i] == null ? 'bekleniyor' : pct(pickedOut[i], 1)}</b></span>)}
          <button type="button" className="btn ghost small" onClick={() => setPicked(undefined)}>Kapat</button>
        </p>
      )}
      <Strip st={st} hz={hz} picked={picked} onPick={setPicked} dates={dates} />

      {ev && (
        <div className="wb-market">
          <b>{subject.market === 'TR' ? 'BIST' : 'ABD'} hisselerinin tamamında aynı olay ({Fmt.number(ev.stocks, 0)} hisse)</b>
          <OddsTable compact stats={ev.n.map((n, i) => ({ bars: i, label: HORIZON_LABEL[tf][i], n, up: ev.up[i], lo: ev.up[i], hi: ev.up[i], median: NaN, q25: NaN, q75: NaN, avgUp: NaN, avgDown: NaN, base: ev.base[i], baseMedian: NaN, consistent: true, clear: n >= 200 && Math.abs(ev.up[i] - ev.base[i]) >= 0.05 && ev.periods.every((p) => p[0] < 100 || Math.sign(p[1] - p[2]) === Math.sign(ev.up[i] - ev.base[i])) }))} />
          <p className="note">Üç dönemde ({HORIZON_LABEL[tf][2]} sonrası): {ev.periods.map((p, i) => `${['2019’a kadar', '2020–2023', '2024’ten beri'][i]} ${p[0] ? `${p0(p[1])} (olağan ${p0(p[2])}, ${Fmt.number(p[0], 0)} kez)` : 'veri yok'}`).join('; ')}. Renkli hücre: pazar genelinde olağandan en az 5 puan farklı ve üç dönemde aynı yönde.</p>
        </div>
      )}

      {st.recent && st.recent.paths.length >= 3 && (
        <details className="an-how st-frame">
          <summary>Bu sefer ve geçmiş örnekler üst üste</summary>
          <div className="ev-more"><EventFan paths={st.recent.paths.map((p) => ({ name: dates(p.index), path: p.path }))} current={st.recent.current} elapsed={st.recent.elapsed} span={st.stats[st.stats.length - 1].bars} label={subject.short} tf={tf} /></div>
        </details>
      )}

      <div className="wb-recent">
        <h4>Yakın zamanda ne oldu ({RECENT_LABEL[tf]})</h4>
        {recent.length > 0 && <p className="note">Bu zaman diliminde {defs.length} olay tanımı sınandı; {recent.length} tanesi yakın zamanda gerçekleşti. Renkli hücreler olağandan belirgin biçimde ayrışanlardır; rastgele veride de yaklaşık 20 olaydan biri şans eseri böyle görünür, bu yüzden tek bir renkli hücreye değil, birbirini destekleyen olaylara bak.</p>}
        {!recent.length && <p className="note">Bu zaman diliminde yakın zamanda istatistiksel olarak dikkat çekici bir olay olmadı. Başka bir zaman dilimi seç ya da olay listesinden bir olayın geçmişine bak.</p>}
        {recent.map((r) => (
          <button key={r.def.id} type="button" className={'ev-row btn-row' + (r.best ? ' strong' : '') + (r.def.id === def.id ? ' on' : '')} onClick={() => { setEventId(r.def.id); setPicked(undefined) }}>
            <span className="when">{dates(r.recent!.index)}<em>{agoLabel(tf, r.recent!.elapsed)}</em></span>
            <span className="what"><b>{sentence(subject.short, r)}</b><em>önceden {r.recent!.stats[0].n} kez{r.recent!.since != null ? `; o günden beri ${pct(r.recent!.since, 1)}` : ''}</em></span>
            <OddsTable compact stats={r.view} />
          </button>
        ))}
        {model.joints.length > 0 && (
          <>
            <h4>Birlikte gerçekleşenler</h4>
            <p className="note">Yakın zamandaki iki olayın geçmişte de birlikte (aynı {RECENT_LABEL[tf].replace('son ', '')} içinde) gerçekleştiği anlar ve bugünden sonrası.</p>
            {model.joints.map((j) => (
              <div key={j.a.id + j.b.id} className={'ev-row' + (j.best ? ' strong' : '')}>
                <span className="when">{j.anchors.length} kez<em>birlikte</em></span>
                <span className="what"><b>{j.a.label}</b><em>ve {j.b.label}</em></span>
                <OddsTable compact stats={j.stats} />
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  )
}
