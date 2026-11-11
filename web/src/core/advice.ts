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
export interface RatioData { generated: number; series: { HPI: Monthly; GOLD: Monthly; SILVER: Monthly; USDTRY: Monthly } }
export interface Live { gold?: number; silver?: number; usdTry?: number }

export type AdviceId = 'home-gold' | 'home-usd' | 'gold-silver'

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
