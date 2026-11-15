/**
 * Uzun dönem oranlara dayalı öneriler (Avantajlı fiyatlar listesinde):
 *   ev/altın   = konut fiyat endeksi ÷ gram altın   → "Altın boz, ev al" | "Altın biriktir"
 *   ev/dolar   = konut fiyat endeksi ÷ Dolar/TL     → "Dolar boz, ev al" | "Dolar biriktir"
 *   altın/gümüş = ons altın ÷ ons gümüş             → "Altın sat, gümüş al" | "Gümüş sat, altın al"
 * Kural: bugünkü oran kendi geçmişinin ortancasının altındaysa paydaki ucuzdur (ev ya da altın),
 * üstündeyse pahalıdır. Uç çeyreklerde (en düşük ya da en yüksek %25) sinyal güçlü sayılır.
 */
import { OZ } from './premium'

/** Aylık seri: [yıl × 12 + ay, kapanış] */
export type Monthly = [number, number][]
export interface RatioData { generated: number; series: { HPI: Monthly; GOLD: Monthly; SILVER: Monthly; USDTRY: Monthly; USM2?: Monthly; TRM2?: Monthly; XU100?: Monthly } }
export interface Live { gold?: number; silver?: number; usdTry?: number; xu100?: number }

export type AdviceId = 'home-gold' | 'home-usd' | 'gold-silver' | 'm2-usdtry' | 'm2-gold-usd' | 'm2-gold-try' | 'm2-bist' | 'm2-home'

export interface Advice {
  id: AdviceId
  title: string
  /** Öneri cümlesi (ör. "Altın boz, ev al") */
  action: string
  /** Ortancadan uzaklık yönü: pay ucuz mu */
  cheap: boolean
  strength: 'strong' | 'weak'
  /** Bugünkü oran ve geçmişi */
  value: number
  median: number
  p25: number
  p75: number
  min: number
  max: number
  /** Geçmişteki ayların yüzde kaçında oran bugünkünden düşüktü (0–1) */
  percentile: number
  /** Ortancaya göre fark (oran): −0,39 = ortancanın %39 altında */
  vsMedian: number
  /** Geçmişin kapsadığı ilk ay ve ay sayısı */
  since: number
  months: number
  /** Para arzı analizi: neyin, hangi arza göre değerlendirildiği ve arzın son açıklandığı ay */
  subject?: string
  basis?: string
  m2Month?: number
  /** Konut endeksinin son açıklanan ayı ve bugüne taşımak için eklenen ay sayısı */
  hpiMonth?: number
  hpiGap?: number
}

const sorted = (v: number[]) => [...v].sort((a, b) => a - b)
const quantile = (s: number[], p: number) => {
  const i = p * (s.length - 1), lo = Math.floor(i), hi = Math.ceil(i)
  return s[lo] + (s[hi] - s[lo]) * (i - lo)
}
export const monthOfDate = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth()
export const monthLabel = (m: number) => `${['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'][m % 12]} ${Math.floor(m / 12)}`

/** İki aylık serinin ortak aylarındaki oranı */
export function ratioSeries(a: Monthly, b: Monthly, f: (x: number, y: number) => number = (x, y) => x / y): Monthly {
  const m = new Map(b)
  const out: Monthly = []
  for (const [k, x] of a) { const y = m.get(k); if (y != null && y > 0 && x > 0) out.push([k, f(x, y)]) }
  return out
}

/**
 * Konut endeksi yaklaşık iki ay gecikmeyle açıklanır. Bugünkü altın ve dolarla karşılaştırmak için son değer,
 * son 3 ayın ortalama aylık artışıyla bugünkü aya taşınır (en çok 4 ay).
 */
export function hpiNow(hpi: Monthly, nowMonth: number): { value: number; month: number; gap: number } | undefined {
  if (hpi.length < 4) return undefined
  const [month, last] = hpi[hpi.length - 1]
  const g = (last / hpi[hpi.length - 4][1]) ** (1 / 3)
  const gap = Math.max(0, Math.min(4, nowMonth - month))
  return { value: last * g ** gap, month, gap }
}

function build(id: AdviceId, title: string, hist: Monthly, value: number, cheapAction: string, dearAction: string, extra: Partial<Advice> = {}): Advice | undefined {
  if (hist.length < 24 || !(value > 0)) return undefined
  const s = sorted(hist.map((x) => x[1]))
  const median = quantile(s, 0.5), p25 = quantile(s, 0.25), p75 = quantile(s, 0.75)
  const cheap = value < median
  return {
    id, title, action: cheap ? cheapAction : dearAction, cheap,
    strength: value <= p25 || value >= p75 ? 'strong' : 'weak',
    value, median, p25, p75, min: s[0], max: s[s.length - 1],
    percentile: s.filter((x) => x < value).length / s.length,
    vsMedian: value / median - 1,
    since: hist[0][0], months: hist.length, ...extra,
  }
}

const gramTl = (ozUsd: number, usdTry: number) => ozUsd * usdTry / OZ

/** Gecikmeli açıklanan seriyi (para arzı, konut endeksi) aylara yayar: o ay yoksa en çok [carry] ay öncesi. */
export function carried(s: Monthly, carry = 3): (month: number) => number | undefined {
  const m = new Map(s)
  return (k) => { for (let i = 0; i <= carry; i++) { const v = m.get(k - i); if (v != null) return v } return undefined }
}

/**
 * Para arzına göre değerleme: fiyat ÷ para arzı oranı kendi geçmiş ortancasıyla karşılaştırılır. Para basıldıkça
 * fiyatların da artması beklenir; oran ortancanın üstündeyse fiyat para arzından hızlı artmıştır (pahalı), altındaysa ucuz.
 *   Dolar/TL ÷ (TR M2 ÷ ABD M2) · ons altın ÷ ABD M2 · gram altın ÷ TR M2 · BIST 100 ÷ TR M2 · konut endeksi ÷ TR M2
 */
export function moneyAdvices(d: RatioData, live: Live = {}, now = new Date()): Advice[] {
  const { HPI, GOLD, USDTRY, USM2, TRM2, XU100 } = d.series
  if (!USM2?.length || !TRM2?.length) return []
  const us = carried(USM2), tr = carried(TRM2)
  const last = (m: Monthly) => m[m.length - 1]?.[1]
  const gold = live.gold ?? last(GOLD), fx = live.usdTry ?? last(USDTRY), xu = live.xu100 ?? (XU100 ? last(XU100) : undefined)
  const nowM = monthOfDate(now)
  const usNow = us(nowM) ?? last(USM2), trNow = tr(nowM) ?? last(TRM2)
  const usMonth = USM2[USM2.length - 1][0], trMonth = TRM2[TRM2.length - 1][0]
  // Geçmiş: fiyat serisinin ayları üzerinden, o ay bilinen para arzıyla
  const hist = (price: Monthly, f: (p: number, k: number) => number | undefined): Monthly => {
    const out: Monthly = []
    for (const [k, p] of price) { const v = p > 0 ? f(p, k) : undefined; if (v != null && Number.isFinite(v) && v > 0) out.push([k, v]) }
    return out
  }
  const fxAt = carried(USDTRY, 0)
  const h = hpiNow(HPI, nowM)
  const mk = (id: AdviceId, subject: string, basis: string, m2Month: number, series: Monthly, value: number | undefined, extra: Partial<Advice> = {}) =>
    value == null ? undefined : build(id, `${subject}, ${basis}`, series, value, `${subject} ucuz`, `${subject} pahalı`, { subject, basis, m2Month, ...extra })
  const out = [
    mk('m2-usdtry', 'Dolar/TL', 'iki ülkenin para arzına göre', Math.min(usMonth, trMonth),
      hist(USDTRY, (p, k) => { const a = tr(k), b = us(k); return a && b ? p / (a / b) : undefined }), fx && usNow && trNow ? fx / (trNow / usNow) : undefined),
    mk('m2-gold-usd', 'Ons altın', 'dolar arzına göre', usMonth, hist(GOLD, (p, k) => { const b = us(k); return b ? p / b : undefined }), gold && usNow ? gold / usNow : undefined),
    mk('m2-gold-try', 'Gram altın', 'TL arzına göre', trMonth,
      hist(GOLD, (p, k) => { const a = tr(k), x = fxAt(k); return a && x ? gramTl(p, x) / a : undefined }), gold && fx && trNow ? gramTl(gold, fx) / trNow : undefined),
    XU100 ? mk('m2-bist', 'BIST 100', 'TL arzına göre', trMonth, hist(XU100, (p, k) => { const a = tr(k); return a ? p / a : undefined }), xu && trNow ? xu / trNow : undefined) : undefined,
    h ? mk('m2-home', 'Ev', 'TL arzına göre', trMonth, hist(HPI, (p, k) => { const a = tr(k); return a ? p / a : undefined }), trNow ? h.value / trNow : undefined, { hpiMonth: h.month, hpiGap: h.gap }) : undefined,
  ]
  return out.filter((x): x is Advice => !!x)
}

/** Üç öneri; canlı fiyat yoksa serilerin son ayı kullanılır. Altın/gümüş için son [gsYears] yıl. */
export function advices(d: RatioData, live: Live = {}, now = new Date(), gsYears = 20): Advice[] {
  const { HPI, GOLD, SILVER, USDTRY } = d.series
  const last = (m: Monthly) => m[m.length - 1]?.[1]
  const gold = live.gold ?? last(GOLD), silver = live.silver ?? last(SILVER), fx = live.usdTry ?? last(USDTRY)
  const h = hpiNow(HPI, monthOfDate(now))
  const gramHist = ratioSeries(GOLD, USDTRY, gramTl)
  const out: (Advice | undefined)[] = []
  if (h && gold && fx) {
    const extra = { hpiMonth: h.month, hpiGap: h.gap }
    out.push(build('home-gold', 'Altın biriktiren için: ev mi, altın mı?', ratioSeries(HPI, gramHist), h.value / gramTl(gold, fx), 'Altın boz, ev al', 'Altın biriktir', extra))
    out.push(build('home-usd', 'Dolar biriktiren için: ev mi, dolar mı?', ratioSeries(HPI, USDTRY), h.value / fx, 'Dolar boz, ev al', 'Dolar biriktir', extra))
  }
  if (gold && silver) {
    // Rasyo düşükse altın gümüşe göre ucuzdur
    out.push(build('gold-silver', 'Altın mı, gümüş mü?', ratioSeries(GOLD, SILVER).slice(-gsYears * 12), gold / silver, 'Gümüş sat, altın al', 'Altın sat, gümüş al'))
  }
  return out.filter((x): x is Advice => !!x)
}
