/**
 * Güçlü kurulumlar: tek hissenin kendi geçmişi bir sinyali güvenle sınamaya yetmediği için, az sayıda ve
 * önceden tanımlı dip/tepe kurulumu pazardaki TÜM hisselerde, üç ayrı takvim döneminde sınanır.
 * Bir kurulum ancak üç dönemin üçünde de olağandan belirgin biçimde iyi sonuç verdiyse "güçlü" sayılır ve
 * gösterilen isabet, üç dönemin EN KÖTÜSÜDÜR.
 *
 * Kurulum = hissenin durumu (günlük göstergeler) + piyasanın durumu (endeks 200 günlük ortalamasının neresinde).
 * Sonuç 63 işlem günü (yaklaşık 3 ay) sonra ölçülür: dipte fiyat yukarıda mı, tepede aşağıda mı.
 * Olağan: aynı piyasa durumundaki herhangi bir günden 63 gün sonraki sonuç.
 */
import { indicators, nextValue, rsiSeries, type Bars, type Indicator, type Series, type Side } from './signals'

export const HORIZON = 63
export const SHORT = 21
/** Aynı kurulum aynı hissede bu kadar gün içinde yeniden sayılmaz */
export const REPEAT = 21
/** Dönem sınırları (takvim): 2019 sonuna kadar, 2020–2023, 2024 ve sonrası */
export const PERIOD_ENDS = [Date.UTC(2020, 0, 1) / 1000, Date.UTC(2024, 0, 1) / 1000]
export const PERIOD_LABELS = ['2019’a kadar', '2020–2023', '2024’ten beri']
export const periodOf = (t: number) => (t < PERIOD_ENDS[0] ? 0 : t < PERIOD_ENDS[1] ? 1 : 2)

export type Regime = 'any' | 'bear' | 'bull'
export const REGIMES: Regime[] = ['bear', 'bull', 'any']
export const REGIME_LABEL: Record<Regime, string> = { any: 'piyasa hangi durumda olursa olsun', bear: 'endeks 200 günlük ortalamasının altındayken', bull: 'endeks 200 günlük ortalamasının üstündeyken' }
export const INDEX_OF = { TR: 'BIST:XU100', US: 'SP:SPX' } as const
export const INDEX_NAME = { TR: 'BIST 100', US: 'S&P 500' } as const

/**
 * Günlük göstergelere ek olarak:
 *   rsiW  haftalık ölçekte RSI
 *   vol   günün hacmi ÷ önceki 50 günün ortalama hacmi (2 = olağanın iki katı)
 *   day   günün getirisi, hissenin olağan günlük oynaklığına göre (kaç standart sapma)
 */
export type Ind = Indicator | 'rsiW' | 'vol' | 'day'
/** Koşul: bir göstergenin eşiği ya da birlikte dip/tepe gösteren gösterge sayısı */
export type Cond =
  | { kind: 'level'; ind: Ind; op: '<=' | '>='; level: number }
  | { kind: 'count'; side: Side; min: number }
export interface Setup { id: string; side: Side; label: string; conds: Cond[] }

const le = (ind: Ind, level: number): Cond => ({ kind: 'level', ind, op: '<=', level })
const ge = (ind: Ind, level: number): Cond => ({ kind: 'level', ind, op: '>=', level })
export const SETUPS: Setup[] = [
  { id: 'rsi30', side: 'dip', label: 'RSI 30’un altında', conds: [le('rsi', 30)] },
  { id: 'rsiw30', side: 'dip', label: 'Haftalık RSI 30’un altında', conds: [le('rsiW', 30)] },
  { id: 'dip3', side: 'dip', label: 'Üç gösterge birlikte dipte', conds: [{ kind: 'count', side: 'dip', min: 3 }] },
  { id: 'dip4', side: 'dip', label: 'Dört gösterge birlikte dipte', conds: [{ kind: 'count', side: 'dip', min: 4 }] },
  { id: 'dd35', side: 'dip', label: 'Zirvesinden %35 gerilemiş, RSI 30’un altında', conds: [le('dd', -0.35), le('rsi', 30)] },
  { id: 'crash', side: 'dip', label: 'Olağandışı sert düşüş (3σ)', conds: [le('roc', -3)] },
  { id: 'ma20', side: 'dip', label: '200 ortalamanın %20 altında, RSI 30’un altında', conds: [le('d200', -0.2), le('rsi', 30)] },
  // Hacimli kurulumlar: satışın ya da alımın olağandışı yoğunlaştığı günler
  { id: 'v-rsi30', side: 'dip', label: 'RSI 30’un altında, hacim olağanın 2 katı', conds: [le('rsi', 30), ge('vol', 2)] },
  { id: 'v3-rsi30', side: 'dip', label: 'RSI 30’un altında, hacim olağanın 3 katı', conds: [le('rsi', 30), ge('vol', 3)] },
  { id: 'v-crash', side: 'dip', label: 'Yüksek hacimli sert düşüş (2σ, hacim 2 katı)', conds: [le('roc', -2), ge('vol', 2)] },
  { id: 'v-dip4', side: 'dip', label: 'Dört gösterge dipte, hacim olağanın 2 katı', conds: [{ kind: 'count', side: 'dip', min: 4 }, ge('vol', 2)] },
  { id: 'v-turn', side: 'dip', label: 'Dipte yüksek hacimli güçlü yükseliş günü', conds: [le('dd', -0.25), ge('day', 1.5), ge('vol', 2)] },
  { id: 'v-turn-rsi', side: 'dip', label: 'RSI 40’ın altında, yüksek hacimli güçlü yükseliş günü', conds: [le('rsi', 40), ge('day', 1.5), ge('vol', 2)] },
  { id: 'v-quiet', side: 'dip', label: 'RSI 35’in altında, hacim olağanın yarısı (satış kurumuş)', conds: [le('rsi', 35), le('vol', 0.5)] },
  { id: 'rsi75', side: 'top', label: 'RSI 75’in üstünde', conds: [ge('rsi', 75)] },
  { id: 'rsiw75', side: 'top', label: 'Haftalık RSI 75’in üstünde', conds: [ge('rsiW', 75)] },
  { id: 'top3', side: 'top', label: 'Üç gösterge birlikte tepede', conds: [{ kind: 'count', side: 'top', min: 3 }] },
  { id: 'ma50', side: 'top', label: '200 ortalamanın %50 üstünde', conds: [ge('d200', 0.5)] },
  { id: 'spike', side: 'top', label: 'Olağandışı sert yükseliş (3σ)', conds: [ge('roc', 3)] },
  { id: 'v-rsi70', side: 'top', label: 'RSI 70’in üstünde, hacim olağanın 3 katı', conds: [ge('rsi', 70), ge('vol', 3)] },
  { id: 'v-dist', side: 'top', label: 'Zirveye yakınken yüksek hacimli sert düşüş günü', conds: [ge('dd', -0.07), le('day', -1.5), ge('vol', 2)] },
  { id: 'v-spike', side: 'top', label: 'Yüksek hacimli sert yükseliş (2σ, hacim 3 katı)', conds: [ge('roc', 2), ge('vol', 3)] },
]
/** Birlikte sayılan göstergeler */
export const DIP_FLAGS: Cond[] = [le('rsi', 30), le('bb', -2), le('dd', -0.25), le('d200', -0.1), le('roc', -2)]
export const TOP_FLAGS: Cond[] = [ge('rsi', 70), ge('bb', 2), ge('d200', 0.3), ge('roc', 2)]

export interface Ctx { c: number[]; t: number[]; s: Series; rsiW: number[]; vol: number[]; day: number[] }
export function prepare(b: Bars): Ctx {
  const { c, t } = b, n = c.length
  // Haftalık ölçekte RSI: 5 günde bir örneklenmiş kapanışlardan (her gün kendi zinciriyle)
  const rsiW = new Array<number>(n).fill(NaN)
  for (let off = 0; off < 5; off++) {
    const idx: number[] = []
    for (let i = n - 1 - off; i >= 0; i -= 5) idx.push(i)
    idx.reverse()
    const r = rsiSeries(idx.map((i) => c[i])).rsi
    idx.forEach((i, k) => { rsiW[i] = r[k] })
  }
  // Göreli hacim: önceki 50 günün ortalamasına oran (hacim verisi yoksa NaN: hacimli kurulumlar oluşmaz)
  const vol = new Array<number>(n).fill(NaN)
  if (b.v) { let sum = 0; for (let i = 0; i < n; i++) { if (i >= 50 && sum > 0) vol[i] = b.v[i] / (sum / 50); sum += b.v[i]; if (i >= 50) sum -= b.v[i - 50] } }
  // Günün getirisi ÷ önceki 100 günün günlük oynaklığı
  const day = new Array<number>(n).fill(NaN)
  { let sum = 0, sq = 0; for (let i = 1; i < n; i++) { const r = Math.log(c[i] / c[i - 1]); if (i > 100) day[i] = r / Math.sqrt(Math.max(1e-10, sq / 100 - (sum / 100) ** 2)); sum += r; sq += r * r; if (i > 100) { const o = Math.log(c[i - 100] / c[i - 101]); sum -= o; sq -= o * o } } }
  return { c, t, s: indicators(c), rsiW, vol, day }
}
const valueAt = (x: Ctx, ind: Ind, i: number) => (ind === 'rsiW' ? x.rsiW[i] : ind === 'vol' ? x.vol[i] : ind === 'day' ? x.day[i] : x.s[ind][i])
function holds(x: Ctx, c: Cond, i: number): boolean {
  if (c.kind === 'count') return (c.side === 'dip' ? DIP_FLAGS : TOP_FLAGS).filter((f) => holds(x, f, i)).length >= c.min
  const v = valueAt(x, c.ind, i)
  return !Number.isNaN(v) && (c.op === '<=' ? v <= c.level : v >= c.level)
}
export const setupHolds = (x: Ctx, s: Setup, i: number) => s.conds.every((c) => holds(x, c, i))
/** Kurulumun oluştuğu günler: koşulların sağlandığı ilk gün; [REPEAT] gün içinde yeniden sayılmaz */
export function setupDays(x: Ctx, s: Setup): number[] {
  const out: number[] = []
  for (let i = 260; i < x.c.length; i++) if (setupHolds(x, s, i) && (!out.length || i - out[out.length - 1] >= REPEAT)) out.push(i)
  return out
}

/** Endeksin günlere göre durumu: 200 günlük ortalamasının üstünde mi (gün numarası → doğru/yanlış) */
export function regimeMap(index: Bars): Map<number, boolean> {
  const m = new Map<number, boolean>()
  let sum = 0
  for (let i = 0; i < index.c.length; i++) { sum += index.c[i]; if (i >= 200) sum -= index.c[i - 200]; if (i >= 199) m.set(Math.floor(index.t[i] / 86400), index.c[i] > sum / 200) }
  return m
}
export const inRegime = (r: Regime, bull: boolean | undefined) => r === 'any' || (bull != null && (r === 'bull') === bull)

// ------------------------------------------------------------------ pazar geneli kanıt (setups.json)

/** Bir dönemdeki birleşik sonuç: [sinyal sayısı, 63 gün isabet, olağan 63, 21 gün isabet, olağan 21, ortalama 63 gün getiri, olağan getiri] */
export type PeriodStat = [n: number, hit: number, base: number, hit21: number, base21: number, ret: number, baseRet: number]
/** Kurulumdan sonraki ortalama seyir: PATH_DAYS günlerindeki ortalama getiri (kurulum ve aynı piyasa durumunun olağanı) */
export const PATH_DAYS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 63]
export interface SetupEvidence { periods: PeriodStat[]; stocks: number; path?: number[]; basePath?: number[] }
export type SetupTable = Record<string, SetupEvidence>
export const setupKey = (id: string, regime: Regime) => `${id}|${regime}`
export const STRONG = { n: 100, diff: 0.05, dipHit: 0.65, topHit: 0.55 }

export interface Strength { strong: boolean; /** Üç dönemin en kötüsü */ hit: number; base: number; n: number; worst: number; reason?: string }
/** Güçlü mü: üç dönemin üçünde de yeterli sinyal, olağandan en az 5 puan iyi ve isabet tabanının üstünde */
export function strength(e: SetupEvidence | undefined, side: Side): Strength | undefined {
  if (!e || e.periods.length < 3) return undefined
  // En zayıf dönem: farkın en küçük olduğu (neden elendiğini söylemek için); gösterilen isabet ise en düşük isabetli dönemden
  let worst = 0, low = 0
  e.periods.forEach((p, k) => { if (p[1] - p[2] < e.periods[worst][1] - e.periods[worst][2]) worst = k; if (p[1] < e.periods[low][1]) low = k })
  const minHit = e.periods[low][1]
  const w = e.periods[low]
  const n = e.periods.reduce((a, p) => a + p[0], 0)
  const floor = side === 'dip' ? STRONG.dipHit : STRONG.topHit
  const reason = e.periods.some((p) => p[0] < STRONG.n) ? 'bazı dönemlerde yeterli sinyal yok'
    : e.periods.some((p) => p[1] - p[2] < STRONG.diff) ? `${PERIOD_LABELS[worst]} döneminde olağandan iyi değildi`
      : minHit < floor ? 'isabeti yeterince yüksek değil' : undefined
  return { strong: !reason, hit: minHit, base: w[2], n, worst, reason }
}

// ------------------------------------------------------------------ hissenin şu anki durumu

export interface CondNow { label: string; ok: boolean; now: string; /** Koşulun sağlanması için sıradaki günün kapanması gereken fiyat */ trigger?: number }
export interface SetupNow {
  setup: Setup
  regime: Regime
  evidence?: SetupEvidence
  strength?: Strength
  /** Hissenin koşulları ve piyasa durumu şu an sağlanıyor mu */
  active: boolean
  stockOk: boolean
  regimeOk: boolean
  conds: CondNow[]
  /** Tek koşul eksikse o koşulun tetik fiyatına uzaklık (oran) */
  distance?: number
  /** Bu hissede kurulumun (aynı piyasa durumunda) oluştuğu günler ve 63 gün sonrası */
  events: { i: number; t: number; price: number; ret?: number; ret21?: number }[]
  ownHits: number
  ownDone: number
}

const IND_NAME: Record<Ind, string> = { vol: 'Hacim (50 günlük ortalamaya göre)', day: 'Günün hareketi', rsi: 'RSI', rsiW: 'Haftalık RSI', bb: 'Bollinger', d200: '200 ortalamaya uzaklık', dd: 'Zirveye uzaklık', roc: '5 günlük hareket', macd: 'MACD' }
const fmt = (ind: Ind, v: number) => (Number.isNaN(v) ? '—'
  : ind === 'vol' ? v.toFixed(1).replace('.', ',').replace(/,0$/, '') + ' katı'
  : ind === 'day' ? (v < 0 ? '−' : '+') + Math.abs(v).toFixed(1).replace('.', ',') + 'σ'
  : ind === 'rsi' || ind === 'rsiW' ? (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','))
    : ind === 'bb' || ind === 'roc' ? (v < 0 ? '−' : '+') + Math.abs(v).toFixed(1).replace('.', ',') + 'σ'
      : (v < 0 ? '−' : '+') + '%' + Math.abs(v * 100).toFixed(0))
export function condLabel(c: Cond): string {
  if (c.kind === 'count') return `${c.side === 'dip' ? 'Dip' : 'Tepe'} gösteren gösterge sayısı en az ${c.min}`
  return `${IND_NAME[c.ind]} ${c.op === '<=' ? '≤' : '≥'} ${fmt(c.ind, c.level)}`
}

/** Koşulun sağlanması için sıradaki kapanış (ikiye bölerek; yalnızca günlük göstergeler için) */
function condTrigger(x: Ctx, c: Cond): number | undefined {
  if (c.kind !== 'level' || c.ind === 'rsiW' || c.ind === 'macd' || c.ind === 'vol' || c.ind === 'day') return undefined
  const last = x.c[x.c.length - 1]
  let lo = last * 0.2, hi = last * 5
  const f = (p: number) => nextValue(x.c, x.s, c.ind as Indicator, p) - c.level
  if (!(f(lo) < 0 && f(hi) > 0)) return undefined
  for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (f(mid) < 0) lo = mid; else hi = mid }
  const p = (lo + hi) / 2
  return (c.op === '<=' ? p < last : p > last) ? p : undefined
}

export interface StockSetups { /** Hissenin günlük göstergeleri (grafikler için) */ ctx: Ctx; regimeNow?: boolean; list: SetupNow[]; /** Öne çıkan: açık olan güçlü kurulum ya da en yakın güçlü kurulum */ lead?: SetupNow }

export function stockSetups(bars: Bars, index: Bars | undefined, table: SetupTable | undefined): StockSetups {
  const x = prepare(bars)
  const n = x.c.length - 1
  const reg = index ? regimeMap(index) : undefined
  const bullAt = (i: number) => reg?.get(Math.floor(x.t[i] / 86400))
  // Bugünün piyasa durumu: endeksin son bilinen günü
  let regimeNow: boolean | undefined
  if (reg && index) regimeNow = reg.get(Math.floor(index.t[index.t.length - 1] / 86400))
  const list: SetupNow[] = []
  for (const setup of SETUPS) {
    const days = setupDays(x, setup)
    const conds: CondNow[] = setup.conds.map((c) => {
      if (c.kind === 'count') { const k = (c.side === 'dip' ? DIP_FLAGS : TOP_FLAGS).filter((f) => holds(x, f, n)).length; return { label: condLabel(c), ok: k >= c.min, now: `şu an ${k}` } }
      return { label: condLabel(c), ok: holds(x, c, n), now: `şu an ${fmt(c.ind, valueAt(x, c.ind, n))}`, trigger: holds(x, c, n) ? undefined : condTrigger(x, c) }
    })
    const stockOk = conds.every((c) => c.ok)
    const missing = conds.filter((c) => !c.ok)
    for (const regime of REGIMES) {
      const evidence = table?.[setupKey(setup.id, regime)]
      const st = strength(evidence, setup.side)
      const regimeOk = inRegime(regime, regimeNow)
      const events = days.filter((i) => inRegime(regime, bullAt(i))).map((i) => ({ i, t: x.t[i], price: x.c[i], ret: i + HORIZON <= n ? x.c[i + HORIZON] / x.c[i] - 1 : undefined, ret21: i + SHORT <= n ? x.c[i + SHORT] / x.c[i] - 1 : undefined }))
      const done = events.filter((e) => e.ret != null)
      list.push({
        setup, regime, evidence, strength: st, active: stockOk && regimeOk, stockOk, regimeOk, conds,
        distance: missing.length === 1 && missing[0].trigger != null ? missing[0].trigger / x.c[n] - 1 : undefined,
        events, ownDone: done.length, ownHits: done.filter((e) => (e.ret! > 0) === (setup.side === 'dip')).length,
      })
    }
  }
  // Aynı kurulumun üç piyasa durumundan, bugünkü duruma uyan ve en güçlü olanı öne alınır
  const strong = list.filter((s) => s.strength?.strong && s.regimeOk)
  const rank = (s: SetupNow) => (s.strength!.hit - s.strength!.base) + (s.regime === 'any' ? 0 : 0.001)
  const lead = strong.filter((s) => s.active).sort((a, b) => rank(b) - rank(a))[0]
    ?? strong.filter((s) => s.distance != null).sort((a, b) => Math.abs(a.distance!) - Math.abs(b.distance!))[0]
  return { ctx: x, regimeNow, list, lead }
}
