/**
 * Olay incelemesi (her varlık, her zaman dilimi): "bu olay geçmişte ne zaman oldu, sonrasında ne oldu?"
 *
 * Girdi: bir varlığın mumları (aylık, haftalık ya da günlük; hacim varsa hacimle).
 * Olay: bir durumun BAŞLADIĞI mum (sert hareket, ortalamanın kırılması, RSI'ın 30'un altına inmesi, hacimli satış…).
 * Çıktı: olayın tüm geçmiş gerçekleşmeleri ve sonraki dört vadede yön olasılığı (yukarıda olma oranı, güven aralığı,
 * ortanca, yukarı ve aşağı ortalama hareket), tüm mumların olağan oranıyla birlikte.
 *
 * Olay yakın zamanda gerçekleştiyse olasılıklar "bugünden sonrası" için verilir: geçmişteki her örnekte olaydan
 * aynı süre geçtikten sonraki dönem ölçülür. İki olay birlikte gerçekleştiyse ortak geçmişleri ayrıca ölçülür.
 *
 * Güvenilirlik: bir bulgu ancak en az 8 örnek, olağandan en az 12 puan fark, %95 güven aralığının olağan oranı
 * dışarıda bırakması ve geçmişin iki yarısında da aynı yönde olmasıyla "belirgin" sayılır. Rastgele seride bu
 * şartları sağlayan hücre oranı %5'in altındadır (testle doğrulanır). Örnek azdır; her oranın yanında örnek sayısı ve güven aralığı durur.
 */
export type Tf = 'M' | 'W' | 'D'
export interface OHLCV { t: number[]; o: number[]; h: number[]; l: number[]; c: number[]; v?: number[] }

export const TF_LABEL: Record<Tf, string> = { M: 'Aylık', W: 'Haftalık', D: 'Günlük' }
export const TF_UNIT: Record<Tf, string> = { M: 'ay', W: 'hafta', D: 'gün' }
/** Sonrası ölçülen dört vade (mum sayısı) ve adları */
export const HORIZONS: Record<Tf, number[]> = { M: [1, 3, 6, 12], W: [4, 13, 26, 52], D: [5, 21, 63, 126] }
export const HORIZON_LABEL: Record<Tf, string[]> = { M: ['1 ay', '3 ay', '6 ay', '12 ay'], W: ['1 ay', '3 ay', '6 ay', '1 yıl'], D: ['1 hafta', '1 ay', '3 ay', '6 ay'] }
/** "Son dönem": olayın bu kadar mum içinde gerçekleşmiş olması; aynı olayın iki başlangıcı arasında en az bu kadar mum */
export const RECENT: Record<Tf, number> = { M: 6, W: 8, D: 15 }
export const RECENT_LABEL: Record<Tf, string> = { M: 'son 6 ay', W: 'son 8 hafta', D: 'son 15 işlem günü' }
/** Zaman dilimine göre pencereler: uzun ortalama, kısa ortalama, oynaklık, 1 yıl, 3 yıl, zirve (2 yıl), kısa hareket */
const WIN: Record<Tf, { long: number; short: number; vol: number; year: number; y3: number; peak: number; burst: number; streak: number }> = {
  M: { long: 10, short: 3, vol: 36, year: 12, y3: 36, peak: 24, burst: 3, streak: 4 },
  W: { long: 43, short: 13, vol: 52, year: 52, y3: 156, peak: 104, burst: 4, streak: 4 },
  D: { long: 200, short: 50, vol: 100, year: 250, y3: 750, peak: 500, burst: 5, streak: 5 },
}
export const LONG_MA_LABEL: Record<Tf, string> = { M: '10 aylık ortalama', W: '43 haftalık ortalama', D: '200 günlük ortalama' }

export interface Ctx {
  tf: Tf; n: number
  t: number[]; o: number[]; h: number[]; l: number[]; c: number[]; v?: number[]
  /** Tek mumluk getiri ve önceki pencerenin oynaklığı (o mum hariç) */
  ret: number[]; vol: number[]
  ma: number[]; maShort: number[]
  rsi: number[]; bbz: number[]
  /** MACD çizgisi ve histogramı (÷ fiyat) */
  macd: number[]; hist: number[]
  /** Son 2 yılın en yüksek kapanışına uzaklık (oran) */
  dd: number[]
  /** Hacim ÷ önceki 20 mumun ortalaması (hacim yoksa NaN) */
  rvol: number[]
  /** İstatistik için kullanılabilir ilk mum (göstergeler oturduktan ve fiyat hareket etmeye başladıktan sonra) */
  start: number
}

function sma(c: number[], n: number): number[] {
  const out = new Array<number>(c.length).fill(NaN); let s = 0
  for (let i = 0; i < c.length; i++) { s += c[i]; if (i >= n) s -= c[i - n]; if (i >= n - 1) out[i] = s / n }
  return out
}
export function prepare(b: OHLCV, tf: Tf): Ctx {
  const { c } = b, n = c.length, w = WIN[tf]
  const ret = new Array<number>(n).fill(NaN), vol = new Array<number>(n).fill(NaN)
  for (let i = 1; i < n; i++) ret[i] = c[i] / c[i - 1] - 1
  { let s = 0, q = 0, k = 0; for (let i = 1; i < n; i++) { if (k >= w.vol) vol[i] = Math.sqrt(Math.max(1e-12, q / k - (s / k) ** 2)); s += ret[i]; q += ret[i] ** 2; k++; if (k > w.vol) { s -= ret[i - w.vol]; q -= ret[i - w.vol] ** 2; k-- } } }
  // Wilder RSI (14)
  const rsi = new Array<number>(n).fill(NaN)
  if (n > 14) { let g = 0, l = 0; for (let i = 1; i <= 14; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d }; g /= 14; l /= 14; rsi[14] = l === 0 ? 100 : 100 - 100 / (1 + g / l); for (let i = 15; i < n; i++) { const d = c[i] - c[i - 1]; g = (g * 13 + Math.max(d, 0)) / 14; l = (l * 13 + Math.max(-d, 0)) / 14; rsi[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l) } }
  // Bollinger: kapanışın 20 mumluk ortalamadan kaç standart sapma uzakta olduğu
  const bbz = new Array<number>(n).fill(NaN)
  { let s = 0, q = 0; for (let i = 0; i < n; i++) { s += c[i]; q += c[i] ** 2; if (i >= 20) { s -= c[i - 20]; q -= c[i - 20] ** 2 }; if (i >= 19) { const m = s / 20, sd = Math.sqrt(Math.max(0, q / 20 - m * m)); bbz[i] = sd > 0 ? (c[i] - m) / sd : NaN } } }
  const macd = new Array<number>(n).fill(NaN), hist = new Array<number>(n).fill(NaN)
  { let e12 = c[0], e26 = c[0], sig = 0; for (let i = 1; i < n; i++) { e12 += (c[i] - e12) * (2 / 13); e26 += (c[i] - e26) * (2 / 27); const m = e12 - e26; sig += (m - sig) * 0.2; if (i >= 40) { macd[i] = m / c[i]; hist[i] = (m - sig) / c[i] } } }
  const dd = new Array<number>(n).fill(NaN)
  for (let i = Math.min(n, 20); i < n; i++) { let m = 0; for (let j = Math.max(0, i - w.peak + 1); j <= i; j++) if (c[j] > m) m = c[j]; dd[i] = c[i] / m - 1 }
  const rvol = new Array<number>(n).fill(NaN)
  if (b.v) { let s = 0; for (let i = 0; i < n; i++) { const x = b.v[i]; if (i >= 20 && s > 0 && x > 0) rvol[i] = x / (s / 20); s += x > 0 ? x : 0; if (i >= 20) s -= b.v[i - 20] > 0 ? b.v[i - 20] : 0 } }
  // Fiyatın art arda 6 mum değiştiği ilk nokta (sabit fiyatlı eski dönemler atlanır)
  let first = 0, run = 0
  for (let i = 1; i < n; i++) { run = ret[i] !== 0 ? run + 1 : 0; if (run >= 6) { first = i - 6; break } }
  return { tf, n, t: b.t, o: b.o, h: b.h, l: b.l, c, v: b.v, ret, vol, ma: sma(c, w.long), maShort: sma(c, w.short), rsi, bbz, macd, hist, dd, rvol, start: first + w.vol + 2 }
}

// ------------------------------------------------------------------ olay tanımları

export type EventGroup = 'fiyat' | 'trend' | 'gösterge' | 'hacim' | 'makro' | 'özel'
export const GROUP_LABEL: Record<EventGroup, string> = { fiyat: 'Fiyat hareketi', trend: 'Trend ve düzeyler', gösterge: 'Göstergeler', hacim: 'Hacim', makro: 'Makro durumların başlaması', özel: 'Kendi olaylarım' }
export interface EventDef {
  id: string
  /** Cümlenin yüklemi: "bir mumda olağandışı sert düştü" (özne varlıktır); makro olaylarda tam cümle */
  label: string
  group: EventGroup
  /** Makro olay: özne varlık değildir */
  standalone?: boolean
  /** Durum [i] mumunda geçerli mi; olay, durumun başladığı mumdur */
  state: (x: Ctx, i: number) => boolean | undefined
  /** Başlangıç mumundaki büyüklük (cümle için) */
  detail?: (x: Ctx, i: number) => string | undefined
  /** Hacim gerektirir */
  needsVolume?: boolean
}

const pctS = (v: number, d = 0) => (v >= 0 ? '+' : '−') + '%' + Math.abs(v * 100).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d })
const nan = (v: number) => v == null || Number.isNaN(v)
const moveN = (x: Ctx, i: number, k: number) => (i >= k ? x.c[i] / x.c[i - k] - 1 : NaN)
function extreme(x: Ctx, i: number, n: number, hi: boolean): boolean | undefined {
  if (i < n) return undefined
  const p = x.c[i]
  for (let j = 1; j < n; j++) if (hi ? x.c[i - j] >= p : x.c[i - j] <= p) return false
  return true
}
function streak(x: Ctx, i: number, up: boolean): number { let k = 0; for (let j = i; j > 0 && j > i - 12; j--) { if (up ? x.ret[j] > 0 : x.ret[j] < 0) k++; else break }; return k }
const unit = (x: Ctx) => TF_UNIT[x.tf]

/** Zaman dilimine göre metin: "bir ayda", "5 günde" */
const oneBar = (tf: Tf) => (tf === 'M' ? 'bir ayda' : tf === 'W' ? 'bir haftada' : 'bir günde')
const burstBars = (tf: Tf) => `${WIN[tf].burst} ${TF_UNIT[tf] === 'gün' ? 'günde' : TF_UNIT[tf] === 'hafta' ? 'haftada' : 'ayda'}`

export function eventDefs(tf: Tf): EventDef[] {
  const w = WIN[tf]
  const sharp = (dir: 1 | -1, k: number) => (x: Ctx, i: number) => { const m = moveN(x, i, k), v = x.vol[i]; return nan(m) || nan(v) ? undefined : dir * m >= 2 * v * Math.sqrt(k) }
  return [
    { id: 'drop', group: 'fiyat', label: `${oneBar(tf)} olağandışı sert düştü`, state: sharp(-1, 1), detail: (x, i) => pctS(x.ret[i], 1) },
    { id: 'jump', group: 'fiyat', label: `${oneBar(tf)} olağandışı sert yükseldi`, state: sharp(1, 1), detail: (x, i) => pctS(x.ret[i], 1) },
    { id: 'drop-n', group: 'fiyat', label: `${burstBars(tf)} sert düştü`, state: sharp(-1, w.burst), detail: (x, i) => pctS(moveN(x, i, w.burst), 0) },
    { id: 'jump-n', group: 'fiyat', label: `${burstBars(tf)} sert yükseldi`, state: sharp(1, w.burst), detail: (x, i) => pctS(moveN(x, i, w.burst), 0) },
    { id: 'down-streak', group: 'fiyat', label: `art arda ${w.streak} ${unit({ tf } as Ctx)} düştü`, state: (x, i) => streak(x, i, false) >= w.streak },
    { id: 'up-streak', group: 'fiyat', label: `art arda ${w.streak} ${unit({ tf } as Ctx)} yükseldi`, state: (x, i) => streak(x, i, true) >= w.streak },
    { id: 'trend-down', group: 'trend', label: `${LONG_MA_LABEL[tf]}sının altına indi (trend kırıldı)`, state: (x, i) => (nan(x.ma[i]) ? undefined : x.c[i] < x.ma[i]) },
    { id: 'trend-up', group: 'trend', label: `${LONG_MA_LABEL[tf]}sının üstüne çıktı (trend döndü)`, state: (x, i) => (nan(x.ma[i]) ? undefined : x.c[i] > x.ma[i]) },
    { id: 'death-cross', group: 'trend', label: 'kısa ortalama uzun ortalamanın altına indi', state: (x, i) => (nan(x.ma[i]) || nan(x.maShort[i]) ? undefined : x.maShort[i] < x.ma[i]) },
    { id: 'golden-cross', group: 'trend', label: 'kısa ortalama uzun ortalamanın üstüne çıktı', state: (x, i) => (nan(x.ma[i]) || nan(x.maShort[i]) ? undefined : x.maShort[i] > x.ma[i]) },
    { id: 'high-1y', group: 'trend', label: '1 yılın en yüksek kapanışını yaptı', state: (x, i) => extreme(x, i, w.year, true) },
    { id: 'low-1y', group: 'trend', label: '1 yılın en düşük kapanışını yaptı', state: (x, i) => extreme(x, i, w.year, false) },
    { id: 'high-3y', group: 'trend', label: '3 yılın zirvesine çıktı', state: (x, i) => extreme(x, i, w.y3, true) },
    { id: 'dd10', group: 'trend', label: 'zirvesinden %10’dan fazla geriledi', state: (x, i) => (nan(x.dd[i]) ? undefined : x.dd[i] <= -0.1), detail: (x, i) => 'zirveden ' + pctS(x.dd[i], 0) },
    { id: 'dd20', group: 'trend', label: 'zirvesinden %20’den fazla geriledi', state: (x, i) => (nan(x.dd[i]) ? undefined : x.dd[i] <= -0.2), detail: (x, i) => 'zirveden ' + pctS(x.dd[i], 0) },
    { id: 'dd35', group: 'trend', label: 'zirvesinden %35’ten fazla geriledi', state: (x, i) => (nan(x.dd[i]) ? undefined : x.dd[i] <= -0.35), detail: (x, i) => 'zirveden ' + pctS(x.dd[i], 0) },
    { id: 'rsi-30', group: 'gösterge', label: 'RSI 30’un altına indi (aşırı satım)', state: (x, i) => (nan(x.rsi[i]) ? undefined : x.rsi[i] < 30), detail: (x, i) => 'RSI ' + x.rsi[i].toFixed(0) },
    { id: 'rsi-30-back', group: 'gösterge', label: 'RSI aşırı satımdan çıktı (30’un üstüne döndü)', state: (x, i) => { if (nan(x.rsi[i])) return undefined; if (x.rsi[i] < 30) return false; for (let j = 1; j <= 3; j++) if (x.rsi[i - j] < 30) return true; return false } },
    { id: 'rsi-70', group: 'gösterge', label: 'RSI 70’in üstüne çıktı (aşırı alım)', state: (x, i) => (nan(x.rsi[i]) ? undefined : x.rsi[i] > 70), detail: (x, i) => 'RSI ' + x.rsi[i].toFixed(0) },
    { id: 'rsi-70-back', group: 'gösterge', label: 'RSI aşırı alımdan çıktı (70’in altına döndü)', state: (x, i) => { if (nan(x.rsi[i])) return undefined; if (x.rsi[i] > 70) return false; for (let j = 1; j <= 3; j++) if (x.rsi[i - j] > 70) return true; return false } },
    { id: 'bb-low', group: 'gösterge', label: 'Bollinger alt bandının altında kapandı', state: (x, i) => (nan(x.bbz[i]) ? undefined : x.bbz[i] < -2) },
    { id: 'bb-high', group: 'gösterge', label: 'Bollinger üst bandının üstünde kapandı', state: (x, i) => (nan(x.bbz[i]) ? undefined : x.bbz[i] > 2) },
    { id: 'macd-up', group: 'gösterge', label: 'MACD sıfırın altında yukarı kesti', state: (x, i) => (nan(x.hist[i]) ? undefined : x.hist[i] > 0 && x.macd[i] < 0) },
    { id: 'macd-down', group: 'gösterge', label: 'MACD sıfırın üstünde aşağı kesti', state: (x, i) => (nan(x.hist[i]) ? undefined : x.hist[i] < 0 && x.macd[i] > 0) },
    { id: 'vol-sell', group: 'hacim', needsVolume: true, label: 'olağanın 2,5 katı hacimle sert düştü', state: (x, i) => (nan(x.rvol[i]) || nan(x.vol[i]) ? undefined : x.rvol[i] >= 2.5 && x.ret[i] <= -x.vol[i]), detail: (x, i) => `${pctS(x.ret[i], 1)}, hacim ${x.rvol[i].toFixed(1).replace('.', ',')} katı` },
    { id: 'vol-buy', group: 'hacim', needsVolume: true, label: 'olağanın 2,5 katı hacimle sert yükseldi', state: (x, i) => (nan(x.rvol[i]) || nan(x.vol[i]) ? undefined : x.rvol[i] >= 2.5 && x.ret[i] >= x.vol[i]), detail: (x, i) => `${pctS(x.ret[i], 1)}, hacim ${x.rvol[i].toFixed(1).replace('.', ',')} katı` },
    { id: 'vol-dry', group: 'hacim', needsVolume: true, label: 'düşüşte hacim kurudu (RSI 40’ın altında, hacim olağanın yarısı)', state: (x, i) => (nan(x.rvol[i]) || nan(x.rsi[i]) ? undefined : x.rvol[i] <= 0.5 && x.rsi[i] < 40) },
  ]
}

// ------------------------------------------------------------------ kendi olayım

export type CustomInd = 'rsi' | 'bbz' | 'ma' | 'dd' | 'move' | 'rvol' | 'ret'
export const CUSTOM_IND: Record<CustomInd, { label: string; unit: string; hint: string }> = {
  rsi: { label: 'RSI (14)', unit: '', hint: '0–100; 30 altı aşırı satım, 70 üstü aşırı alım' },
  bbz: { label: 'Bollinger (standart sapma)', unit: 'σ', hint: '−2 alt bant, +2 üst bant' },
  ma: { label: 'Uzun ortalamaya uzaklık', unit: '%', hint: 'fiyat ortalamanın yüzde kaç üstünde (+) ya da altında (−)' },
  dd: { label: 'Zirveden uzaklık', unit: '%', hint: 'son 2 yılın zirvesine göre; −20 = zirvenin %20 altında' },
  move: { label: 'Kısa dönem hareket', unit: 'σ', hint: 'son birkaç mumun getirisi, olağan oynaklığa göre; −2 sert düşüş' },
  ret: { label: 'Tek mumun getirisi', unit: '%', hint: 'son mumun yüzde değişimi' },
  rvol: { label: 'Hacim (olağana oran)', unit: 'kat', hint: '2 = olağanın iki katı' },
}
export interface CustomCond { ind: CustomInd; op: 'below' | 'above'; level: number }
export interface CustomSpec { id: string; name: string; trigger: CustomCond; /** Tetiklendiği anda ayrıca geçerli olması gereken durum */ when?: CustomCond }
function indValue(x: Ctx, ind: CustomInd, i: number): number {
  const w = WIN[x.tf]
  if (ind === 'rsi') return x.rsi[i]
  if (ind === 'bbz') return x.bbz[i]
  if (ind === 'ma') return (x.c[i] / x.ma[i] - 1) * 100
  if (ind === 'dd') return x.dd[i] * 100
  if (ind === 'ret') return x.ret[i] * 100
  if (ind === 'rvol') return x.rvol[i]
  return moveN(x, i, w.burst) / (x.vol[i] * Math.sqrt(w.burst))
}
const condHolds = (x: Ctx, c: CustomCond, i: number) => { const v = indValue(x, c.ind, i); return nan(v) ? undefined : c.op === 'below' ? v < c.level : v > c.level }
const condText = (c: CustomCond) => `${CUSTOM_IND[c.ind].label} ${c.level.toLocaleString('tr-TR')}${CUSTOM_IND[c.ind].unit === '%' ? '%' : CUSTOM_IND[c.ind].unit ? ' ' + CUSTOM_IND[c.ind].unit : ''} ${c.op === 'below' ? 'altına indi' : 'üstüne çıktı'}`
export const customLabel = (s: CustomSpec) => condText(s.trigger) + (s.when ? `; o sırada ${CUSTOM_IND[s.when.ind].label} ${s.when.level.toLocaleString('tr-TR')} ${s.when.op === 'below' ? 'altında' : 'üstünde'}` : '')
export function customEvent(s: CustomSpec): EventDef {
  return {
    id: 'c:' + s.id, group: 'özel', standalone: true, label: s.name || customLabel(s), needsVolume: s.trigger.ind === 'rvol' || s.when?.ind === 'rvol',
    // Tetik durumu başladığında ve (varsa) ek durum o mumda geçerliyken
    state: (x, i) => { const a = condHolds(x, s.trigger, i); if (a == null) return undefined; if (!a) return false; if (!s.when) return true; const b = condHolds(x, s.when, i); return b == null ? undefined : b },
  }
}
export function sanitizeCustom(raw: unknown): CustomSpec[] {
  if (!Array.isArray(raw)) return []
  const cond = (c: unknown): CustomCond | undefined => { const o = c as Record<string, unknown> | null; return o && typeof o.ind === 'string' && o.ind in CUSTOM_IND && (o.op === 'below' || o.op === 'above') && typeof o.level === 'number' && Number.isFinite(o.level) ? { ind: o.ind as CustomInd, op: o.op, level: o.level } : undefined }
  const out: CustomSpec[] = []
  for (const r of raw as Record<string, unknown>[]) { const t = cond(r?.trigger); if (!t || typeof r.id !== 'string') continue; out.push({ id: r.id.slice(0, 16), name: typeof r.name === 'string' ? r.name.slice(0, 80) : '', trigger: t, when: cond(r.when) }) }
  return out.slice(0, 20)
}

// ------------------------------------------------------------------ istatistik

export interface HorizonStat {
  bars: number; label: string
  n: number
  /** Yukarıda olma oranı ve %80 güven aralığı */
  up: number; lo: number; hi: number
  median: number; q25: number; q75: number
  /** Yukarıda bitenlerin ve aşağıda bitenlerin ortalama getirisi */
  avgUp: number; avgDown: number
  /** Tüm mumların olağanı */
  base: number; baseMedian: number
  /** Geçmişin iki yarısında da olağana göre aynı yönde mi */
  consistent: boolean
  /** Belirgin: en az 8 örnek, en az 12 puan fark, %95 güven aralığı olağan oranı dışarıda bırakıyor, iki yarıda tutarlı */
  clear: boolean
}
const quant = (s: number[], p: number) => { if (!s.length) return NaN; const i = p * (s.length - 1), a = Math.floor(i), b = Math.ceil(i); return s[a] + (s[b] - s[a]) * (i - a) }
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN)
export function wilson(hits: number, n: number, z = 1.28): [number, number] {
  if (!n) return [0, 1]
  const p = hits / n, z2 = z * z, c = (p + z2 / (2 * n)) / (1 + z2 / n), h = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / (1 + z2 / n)
  return [Math.max(0, c - h), Math.min(1, c + h)]
}
const baseCache = new WeakMap<Ctx, Map<number, { up: number; median: number }>>()
function baseline(x: Ctx, h: number) {
  let m = baseCache.get(x); if (!m) { m = new Map(); baseCache.set(x, m) }
  let b = m.get(h)
  if (!b) { const r: number[] = []; for (let i = x.start; i + h < x.n; i++) r.push(x.c[i + h] / x.c[i] - 1); r.sort((p, q) => p - q); b = { up: r.filter((v) => v > 0).length / Math.max(1, r.length), median: quant(r, 0.5) }; m.set(h, b) }
  return b
}
export const MIN_CLEAR = { n: 8, diff: 0.12 }
/** [starts] mumlarından [h] mum sonrası (her biri [shift] mum ötelenerek) */
function horizonStat(x: Ctx, starts: number[], shift: number, h: number, label: string): HorizonStat {
  const rets: { r: number; i: number }[] = []
  for (const s of starts) { const a = s + shift, b = a + h; if (a >= 0 && b < x.n) rets.push({ r: x.c[b] / x.c[a] - 1, i: s }) }
  const r = rets.map((v) => v.r).sort((p, q) => p - q)
  const hits = r.filter((v) => v > 0).length
  const [lo, hi] = wilson(hits, r.length)
  const b = baseline(x, h)
  const up = r.length ? hits / r.length : NaN
  // İki yarı: örnekler zaman sırasıyla ikiye bölünür
  const half = rets.length >> 1
  const rate = (list: typeof rets) => (list.length ? list.filter((v) => v.r > 0).length / list.length : NaN)
  const d = up - b.up, d1 = rate(rets.slice(0, half)) - b.up, d2 = rate(rets.slice(half)) - b.up
  const consistent = half >= 3 && Math.sign(d1) === Math.sign(d) && Math.sign(d2) === Math.sign(d) && d !== 0
  return {
    bars: h, label, n: r.length, up, lo, hi, median: quant(r, 0.5), q25: quant(r, 0.25), q75: quant(r, 0.75),
    avgUp: mean(r.filter((v) => v > 0)), avgDown: mean(r.filter((v) => v <= 0)), base: b.up, baseMedian: b.median,
    consistent, clear: r.length >= MIN_CLEAR.n && Math.abs(d) >= MIN_CLEAR.diff && consistent && (() => { const [l95, h95] = wilson(hits, r.length, 1.96); return b.up < l95 || b.up > h95 })(),
  }
}

export interface Occurrence {
  /** Olayın gerçekleştiği mum ve bugüne kadar geçen mum sayısı */
  index: number; elapsed: number
  detail?: string
  /** Olaydan bugüne getiri */
  since?: number
  /** Bugünden sonraki dört vade: geçmiş örneklerde olaydan aynı süre geçtikten sonrası */
  stats: HorizonStat[]
  /** Geçmiş örneklerin olaydan sonraki seyri (grafik) ve bu seferki seyir */
  paths: { index: number; path: number[] }[]
  current: number[]
}
export interface Study {
  def: EventDef
  /** Olayın tüm başlangıç mumları */
  onsets: number[]
  /** Olay mumundan sonraki dört vade (tüm örnekler) */
  stats: HorizonStat[]
  /** Her başlangıcın dört vadedeki getirisi */
  outcomes: Map<number, (number | undefined)[]>
  /** Son dönemde gerçekleştiyse */
  recent?: Occurrence
  /** Görüntülenecek istatistik: son dönemde olduysa bugünden sonrası, değilse olaydan sonrası */
  view: HorizonStat[]
  /** En çok ayrışan belirgin vade */
  best?: HorizonStat
}

/** Olayın başlangıç mumları: durum yanlıştan doğruya geçtiğinde; aralarında en az RECENT mum */
export function onsets(x: Ctx, def: EventDef): number[] {
  const out: number[] = []
  if (def.needsVolume && !x.v) return out
  for (let i = Math.max(1, x.start); i < x.n; i++) {
    if (def.state(x, i) === true && def.state(x, i - 1) === false && (!out.length || i - out[out.length - 1] >= RECENT[x.tf])) out.push(i)
  }
  return out
}

export function study(x: Ctx, def: EventDef, given?: number[]): Study {
  const all = given ?? onsets(x, def)
  const hs = HORIZONS[x.tf], labels = HORIZON_LABEL[x.tf]
  const outcomes = new Map<number, (number | undefined)[]>()
  for (const i of all) outcomes.set(i, hs.map((h) => (i + h < x.n ? x.c[i + h] / x.c[i] - 1 : undefined)))
  const stats = hs.map((h, k) => horizonStat(x, all, 0, h, labels[k]))
  const last = all[all.length - 1]
  let recent: Occurrence | undefined
  if (last != null && x.n - 1 - last <= RECENT[x.tf]) {
    const elapsed = x.n - 1 - last, history = all.slice(0, -1)
    const span = elapsed + hs[hs.length - 1]
    const paths = history.map((i) => { const path: number[] = []; for (let j = 0; j <= span && i + j < x.n; j++) path.push(x.c[i + j] / x.c[i] - 1); return { index: i, path } }).filter((p) => p.path.length > elapsed + 1)
    const current: number[] = []; for (let j = 0; j <= elapsed; j++) current.push(x.c[last + j] / x.c[last] - 1)
    recent = { index: last, elapsed, detail: def.detail?.(x, last), since: elapsed > 0 ? x.c[x.n - 1] / x.c[last] - 1 : undefined, stats: hs.map((h, k) => horizonStat(x, history, elapsed, h, labels[k])), paths, current }
  }
  const view = recent ? recent.stats : stats
  const best = view.filter((s) => s.clear).sort((a, b) => Math.abs(b.up - b.base) - Math.abs(a.up - a.base))[0]
  return { def, onsets: all, stats, outcomes, recent, view, best }
}

/** Son dönemde gerçekleşmiş olaylar (en belirgin olan önce) */
export function recentStudies(x: Ctx, defs: EventDef[]): Study[] {
  const w = (s: Study) => (s.best ? Math.abs(s.best.up - s.best.base) * Math.sqrt(s.best.n) : 0)
  return defs.map((d) => study(x, d)).filter((s) => s.recent).sort((a, b) => w(b) - w(a) || a.recent!.elapsed - b.recent!.elapsed)
}

export interface Joint { a: EventDef; b: EventDef; /** Birlikte gerçekleştikleri geçmiş anlar (ikisinden sonraki mum) */ anchors: number[]; elapsed: number; stats: HorizonStat[]; best?: HorizonStat }
/**
 * İki olay birlikte: geçmişte A ile B'nin RECENT mum içinde birlikte başladığı anlar bulunur (çıpa: geç olanın mumu)
 * ve bugünkü konuma karşılık gelen noktadan sonrası ölçülür. Bu seferki birliktelik hariç.
 */
export function joint(x: Ctx, a: Study, b: Study): Joint | undefined {
  if (!a.recent || !b.recent) return undefined
  const win = RECENT[x.tf], anchors: number[] = []
  let k = 0
  for (const i of a.onsets) {
    while (k < b.onsets.length && b.onsets[k] < i - win) k++
    for (let j = k; j < b.onsets.length && b.onsets[j] <= i + win; j++) { const anchor = Math.max(i, b.onsets[j]); if (!anchors.length || anchor - anchors[anchors.length - 1] >= win) anchors.push(anchor); break }
  }
  const nowAnchor = Math.max(a.recent.index, b.recent.index)
  const history = anchors.filter((i) => i < nowAnchor - win)
  if (history.length < 5) return undefined
  const elapsed = x.n - 1 - nowAnchor
  const stats = HORIZONS[x.tf].map((h, i) => horizonStat(x, history, elapsed, h, HORIZON_LABEL[x.tf][i]))
  return { a: a.def, b: b.def, anchors: history, elapsed, stats, best: stats.filter((s) => s.clear).sort((p, q) => Math.abs(q.up - q.base) - Math.abs(p.up - p.base))[0] }
}
/** Son dönem olaylarının ikili birliktelikleri (yeterli geçmişi olanlar; en belirgin önce) */
export function joints(x: Ctx, recent: Study[]): Joint[] {
  const out: Joint[] = []
  const list = recent.slice(0, 8)
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) { const r = joint(x, list[i], list[j]); if (r) out.push(r) }
  return out.sort((p, q) => Math.abs((q.best?.up ?? q.stats[2].up) - (q.best?.base ?? q.stats[2].base)) - Math.abs((p.best?.up ?? p.stats[2].up) - (p.best?.base ?? p.stats[2].base))).slice(0, 4)
}

/** Olayın cümlesi: "Altın bir ayda olağandışı sert düştü (−%9,2)" */
export function sentence(subject: string, s: Study): string {
  const d = s.recent?.detail
  return (s.def.standalone ? s.def.label : `${subject} ${s.def.label}`) + (d ? ` (${d})` : '')
}
/** "3 gün önce", "bu hafta" */
export function agoLabel(tf: Tf, elapsed: number): string {
  if (elapsed === 0) return tf === 'M' ? 'bu ay' : tf === 'W' ? 'bu hafta' : 'son işlem günü'
  return `${elapsed} ${TF_UNIT[tf]} önce`
}
