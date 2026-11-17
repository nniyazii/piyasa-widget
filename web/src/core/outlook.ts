/**
 * Görünüm: her varlık için dört ayrı kanıtın tek bir görüşte birleştirilmesi.
 *   değerleme  fiyat ÷ para arzı oranının kendi geçmişindeki yeri (ucuz mu, pahalı mı)
 *   makro      şu an geçerli, tarihsel olarak tutarlı makro örüntüler
 *   benzer     bugüne en çok benzeyen dönemlerden sonra olanlar
 *   trend      fiyat 10 aylık ortalamasının neresinde
 * Her kanıtın kendi sicili ölçülür: o kanıt geçmişte bu varlıkta gerçekten ayırt edici olmuş mu? Olmamışsa
 * gösterilir ama görüşe katılmaz. Görüş, katılan kanıtların oylarının toplamıdır; güven, kaç kanıtın aynı yönü
 * gösterdiğine bağlıdır. Bu bir tahmin değil, geçmişin bugüne uygulanmış özetidir.
 */
import { HORIZON, macroView, monthLabel, type Asset, type MacroData, type MacroView, type Pattern, type S, type World } from './macro'

export type LayerId = 'deger' | 'makro' | 'benzer' | 'trend'
export const LAYER_LABEL: Record<LayerId, string> = { deger: 'Değerleme', makro: 'Makro örüntü', benzer: 'Benzer dönemler', trend: 'Trend' }
export interface Record12 { n: number; hit: number; base: number }
export interface Layer {
  id: LayerId
  /** −2…+2: varlık lehine pozitif */
  vote: number
  /** Tek cümle: bugünkü durum */
  text: string
  /** Bu kanıtın bu varlıktaki geçmiş sicili (bugünkü yönde) */
  record?: Record12
  /** Sicili yönünü destekliyor mu (desteklemiyorsa görüşe katılmaz) */
  counts: boolean
  /** Kanıt sayfası */
  link?: string
}
export type Stance = 'Olumlu' | 'Hafif olumlu' | 'Nötr' | 'Hafif olumsuz' | 'Olumsuz'
export type Conviction = 'yüksek' | 'orta' | 'düşük'
export interface Outlook {
  asset: Asset
  price?: number
  score: number
  stance: Stance
  conviction: Conviction
  layers: Layer[]
  /** Görüşü değiştirecek gelişmeler */
  flips: string[]
  /** Tek cümlelik gerekçe */
  why: string
}
export const OUTLOOK_ASSETS = ['GOLD', 'GAUTRY', 'SILVER', 'USDTRY', 'XU100USD', 'SPX', 'OIL', 'COPPER']

const fmt = (v: number, d = 0) => v.toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d })
const p0 = (v: number) => '%' + fmt(v * 100)
const price = (v: number) => fmt(v, v >= 1000 ? 0 : v >= 10 ? 2 : 4)

/** Değerleme oranı: fiyat ÷ ilgili para arzı */
function valuationRatio(w: World, id: string): ((k: number) => number | undefined) | undefined {
  const s = w.s
  const us = (k: number) => s.USM2?.at(k), tr = (k: number) => s.TRM2?.at(k)
  const by = (num: S | undefined, den: (k: number) => number | undefined) => (num ? (k: number) => { const a = num.at(k), b = den(k); return a != null && b ? a / b : undefined } : undefined)
  if (id === 'USDTRY') return by(s.USDTRY, (k) => { const a = tr(k), b = us(k); return a && b ? a / b : undefined })
  if (id === 'GAUTRY') return by(s.GAUTRY, tr)
  if (id === 'XU100USD' || id === 'XU100') return by(s.XU100, tr)
  if (['GOLD', 'SILVER', 'OIL', 'COPPER', 'SPX'].includes(id)) return by(s[id], us)
  return undefined
}
const BASIS: Record<string, string> = { USDTRY: 'iki ülkenin para arzına göre', GAUTRY: 'TL arzına göre', XU100USD: 'TL arzına göre', XU100: 'TL arzına göre' }

/** [on] aylarında varlığın 12 ay sonra yukarıda olma oranı ve tüm ayların her zamanki oranı */
function record(w: World, a: S, on: (k: number) => boolean | undefined): Record12 | undefined {
  let n = 0, hit = 0, bn = 0, bhit = 0
  for (let k = a.first + 12; k + HORIZON <= w.now; k++) {
    const r = a.chg(k + HORIZON, HORIZON), o = on(k)
    if (r == null || o == null) continue
    bn++; if (r > 0) bhit++
    if (o) { n++; if (r > 0) hit++ }
  }
  return n >= 24 && bn >= 60 ? { n, hit: hit / n, base: bhit / bn } : undefined
}
/** Sicil, oyun yönünü destekliyor mu: lehine oyda her zamankinden en az 5 puan iyi, aleyhine oyda en az 5 puan kötü */
const supports = (vote: number, r?: Record12) => !!r && (vote > 0 ? r.hit - r.base >= 0.05 : vote < 0 ? r.hit - r.base <= -0.05 : false)

function valuation(w: World, asset: Asset): Layer | undefined {
  const f = valuationRatio(w, asset.id), a = w.s[asset.id]
  if (!f || !a) return undefined
  const hist: [number, number][] = []
  for (let k = w.first; k <= w.now; k++) { const v = f(k); if (v != null && v > 0) hist.push([k, v]) }
  if (hist.length < 120) return undefined
  const now = hist[hist.length - 1][1]
  const sorted = hist.map((x) => x[1]).sort((x, y) => x - y)
  const pct = sorted.filter((v) => v <= now).length / sorted.length
  const med = sorted[sorted.length >> 1]
  const vote = pct <= 0.25 ? 2 : pct < 0.5 ? 1 : pct >= 0.75 ? -2 : pct > 0.5 ? -1 : 0
  // Sicil: o ana kadarki geçmişe göre ucuz (alt %35) ya da pahalı (üst %35) olduğu aylar (ileriye bakmadan)
  const rankAt = new Map<number, number>()
  const seen: number[] = []
  for (const [k, v] of hist) { if (seen.length >= 96) rankAt.set(k, seen.filter((x) => x <= v).length / seen.length); seen.push(v) }
  const r = record(w, a, (k) => { const q = rankAt.get(k); return q == null ? undefined : vote > 0 ? q <= 0.35 : q >= 0.65 })
  const p = a.at(w.now) ?? a.at(w.now - 1)
  const fair = p != null ? p * (med / now) : undefined
  const where = vote >= 2 ? 'ucuz' : vote === 1 ? 'ortancanın biraz altında' : vote <= -2 ? 'pahalı' : vote === -1 ? 'ortancanın biraz üstünde' : 'ortancada'
  return {
    id: 'deger', vote, counts: supports(vote, r), record: r, link: 'analiz/para-arzi',
    text: `Para arzına göre (${BASIS[asset.id] ?? 'dolar arzına göre'}) ${where}: yüzdelik dilim ${fmt(pct * 100)} (0 en ucuz, 100 en pahalı)${fair != null ? `; oranın ortancasına denk gelen fiyat ${price(fair)}` : ''}.`,
  }
}

function trend(w: World, asset: Asset): Layer | undefined {
  const a = w.s[asset.id]
  if (!a) return undefined
  const avg = (k: number) => { let s = 0, n = 0; for (let j = 0; j < 10; j++) { const v = a.at(k - j); if (v != null) { s += v; n++ } }; return n >= 8 ? s / n : undefined }
  let k = w.now
  while (k > w.now - 3 && a.at(k) == null) k--
  const p = a.at(k), m = avg(k)
  if (p == null || m == null) return undefined
  const up = p > m
  const r = record(w, a, (j) => { const x = a.at(j), y = avg(j); return x == null || y == null ? undefined : up ? x > y : x <= y })
  const vote = up ? 1 : -1
  return {
    id: 'trend', vote, counts: supports(vote, r), record: r,
    text: `Fiyat 10 aylık ortalamasının (${price(m)}) ${up ? 'üstünde' : 'altında'}: trend ${up ? 'yukarı' : 'aşağı'}; 12 ayda ${(a.chg(k, 12) ?? 0) >= 0 ? '+' : '−'}${p0(Math.abs(a.chg(k, 12) ?? 0))}.`,
  }
}

function macroLayer(m: MacroView, asset: Asset): Layer {
  const v = m.assets.find((x) => x.asset.id === asset.id)
  const act = v?.active ?? []
  const pos = act.filter((p) => p.sign > 0), neg = act.filter((p) => p.sign < 0)
  const vote = Math.max(-2, Math.min(2, pos.length - neg.length))
  const best = act[0]
  return {
    id: 'makro', vote, counts: act.length > 0 && vote !== 0, link: 'analiz/makro',
    record: best ? { n: best.n, hit: best.hit, base: best.base } : undefined,
    text: !act.length ? 'Şu an bu varlık için geçerli, tarihsel olarak tutarlı bir makro örüntü yok.'
      : `${act.map((p) => `“${p.cond.label}” (${p.sign > 0 ? 'lehine' : 'aleyhine'})`).join(', ')}.`,
  }
}

function analogLayer(m: MacroView, asset: Asset): Layer | undefined {
  const v = m.assets.find((x) => x.asset.id === asset.id)
  const an = v?.analog, base = v?.base
  if (!an || !base) return undefined
  const hit = an.up / an.n
  const vote = hit - base.hit >= 0.2 ? 1 : hit - base.hit <= -0.2 ? -1 : 0
  return {
    id: 'benzer', vote, counts: vote !== 0, record: { n: an.n, hit, base: base.hit }, link: 'analiz/makro',
    text: `Bugüne en çok benzeyen ${an.n} dönemin ${an.up} tanesinde 12 ay sonra yukarıdaydı (ortanca ${an.median >= 0 ? '+' : '−'}${p0(Math.abs(an.median))}); her zamanki oran ${p0(base.hit)}.`,
  }
}

const stanceOf = (s: number): Stance => (s >= 3 ? 'Olumlu' : s >= 1 ? 'Hafif olumlu' : s <= -3 ? 'Olumsuz' : s <= -1 ? 'Hafif olumsuz' : 'Nötr')

export function outlookFor(m: MacroView, asset: Asset): Outlook {
  const w = m.world
  const layers = [valuation(w, asset), macroLayer(m, asset), analogLayer(m, asset), trend(w, asset)].filter((x): x is Layer => !!x)
  const counted = layers.filter((l) => l.counts && l.vote !== 0)
  const score = counted.reduce((a, l) => a + l.vote, 0)
  const dir = Math.sign(score)
  const agree = counted.filter((l) => Math.sign(l.vote) === dir).length, against = counted.length - agree
  const conviction: Conviction = dir !== 0 && agree >= 3 && against === 0 ? 'yüksek' : dir !== 0 && agree >= 2 && against <= 1 ? 'orta' : 'düşük'
  // Görüşü değiştirecekler: trendin dönmesi, değerlemenin ortancaya gelmesi, karşı yönde bekleyen makro örüntüler
  const flips: string[] = []
  const tr = layers.find((l) => l.id === 'trend'), a = w.s[asset.id]
  if (tr && a) { let s = 0, n = 0; for (let j = 0; j < 10; j++) { const v = a.at(w.now - j); if (v != null) { s += v; n++ } }; if (n >= 8) flips.push(`Fiyat ${price(s / n)} düzeyinin ${tr.vote > 0 ? 'altına inerse' : 'üstüne çıkarsa'} trend ${tr.vote > 0 ? 'aşağı' : 'yukarı'} döner.`) }
  const waiting: Pattern[] = m.patterns.filter((p) => p.asset.id === asset.id && p.consistent && !p.activeNow && (dir === 0 || p.sign !== dir)).sort((x, y) => Math.abs(y.hit - y.base) - Math.abs(x.hit - x.base)).slice(0, 2)
  for (const p of waiting) flips.push(`“${p.cond.label}” gerçekleşirse: geçmişte ${p.episodes} dönemde 12 ay sonra ${p0(p.hit)} yukarıdaydı (her zaman ${p0(p.base)}); ${p.sign > 0 ? 'lehine' : 'aleyhine'}.`)
  const names = (ls: Layer[]) => ls.map((l) => LAYER_LABEL[l.id].toLocaleLowerCase('tr')).join(', ')
  const pro = counted.filter((l) => l.vote > 0), con = counted.filter((l) => l.vote < 0)
  const why = !counted.length ? 'Kanıtların hiçbiri bu varlıkta geçmişte ayırt edici olmamış ya da şu an bir yön göstermiyor.'
    : `${pro.length ? `Lehine: ${names(pro)}. ` : ''}${con.length ? `Aleyhine: ${names(con)}. ` : ''}`.trim()
  let k = w.now
  while (a && k > w.now - 3 && a.at(k) == null) k--
  return { asset, price: a?.at(k), score, stance: stanceOf(score), conviction, layers, flips, why }
}

// ------------------------------------------------------------------ büyük resim

export interface Regime { title: string; lines: string[] }
/** Makro tablonun birkaç cümlelik okuması */
export function regime(m: MacroView): Regime {
  const w = m.world
  const at = (id: string) => { const s = w.s[id]; if (!s) return undefined; for (let k = w.now; k > w.now - 4; k--) { const v = s.at(k); if (v != null) return v }; return undefined }
  const d = (id: string, n: number) => { const s = w.s[id]; if (!s) return undefined; for (let k = w.now; k > w.now - 4; k--) { const v = s.diff(k, n); if (v != null) return v }; return undefined }
  const c = (id: string, n: number) => { const s = w.s[id]; if (!s) return undefined; for (let k = w.now; k > w.now - 4; k--) { const v = s.chg(k, n); if (v != null) return v }; return undefined }
  const real = at('REAL'), fed = d('FED', 12), m2 = at('M2G'), m2d = d('M2G', 6), cpi = at('USCPI'), cpid = d('USCPI', 6), curve = at('CURVE'), vix = at('VIX'), dxy = c('DXY', 12), oil = c('OIL', 12), hy = at('HY')
  const trcpi = at('TRCPI'), trcpid = d('TRCPI', 6), trreal = at('TRREAL'), fx = c('USDTRY', 12)
  const n1 = (v: number) => fmt(v, 1)
  const lines: string[] = []
  if (real != null) lines.push(`Para politikası ${real > 2 ? 'sıkı' : real < 0 ? 'gevşek' : 'ılımlı'}: ABD reel faizi ${real >= 0 ? '+' : '−'}${n1(Math.abs(real))} puan${fed != null ? `, Fed son 12 ayda ${fed <= -0.75 ? 'faiz indirdi' : fed >= 0.75 ? 'faiz artırdı' : 'faizi sabit tuttu'}` : ''}.`)
  if (m2 != null) lines.push(`Likidite ${m2 > 8 ? 'bol' : m2 < 3 ? 'kıt' : 'her zaman'}: ABD para arzı yılda %${n1(m2)} büyüyor${m2d != null ? (m2d >= 1 ? ' ve hızlanıyor' : m2d <= -1 ? ' ama yavaşlıyor' : '') : ''}.`)
  if (cpi != null) lines.push(`ABD enflasyonu %${n1(cpi)}${cpid != null ? (cpid >= 0.5 ? ', yükseliyor' : cpid <= -0.5 ? ', düşüyor' : ', yatay') : ''}${oil != null && Math.abs(oil) >= 0.3 ? `; petrol 12 ayda ${oil > 0 ? '+' : '−'}${p0(Math.abs(oil))}` : ''}.`)
  if (curve != null || vix != null) lines.push(`Risk iştahı: ${curve != null ? (curve < 0 ? 'getiri eğrisi ters (yavaşlama beklentisi)' : 'getiri eğrisi normal') : ''}${vix != null ? `${curve != null ? ', ' : ''}VIX ${n1(vix)} (${vix > 30 ? 'panik' : vix < 14 ? 'rehavet' : 'her zaman'})` : ''}${hy != null && hy > 6 ? ', kredi piyasasında stres var' : ''}.`)
  if (dxy != null) lines.push(`Dolar ${dxy >= 0.07 ? 'güçleniyor' : dxy <= -0.07 ? 'zayıflıyor' : 'yatay'}: dolar endeksi 12 ayda ${dxy >= 0 ? '+' : '−'}${p0(Math.abs(dxy))}.`)
  if (trcpi != null) lines.push(`Türkiye: enflasyon %${fmt(trcpi)}${trcpid != null ? (trcpid <= -2 ? ', düşüyor' : trcpid >= 2 ? ', yükseliyor' : ', yatay') : ''}${trreal != null ? `; politika faizi enflasyonun ${fmt(Math.abs(trreal))} puan ${trreal >= 0 ? 'üstünde' : 'altında'}` : ''}${fx != null ? `; Dolar/TL 12 ayda +${p0(fx)}` : ''}.`)
  const title = vix != null && vix > 30 ? 'Panik dönemi'
    : oil != null && oil >= 0.4 && cpid != null && cpid >= 0 ? 'Enerji kaynaklı enflasyon baskısı'
      : real != null && real > 2 && !(fed != null && fed <= -0.75) ? 'Sıkı para dönemi'
        : fed != null && fed <= -0.75 ? 'Gevşeme dönemi'
          : real != null && real < 0 ? 'Negatif reel faiz dönemi'
            : cpid != null && cpid <= -0.5 ? 'Dezenflasyon dönemi' : 'Geçiş dönemi: belirgin bir baskı yok'
  return { title, lines }
}

export interface OutlookView { macro: MacroView; regime: Regime; list: Outlook[]; month: string }
export function outlookView(d: MacroData): OutlookView {
  const macro = macroView(d)
  const list = OUTLOOK_ASSETS.map((id) => macro.assets.find((a) => a.asset.id === id)?.asset).filter((a): a is Asset => !!a).map((a) => outlookFor(macro, a))
  return { macro, regime: regime(macro), list, month: monthLabel(macro.world.now) }
}
