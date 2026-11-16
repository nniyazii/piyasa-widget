/**
 * Makro analiz: varlıkları (altın, dolar, petrol, borsa…) makro değişkenlere (para arzı, reel faiz, getiri eğrisi,
 * dolar endeksi, enflasyon, VIX…) bağlayan tarihsel örüntüler.
 *
 *   1) Koşullar: ekonomik gerekçesi olan, önceden tanımlı durumlar ("reel faiz negatif", "getiri eğrisi ters"…).
 *      Her koşul için, geçmişte o durumdayken varlığın 12 ay sonraki getirisi, tüm ayların olağan getirisiyle
 *      karşılaştırılır; üç ayrı dönemde aynı yönde mi diye bakılır.
 *   2) Benzer dönemler: bugünkü makro tabloya en çok benzeyen geçmiş aylar ve sonrasında olanlar.
 *   3) İlişkiler: varlıkların sürücülerle korelasyonu, uzun dönem ve son 3 yıl.
 *
 * Aylık veride örnek azdır ve aylar birbirine bağımlıdır (12 aylık getiriler üst üste biner). Bu yüzden
 * "bağımsız dönem" sayısı ayrıca verilir ve hiçbir sonuç kesinlik olarak sunulmaz.
 */
export type Monthly = [number, number][]
export interface MacroData { generated: number; series: Record<string, Monthly> }

export const HORIZON = 12
const monthLabel = (m: number) => `${['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'][m % 12]} ${Math.floor(m / 12)}`
export { monthLabel }

/** Ay → değer; eksik aylar son bilinen değerle (en çok [carry] ay) doldurulur */
export class S {
  private m = new Map<number, number>()
  first = Infinity; last = -Infinity
  constructor(data: Monthly | undefined, carry = 3) {
    if (!data?.length) return
    for (const [k, v] of data) this.m.set(k, v)
    this.first = data[0][0]; this.last = data[data.length - 1][0]
    let prev: number | undefined, gap = 0
    for (let k = this.first; k <= this.last + carry; k++) {
      if (this.m.has(k)) { prev = this.m.get(k); gap = 0 } else if (prev != null && gap < carry) { this.m.set(k, prev); gap++ }
    }
  }
  at(k: number): number | undefined { return this.m.get(k) }
  /** [n] ay önceye göre oransal değişim */
  chg(k: number, n: number): number | undefined { const a = this.at(k), b = this.at(k - n); return a != null && b != null && b !== 0 ? a / b - 1 : undefined }
  /** [n] ay önceye göre fark (puan) */
  diff(k: number, n: number): number | undefined { const a = this.at(k), b = this.at(k - n); return a != null && b != null ? a - b : undefined }
  static of(f: (k: number) => number | undefined, first: number, last: number): S {
    const d: Monthly = []
    for (let k = first; k <= last; k++) { const v = f(k); if (v != null && Number.isFinite(v)) d.push([k, v]) }
    return new S(d, 0)
  }
}

export interface Asset { id: string; label: string; /** Cümlede: "Altın", "Dolar/TL" */ short: string; group: 'global' | 'tr' }
export const ASSETS: Asset[] = [
  { id: 'GOLD', label: 'Ons altın ($)', short: 'Altın', group: 'global' },
  { id: 'SILVER', label: 'Ons gümüş ($)', short: 'Gümüş', group: 'global' },
  { id: 'OIL', label: 'Brent petrol ($)', short: 'Petrol', group: 'global' },
  { id: 'GAS', label: 'Doğal gaz ($)', short: 'Doğal gaz', group: 'global' },
  { id: 'COPPER', label: 'Bakır ($)', short: 'Bakır', group: 'global' },
  { id: 'SPX', label: 'S&P 500', short: 'ABD borsası', group: 'global' },
  { id: 'DXY', label: 'Dolar endeksi (DXY)', short: 'Dolar endeksi', group: 'global' },
  { id: 'USDTRY', label: 'Dolar/TL', short: 'Dolar/TL', group: 'tr' },
  { id: 'GAUTRY', label: 'Gram altın (TL)', short: 'Gram altın', group: 'tr' },
  { id: 'XU100USD', label: 'BIST 100 (dolar bazında)', short: 'BIST (dolar)', group: 'tr' },
  { id: 'XU100', label: 'BIST 100 (TL)', short: 'BIST (TL)', group: 'tr' },
]

export interface World { s: Record<string, S>; now: number; first: number }
/** Ham serilerden türetilmiş seriler: reel faiz, getiri eğrisi, yıllık büyümeler, TL bazlı varlıklar */
export function world(d: MacroData): World {
  const s: Record<string, S> = {}
  for (const [k, v] of Object.entries(d.series)) s[k] = new S(v, k === 'USM2' || k === 'TRM2' || k === 'USCPI' || k === 'TRCPI' || k === 'ISM' || k === 'USUR' || k === 'FED' || k === 'TRRATE' || k === 'TRFER' ? 3 : 1)
  const now = Math.max(s.GOLD.last, s.DXY.last)
  const first = Math.min(...Object.values(s).map((x) => x.first))
  const mk = (f: (k: number) => number | undefined) => S.of(f, first, now)
  const g = (id: string) => s[id] ?? new S(undefined)
  s.GAUTRY = mk((k) => { const a = g('GOLD').at(k), b = g('USDTRY').at(k); return a != null && b != null ? (a * b) / 31.1035 : undefined })
  s.XU100USD = mk((k) => { const a = g('XU100').at(k), b = g('USDTRY').at(k); return a != null && b != null ? a / b : undefined })
  s.REAL = mk((k) => { const a = g('US10Y').at(k), b = g('USCPI').at(k); return a != null && b != null ? a - b : undefined }) // reel faiz (gerçekleşen enflasyonla)
  s.CURVE = mk((k) => { const a = g('US10Y').at(k), b = g('US3M').at(k); return a != null && b != null ? a - b : undefined })
  s.M2G = mk((k) => { const x = g('USM2').chg(k, 12); return x != null ? x * 100 : undefined })
  s.TRM2G = mk((k) => { const x = g('TRM2').chg(k, 12); return x != null ? x * 100 : undefined })
  s.TRREAL = mk((k) => { const a = g('TRRATE').at(k), b = g('TRCPI').at(k); return a != null && b != null ? a - b : undefined })
  s.TRM2REAL = mk((k) => { const a = s.TRM2G.at(k), b = g('TRCPI').at(k); return a != null && b != null ? a - b : undefined })
  return { s, now, first }
}

// ------------------------------------------------------------------ koşullar

export interface Condition {
  id: string
  /** Durumun adı: "Reel faiz negatif" */
  label: string
  /** Neden önemli (bir cümle) */
  why: string
  group: 'faiz' | 'para' | 'dolar' | 'enflasyon' | 'risk' | 'emtia' | 'tr'
  test: (w: World, k: number) => boolean | undefined
}
const v = (w: World, id: string, k: number) => w.s[id]?.at(k)
const both = <T,>(a: T | undefined, b: T | undefined, f: (a: T, b: T) => boolean) => (a == null || b == null ? undefined : f(a, b))
const one = (a: number | undefined, f: (a: number) => boolean) => (a == null ? undefined : f(a))

export const CONDITIONS: Condition[] = [
  { id: 'real-neg', group: 'faiz', label: 'ABD reel faizi negatif', why: '10 yıllık tahvil faizi enflasyonun altında: nakit ve tahvil değer kaybeder, altın gibi getirisiz varlıkların maliyeti düşer.', test: (w, k) => one(v(w, 'REAL', k), (x) => x < 0) },
  { id: 'real-high', group: 'faiz', label: 'ABD reel faizi %2’nin üstünde', why: 'Tahvil enflasyonun belirgin üstünde getiri veriyor: getirisiz ve riskli varlıklara rakip olur.', test: (w, k) => one(v(w, 'REAL', k), (x) => x > 2) },
  { id: 'real-up', group: 'faiz', label: 'ABD reel faizi yükseliyor (12 ayda 1,5 puan)', why: 'Finansal koşullar sıkılaşıyor.', test: (w, k) => one(w.s.REAL.diff(k, 12), (x) => x >= 1.5) },
  { id: 'real-down', group: 'faiz', label: 'ABD reel faizi düşüyor (12 ayda 1,5 puan)', why: 'Finansal koşullar gevşiyor.', test: (w, k) => one(w.s.REAL.diff(k, 12), (x) => x <= -1.5) },
  { id: 'curve-inv', group: 'faiz', label: 'Getiri eğrisi ters (10 yıllık < 3 aylık)', why: 'Piyasa faiz indirimi ve yavaşlama bekliyor; geçmişte resesyonların öncüsü.', test: (w, k) => one(v(w, 'CURVE', k), (x) => x < 0) },
  { id: 'curve-back', group: 'faiz', label: 'Getiri eğrisi tersten normale döndü', why: 'Son 12 ayda tersti, şimdi pozitif: faiz indirimleri başlamış demektir; resesyonlar çoğu kez bu aşamada gelir.', test: (w, k) => { const c = v(w, 'CURVE', k); if (c == null) return undefined; let inv = false; for (let j = 1; j <= 12; j++) { const x = v(w, 'CURVE', k - j); if (x != null && x < 0) inv = true }; return c > 0 && inv } },
  { id: 'fed-cut', group: 'faiz', label: 'Fed faiz indiriyor (12 ayda en az 0,75 puan)', why: 'Para politikası gevşiyor.', test: (w, k) => one(w.s.FED?.diff(k, 12), (x) => x <= -0.75) },
  { id: 'fed-hike', group: 'faiz', label: 'Fed faiz artırıyor (12 ayda en az 0,75 puan)', why: 'Para politikası sıkılaşıyor.', test: (w, k) => one(w.s.FED?.diff(k, 12), (x) => x >= 0.75) },
  { id: 'm2-fast', group: 'para', label: 'ABD para arzı hızlı büyüyor (yıllık %8’in üstünde)', why: 'Dolaşımdaki para hızla artıyor: varlık fiyatlarını ve bir süre sonra enflasyonu besler.', test: (w, k) => one(v(w, 'M2G', k), (x) => x > 8) },
  { id: 'm2-slow', group: 'para', label: 'ABD para arzı yavaş büyüyor ya da daralıyor (yıllık %3’ün altında)', why: 'Likidite kısılıyor.', test: (w, k) => one(v(w, 'M2G', k), (x) => x < 3) },
  { id: 'm2-accel', group: 'para', label: 'ABD para arzı büyümesi hızlanıyor (6 ayda 2 puan)', why: 'Likidite döngüsü yukarı dönüyor.', test: (w, k) => one(w.s.M2G.diff(k, 6), (x) => x >= 2) },
  { id: 'm2-real-pos', group: 'para', label: 'ABD para arzı enflasyondan hızlı büyüyor (3 puandan fazla)', why: 'Reel likidite artıyor.', test: (w, k) => both(v(w, 'M2G', k), v(w, 'USCPI', k), (a, b) => a - b > 3) },
  { id: 'dxy-down', group: 'dolar', label: 'Dolar endeksi zayıflıyor (12 ayda %7’den fazla düştü)', why: 'Zayıf dolar, dolar cinsinden fiyatlanan emtiayı ve gelişen piyasaları destekler.', test: (w, k) => one(w.s.DXY.chg(k, 12), (x) => x <= -0.07) },
  { id: 'dxy-up', group: 'dolar', label: 'Dolar endeksi güçleniyor (12 ayda %7’den fazla yükseldi)', why: 'Güçlü dolar küresel likiditeyi sıkar; gelişen piyasalara ve emtiaya baskı yapar.', test: (w, k) => one(w.s.DXY.chg(k, 12), (x) => x >= 0.07) },
  { id: 'inf-high', group: 'enflasyon', label: 'ABD enflasyonu %5’in üstünde', why: 'Yüksek enflasyon dönemi.', test: (w, k) => one(v(w, 'USCPI', k), (x) => x > 5) },
  { id: 'inf-up', group: 'enflasyon', label: 'ABD enflasyonu yükseliyor (6 ayda 1 puan)', why: 'Enflasyon ivmeleniyor.', test: (w, k) => one(w.s.USCPI.diff(k, 6), (x) => x >= 1) },
  { id: 'inf-down', group: 'enflasyon', label: 'ABD enflasyonu düşüyor (6 ayda 1 puan)', why: 'Dezenflasyon: faiz indirimine alan açar.', test: (w, k) => one(w.s.USCPI.diff(k, 6), (x) => x <= -1) },
  { id: 'vix-panic', group: 'risk', label: 'VIX 30’un üstünde (panik)', why: 'Piyasada korku yüksek; geçmişte bu aylar çoğu kez alım fırsatı olmuştur.', test: (w, k) => one(v(w, 'VIX', k), (x) => x > 30) },
  { id: 'vix-calm', group: 'risk', label: 'VIX 14’ün altında (rehavet)', why: 'Piyasa risk fiyatlamıyor.', test: (w, k) => one(v(w, 'VIX', k), (x) => x < 14) },
  { id: 'hy-stress', group: 'risk', label: 'Kredi stresi (yüksek getirili tahvil farkı 6 puanın üstünde)', why: 'Şirketlerin borçlanması zorlaşıyor.', test: (w, k) => one(v(w, 'HY', k), (x) => x > 6) },
  { id: 'ism-weak', group: 'risk', label: 'ABD sanayisi daralıyor (ISM 47’nin altında)', why: 'Ekonomik aktivite zayıf.', test: (w, k) => one(v(w, 'ISM', k), (x) => x < 47) },
  { id: 'oil-spike', group: 'emtia', label: 'Petrol 12 ayda %40’tan fazla yükseldi', why: 'Enerji şoku: enflasyonu ve cari açığı (Türkiye için) büyütür.', test: (w, k) => one(w.s.OIL.chg(k, 12), (x) => x >= 0.4) },
  { id: 'oil-crash', group: 'emtia', label: 'Petrol 12 ayda %30’dan fazla düştü', why: 'Talep zayıf ya da arz bol.', test: (w, k) => one(w.s.OIL.chg(k, 12), (x) => x <= -0.3) },
  { id: 'gold-run', group: 'emtia', label: 'Altın 12 ayda %25’ten fazla yükseldi', why: 'Güçlü altın rallisi: devam mı eder, yorulur mu?', test: (w, k) => one(w.s.GOLD.chg(k, 12), (x) => x >= 0.25) },
  { id: 'tr-real-neg', group: 'tr', label: 'Türkiye’de politika faizi enflasyonun altında', why: 'TL mevduat reel olarak eritiyor: dövize ve altına talep artar.', test: (w, k) => one(v(w, 'TRREAL', k), (x) => x < 0) },
  { id: 'tr-real-pos', group: 'tr', label: 'Türkiye’de politika faizi enflasyonun 5 puandan fazla üstünde', why: 'TL reel getiri sunuyor: kur baskısı azalır.', test: (w, k) => one(v(w, 'TRREAL', k), (x) => x > 5) },
  { id: 'tr-m2-fast', group: 'tr', label: 'TL para arzı enflasyondan hızlı büyüyor (10 puandan fazla)', why: 'TL bolluğu: kur ve fiyatlar üzerinde baskı.', test: (w, k) => one(v(w, 'TRM2REAL', k), (x) => x > 10) },
  { id: 'tr-inf-down', group: 'tr', label: 'Türkiye enflasyonu düşüyor (6 ayda 5 puan)', why: 'Dezenflasyon süreci.', test: (w, k) => one(w.s.TRCPI?.diff(k, 6), (x) => x <= -5) },
  { id: 'tr-inf-up', group: 'tr', label: 'Türkiye enflasyonu yükseliyor (6 ayda 5 puan)', why: 'Enflasyon ivmeleniyor.', test: (w, k) => one(w.s.TRCPI?.diff(k, 6), (x) => x >= 5) },
  { id: 'tr-fx-shock', group: 'tr', label: 'Dolar/TL 12 ayda %40’tan fazla yükseldi', why: 'Kur şoku sonrası dönem.', test: (w, k) => one(w.s.USDTRY?.chg(k, 12), (x) => x >= 0.4) },
  { id: 'tr-fer-up', group: 'tr', label: 'Merkez Bankası rezervi artıyor (12 ayda %20)', why: 'Döviz girişi var: kur baskısı azalır.', test: (w, k) => one(w.s.TRFER?.chg(k, 12), (x) => x >= 0.2) },
]

export interface Era { label: string; n: number; hit?: number; base?: number; median?: number; baseMedian?: number }
export interface Pattern {
  cond: Condition
  asset: Asset
  /** Koşulun sağlandığı ay sayısı (sonucu belli) ve bağımsız dönem sayısı */
  n: number
  episodes: number
  hit: number
  base: number
  median: number
  baseMedian: number
  eras: Era[]
  /** Yön: +1 varlık lehine (olağandan iyi), −1 aleyhine */
  sign: 1 | -1
  /** Tutarlı: yeterli dönem ve örnek, her dönemde aynı yön, fark belirgin */
  consistent: boolean
  activeNow: boolean
}

const median = (a: number[]) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
/** Üç dönem: 1990 öncesi, 1990–2007, 2008 ve sonrası */
const ERA_ENDS = [1990 * 12, 2008 * 12]
const ERA_LABELS = ['1990 öncesi', '1990–2007', '2008’den beri']
const eraOf = (k: number) => (k < ERA_ENDS[0] ? 0 : k < ERA_ENDS[1] ? 1 : 2)
/** Tutarlı sayılma şartları: en az 8 bağımsız dönem, 24 ay, örneği yeterli her çağda aynı yön, isabette en az 10 puan fark */
export const MIN = { episodes: 8, months: 24, eraMonths: 12, hitDiff: 0.1 }

export function pattern(w: World, cond: Condition, asset: Asset): Pattern | undefined {
  const a = w.s[asset.id]
  if (!a) return undefined
  const rets: number[][] = [[], [], []], base: number[][] = [[], [], []]
  let episodes = 0, lastOn = -99
  for (let k = Math.max(w.first + 12, a.first); k + HORIZON <= w.now; k++) {
    const r = a.chg(k + HORIZON, HORIZON)
    const on = cond.test(w, k)
    if (r == null || on == null) continue
    const e = eraOf(k)
    base[e].push(r)
    if (on) { rets[e].push(r); if (k - lastOn > 6) episodes++; lastOn = k }
  }
  const all = rets.flat(), ball = base.flat()
  if (all.length < 6 || ball.length < 60) return undefined
  const up = (x: number[]) => x.filter((r) => r > 0).length / x.length
  const eras: Era[] = rets.map((x, e) => ({ label: ERA_LABELS[e], n: x.length, hit: x.length ? up(x) : undefined, base: base[e].length ? up(base[e]) : undefined, median: x.length ? median(x) : undefined, baseMedian: base[e].length ? median(base[e]) : undefined }))
  const hit = up(all), b = up(ball), med = median(all), bmed = median(ball)
  const sign = (med - bmed >= 0 ? 1 : -1) as 1 | -1
  // Tutarlılık: örneği yeterli her dönemde, o dönemin olağanına göre aynı yönde (ortanca getiride)
  const usable = eras.filter((e) => e.n >= MIN.eraMonths && e.median != null && e.baseMedian != null)
  const consistent = episodes >= MIN.episodes && all.length >= MIN.months && usable.length >= 2
    && usable.every((e) => Math.sign(e.median! - e.baseMedian!) === sign && Math.sign((e.hit ?? 0) - (e.base ?? 0)) === sign)
    && Math.abs(hit - b) >= MIN.hitDiff
  return { cond, asset, n: all.length, episodes, hit, base: b, median: med, baseMedian: bmed, eras, sign, consistent, activeNow: cond.test(w, w.now) === true || cond.test(w, w.now - 1) === true && cond.test(w, w.now) == null }
}

// ------------------------------------------------------------------ benzer dönemler

export interface Feature { id: string; label: string; unit: string; value: (w: World, k: number) => number | undefined; digits?: number }
export const FEATURES: Feature[] = [
  { id: 'real', label: 'ABD reel faizi', unit: 'puan', value: (w, k) => v(w, 'REAL', k) },
  { id: 'curve', label: 'Getiri eğrisi (10Y − 3A)', unit: 'puan', value: (w, k) => v(w, 'CURVE', k) },
  { id: 'fed12', label: 'Fed faizi, 12 aylık değişim', unit: 'puan', value: (w, k) => w.s.FED?.diff(k, 12) },
  { id: 'm2', label: 'ABD para arzı, yıllık', unit: '%', value: (w, k) => v(w, 'M2G', k) },
  { id: 'cpi', label: 'ABD enflasyonu', unit: '%', value: (w, k) => v(w, 'USCPI', k) },
  { id: 'cpi6', label: 'Enflasyon, 6 aylık değişim', unit: 'puan', value: (w, k) => w.s.USCPI.diff(k, 6) },
  { id: 'dxy12', label: 'Dolar endeksi, 12 aylık', unit: '%', value: (w, k) => { const x = w.s.DXY.chg(k, 12); return x != null ? x * 100 : undefined }, digits: 0 },
  { id: 'oil12', label: 'Petrol, 12 aylık', unit: '%', value: (w, k) => { const x = w.s.OIL.chg(k, 12); return x != null ? x * 100 : undefined }, digits: 0 },
  { id: 'gold12', label: 'Altın, 12 aylık', unit: '%', value: (w, k) => { const x = w.s.GOLD.chg(k, 12); return x != null ? x * 100 : undefined }, digits: 0 },
  { id: 'spx12', label: 'ABD borsası, 12 aylık', unit: '%', value: (w, k) => { const x = w.s.SPX?.chg(k, 12); return x != null ? x * 100 : undefined }, digits: 0 },
  { id: 'ur', label: 'ABD işsizliği', unit: '%', value: (w, k) => v(w, 'USUR', k) },
]

export interface Analog { month: number; distance: number; features: (number | undefined)[]; returns: Record<string, number | undefined> }
export interface Analogs { now: (number | undefined)[]; list: Analog[]; /** Varlık başına: benzer dönemlerden 12 ay sonra */ summary: Record<string, { n: number; up: number; median: number }> }

/** Bugüne en çok benzeyen [count] geçmiş ay (birbirinden en az 18 ay uzak; sonrası 12 ay belli olanlar) */
export function analogs(w: World, count = 8): Analogs {
  const rows: { k: number; f: (number | undefined)[] }[] = []
  for (let k = w.first + 13; k <= w.now; k++) rows.push({ k, f: FEATURES.map((x) => x.value(w, k)) })
  // Her özelliğin tarihsel standart sapması (ölçekleme için)
  const sd = FEATURES.map((_, j) => { const xs = rows.map((r) => r.f[j]).filter((x): x is number => x != null); const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) || 1 })
  let cur = rows[rows.length - 1]
  // Son ayın verisi eksikse (gecikmeli açıklanan seriler) bir önceki ayla tamamla
  const prev = rows[rows.length - 2]
  if (prev) cur = { k: cur.k, f: cur.f.map((x, j) => x ?? prev.f[j]) }
  const scored = rows.filter((r) => r.k + HORIZON <= w.now).map((r) => {
    let sum = 0, used = 0
    FEATURES.forEach((_, j) => { const a = cur.f[j], b = r.f[j]; if (a != null && b != null) { sum += ((a - b) / sd[j]) ** 2; used++ } })
    return { r, d: used >= FEATURES.length - 2 ? Math.sqrt(sum / used) : Infinity }
  }).filter((x) => Number.isFinite(x.d)).sort((a, b) => a.d - b.d)
  const picked: typeof scored = []
  for (const x of scored) { if (picked.length >= count) break; if (picked.every((p) => Math.abs(p.r.k - x.r.k) >= 18)) picked.push(x) }
  const list: Analog[] = picked.map((x) => ({ month: x.r.k, distance: x.d, features: x.r.f, returns: Object.fromEntries(ASSETS.map((a) => [a.id, w.s[a.id]?.chg(x.r.k + HORIZON, HORIZON)])) }))
  const summary: Analogs['summary'] = {}
  for (const a of ASSETS) { const r = list.map((x) => x.returns[a.id]).filter((x): x is number => x != null); if (r.length >= 3) summary[a.id] = { n: r.length, up: r.filter((x) => x > 0).length, median: median(r) } }
  return { now: cur.f, list, summary }
}

/** Benzer dönemden sonraki aylık seyir (grafik için): 0..12 ay, başlangıca göre getiri */
export function pathAfter(w: World, assetId: string, month: number): number[] {
  const a = w.s[assetId]; const p0 = a?.at(month)
  if (!a || !p0) return []
  const out: number[] = []
  for (let j = 0; j <= HORIZON; j++) { const p = a.at(month + j); if (p == null) break; out.push(p / p0 - 1) }
  return out
}

// ------------------------------------------------------------------ ilişkiler

export interface Relation { asset: Asset; driver: string; driverLabel: string; long: number; recent: number; n: number }
const DRIVERS: { id: string; label: string; /** fark mı (faiz, puan) yoksa oransal değişim mi */ diff: boolean }[] = [
  { id: 'DXY', label: 'Dolar endeksi', diff: false },
  { id: 'REAL', label: 'ABD reel faizi', diff: true },
  { id: 'US10Y', label: 'ABD 10 yıllık faizi', diff: true },
  { id: 'M2G', label: 'ABD para arzı büyümesi', diff: true },
  { id: 'VIX', label: 'VIX', diff: false },
  { id: 'OIL', label: 'Petrol', diff: false },
  { id: 'USCPI', label: 'ABD enflasyonu', diff: true },
]
function corr(x: number[], y: number[]): number {
  const n = x.length; if (n < 12) return NaN
  const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n
  let sxy = 0, sx = 0, sy = 0
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sx += (x[i] - mx) ** 2; sy += (y[i] - my) ** 2 }
  return sx && sy ? sxy / Math.sqrt(sx * sy) : NaN
}
/** 12 aylık değişimlerin korelasyonu: tüm geçmiş ve son 5 yıl */
export function relations(w: World): Relation[] {
  const out: Relation[] = []
  for (const asset of ASSETS) for (const d of DRIVERS) {
    if (asset.id === d.id) continue
    const a = w.s[asset.id], b = w.s[d.id]
    if (!a || !b) continue
    const xs: number[] = [], ys: number[] = [], ks: number[] = []
    // Üst üste binmeyi azaltmak için 3 ayda bir örnek
    for (let k = w.now; k >= w.first + 12; k -= 3) { const x = a.chg(k, 12), y = d.diff ? b.diff(k, 12) : b.chg(k, 12); if (x != null && y != null) { xs.push(x); ys.push(y); ks.push(k) } }
    if (xs.length < 30) continue
    const recentN = ks.filter((k) => k > w.now - 60).length
    out.push({ asset, driver: d.id, driverLabel: d.label, long: corr(xs, ys), recent: corr(xs.slice(0, recentN), ys.slice(0, recentN)), n: xs.length })
  }
  return out
}

// ------------------------------------------------------------------ özet

export interface AssetView {
  asset: Asset
  /** Şu an geçerli, tutarlı örüntüler */
  active: Pattern[]
  /** Net görünüm: lehine − aleyhine */
  score: number
  stance: 'lehine' | 'aleyhine' | 'karışık' | 'nötr'
  analog?: { n: number; up: number; median: number }
  /** Tüm ayların olağanı (12 ay sonra yukarıda olma oranı ve ortanca getiri) */
  base?: { hit: number; median: number }
}
export interface MacroView { world: World; patterns: Pattern[]; analogs: Analogs; relations: Relation[]; assets: AssetView[]; activeConditions: Condition[] }

export function macroView(d: MacroData): MacroView {
  const w = world(d)
  const patterns: Pattern[] = []
  // Türkiye'ye özgü koşullar yalnızca Türkiye varlıklarıyla eşleştirilir (yerel faiz küresel altını açıklamaz)
  for (const c of CONDITIONS) for (const a of ASSETS) { if (c.group === 'tr' && a.group !== 'tr') continue; const p = pattern(w, c, a); if (p) patterns.push(p) }
  const an = analogs(w)
  const activeConditions = CONDITIONS.filter((c) => c.test(w, w.now) === true || (c.test(w, w.now) == null && c.test(w, w.now - 1) === true))
  const assets: AssetView[] = ASSETS.filter((a) => w.s[a.id]).map((asset) => {
    const active = patterns.filter((p) => p.asset.id === asset.id && p.activeNow && p.consistent).sort((x, y) => Math.abs(y.hit - y.base) - Math.abs(x.hit - x.base))
    const pos = active.filter((p) => p.sign > 0).length, neg = active.length - pos
    const any = patterns.find((p) => p.asset.id === asset.id)
    return {
      asset, active, score: pos - neg,
      stance: !active.length ? 'nötr' : pos && neg && Math.abs(pos - neg) <= 1 && Math.min(pos, neg) > 0 ? 'karışık' : pos > neg ? 'lehine' : 'aleyhine',
      analog: an.summary[asset.id], base: any ? { hit: any.base, median: any.baseMedian } : undefined,
    }
  })
  return { world: w, patterns, analogs: an, relations: relations(w), assets, activeConditions }
}
