/**
 * Alarmlar: tek bir yerden kurulan üç tür uyarı.
 *   price    Fiyat bir düzeyin altına iner ya da üstüne çıkar
 *   premium  Altın/gümüş ürünü değerinin altına iner (al sinyali) ya da bir birikim/para arzı önerisi güçlenir
 *   signal   Hissede tarihsel teyitli bir dip ya da tepe sinyali gelir
 * Aynı kod hem uygulamada (açıkken) hem sunucuda (GitHub Actions, uygulama kapalıyken) çalışır;
 * veriyi dışarıdan verilen kaynak (Source) getirir.
 *
 * Alarm, koşul "sağlanmıyor"dan "sağlanıyor"a geçtiğinde bir kez çalar; koşul bozulup yeniden sağlanınca
 * yeniden çalar. Fiyat alarmları bir kez çalar ve kapanır.
 */
import type { Advice, AdviceId } from './advice'
import * as Fmt from './format'
import { PREMIUM_PAIRS, type PremiumRow } from './premium'
import { REGIME_LABEL, type StockSetups } from './setups'
import { FILTER_LABEL, TIMEFRAMES, triggerLabel, type Analysis, type SignalStat } from './signals'

interface Base { id: string; created: number }
export interface PriceAlarm extends Base { type: 'price'; symbol: string; op: 'below' | 'above'; value: number }
/** target: ürün kodu (GMSTR…), 'any' (herhangi bir ürün) ya da bir öneri kimliği */
export interface PremiumAlarm extends Base { type: 'premium'; target: string }
export interface SignalAlarm extends Base { type: 'signal'; symbol: string; side: 'dip' | 'top' | 'both'; level: 'confirmed' | 'promising' }
/** Görünüm alarmı: varlığın birleştirilmiş görüşü olumluya (up) ya da olumsuza (down) dönerse */
export interface OutlookAlarm extends Base { type: 'outlook'; asset: string; to: 'up' | 'down' }
export type Alarm = PriceAlarm | PremiumAlarm | SignalAlarm | OutlookAlarm

export interface AlarmState {
  /** Koşul şu an sağlanıyor mu */
  on: boolean
  /** Son kontrolde görülen durum (kısa metin) */
  now?: string
  firedAt?: number
  /** Son çaldığındaki bildirim metni */
  text?: string
  /** Bir kez çalan alarm çaldı ve kapandı */
  done?: boolean
  error?: string
}
export type States = Record<string, AlarmState>
export interface Fired { alarm: Alarm; title: string; text: string }

export interface Source {
  prices(symbols: string[]): Promise<Map<string, number>>
  premiums(): Promise<{ rows: PremiumRow[]; advices: Advice[]; open: boolean }>
  analysis(symbol: string): Promise<Analysis | undefined>
  /** Görünüm: varlık kimliği → görüş (Olumlu, Hafif olumlu, Nötr, Hafif olumsuz, Olumsuz) ve güven */
  outlook?(): Promise<Record<string, { stance: string; conviction: string; name: string; why: string }> | undefined>
  /** Güçlü kurulumlar (hisse değilse undefined) */
  setups?(symbol: string): Promise<StockSetups | undefined>
}

export const ADVICE_TARGETS: { id: AdviceId; label: string }[] = [
  { id: 'home-gold', label: 'Altınla ev önerisi' },
  { id: 'home-usd', label: 'Dolarla ev önerisi' },
  { id: 'gold-silver', label: 'Altın mı gümüş mü önerisi' },
  { id: 'm2-usdtry', label: 'Para arzına göre dolar' },
  { id: 'm2-gold-usd', label: 'Para arzına göre ons altın' },
  { id: 'm2-gold-try', label: 'Para arzına göre gram altın' },
  { id: 'm2-bist', label: 'Para arzına göre BIST 100' },
  { id: 'm2-home', label: 'Para arzına göre ev' },
]
const isAdvice = (t: string) => ADVICE_TARGETS.some((a) => a.id === t)
const num = (v: number) => Fmt.number(v, v >= 1000 ? 0 : v >= 10 ? 2 : 4)
const code = (symbol: string) => Fmt.ticker(symbol)
const SIDE = { dip: 'dip', top: 'tepe', both: 'dip ya da tepe' }

/** Alarmın cümlesi: "SNDK 770 altına inerse" */
export function describe(a: Alarm): string {
  if (a.type === 'price') return `${code(a.symbol)} ${num(a.value)} ${a.op === 'below' ? 'altına inerse' : 'üstüne çıkarsa'}`
  if (a.type === 'outlook') return `${OUTLOOK_NAMES[a.asset] ?? a.asset} görünümü ${a.to === 'up' ? 'olumluya' : 'olumsuza'} dönerse`
  if (a.type === 'signal') return `${code(a.symbol)} için ${a.level === 'confirmed' ? `güçlü ${SIDE[a.side]} kurulumu oluşursa` : `güçlü ${SIDE[a.side]} kurulumu ya da hisseye özgü teyitli sinyal gelirse`}`
  if (a.target === 'any') return 'Altın ya da gümüş ürünlerinden biri değerinin altına inerse'
  const adv = ADVICE_TARGETS.find((x) => x.id === a.target)
  if (adv) return `${adv.label} güçlü sinyal verirse`
  return `${a.target} değerinin altına inerse`
}
export const TYPE_LABEL: Record<Alarm['type'], string> = { price: 'Fiyat', premium: 'Avantajlı fiyat', signal: 'Hisse sinyali', outlook: 'Görünüm' }
/** Görünüm sayfasındaki varlıklar (alarm formu ve cümlesi için) */
export const OUTLOOK_NAMES: Record<string, string> = { GOLD: 'Altın', GAUTRY: 'Gram altın', SILVER: 'Gümüş', USDTRY: 'Dolar/TL', XU100USD: 'BIST (dolar)', SPX: 'ABD borsası', OIL: 'Petrol', COPPER: 'Bakır' }

const pct = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + '%' + Fmt.number(Math.abs(v * 100), 1)

/** Alarm için sayılan kurallar: istenen düzeyde ve şu an açık olanlar */
export function activeSignals(a: Analysis, side: SignalAlarm['side'], level: SignalAlarm['level']): SignalStat[] {
  return a.frames.flatMap((f) => [...(side !== 'top' ? f.dips : []), ...(side !== 'dip' ? f.tops : [])])
    .filter((s) => s.active && (s.verdict === 'confirmed' || (level === 'promising' && s.verdict === 'promising')))
    .sort((x, y) => Number(y.verdict === 'confirmed') - Number(x.verdict === 'confirmed') || y.score - x.score)
}
const ruleText = (s: SignalStat) => `${TIMEFRAMES.find((t) => t.id === s.tf)!.adj} veride ${triggerLabel(s.trigger)}${s.filter === 'any' ? '' : ', ' + FILTER_LABEL[s.filter]}`

interface Eval { on: boolean; now?: string; title?: string; text?: string }

async function evaluate(a: Alarm, src: Source, cache: { prices?: Map<string, number>; prem?: Awaited<ReturnType<Source['premiums']>> }): Promise<Eval> {
  if (a.type === 'price') {
    const p = cache.prices?.get(a.symbol.toUpperCase())
    if (p == null) throw new Error('fiyat alınamadı')
    const on = a.op === 'below' ? p <= a.value : p >= a.value
    return { on, now: num(p), title: `${code(a.symbol)} ${num(a.value)} ${a.op === 'below' ? 'altına indi' : 'üstüne çıktı'}`, text: `${code(a.symbol)} ${num(a.value)} ${a.op === 'below' ? 'altına indi' : 'üstüne çıktı'}: şu an ${num(p)}.` }
  }
  if (a.type === 'premium') {
    cache.prem ??= await src.premiums()
    const { rows, advices, open } = cache.prem
    if (isAdvice(a.target)) {
      const adv = advices.find((x) => x.id === a.target)
      if (!adv) throw new Error('öneri hesaplanamadı')
      return { on: adv.strength === 'strong', now: `${adv.action} (${adv.strength === 'strong' ? 'güçlü' : 'zayıf'})`, title: adv.action, text: `${adv.title}: ${adv.action} (güçlü sinyal).` }
    }
    const list = rows.filter((r) => a.target === 'any' || r.pair.code === a.target)
    if (!list.length) throw new Error('ürün bulunamadı')
    const buys = open ? list.filter((r) => r.signal === 'buy') : []
    const near = [...list].filter((r) => r.premium != null).sort((x, y) => x.premium! - y.premium!)[0]
    return {
      on: buys.length > 0,
      now: !open ? 'BIST kapalı' : near ? `${near.pair.code} ${pct(near.premium!)}` : undefined,
      title: `${buys.map((r) => r.pair.code).join(', ')} değerinin altında`,
      text: buys.map((r) => `${r.pair.code} içindeki madenin değerine göre ${pct(r.premium!)} (fiyat ${num(r.price!)} ₺).`).join(' '),
    }
  }
  if (a.type === 'outlook') {
    const all = await src.outlook?.()
    const o = all?.[a.asset]
    if (!o) throw new Error('görünüm hesaplanamadı')
    const up = o.stance === 'Olumlu' || o.stance === 'Hafif olumlu', down = o.stance === 'Olumsuz' || o.stance === 'Hafif olumsuz'
    return { on: a.to === 'up' ? up : down, now: `${o.stance.toLocaleLowerCase('tr')}${o.stance === 'Nötr' ? '' : ', güven ' + o.conviction}`, title: `${o.name} görünümü: ${o.stance.toLocaleLowerCase('tr')}`, text: `${o.name} görünümü ${o.stance.toLocaleLowerCase('tr')} oldu (güven ${o.conviction}). ${o.why}` }
  }
  // Önce güçlü kurulumlar (pazar genelinde üç dönemde sınanmış); istenirse hisseye özgü teyitli kurallar da
  const su = await src.setups?.(a.symbol)
  const strongNow = (su?.list ?? []).filter((x) => x.active && x.strength?.strong && (a.side === 'both' || x.setup.side === a.side))
    .sort((x, y) => (y.strength!.hit - y.strength!.base) - (x.strength!.hit - x.strength!.base))[0]
  if (strongNow) {
    const st = strongNow.strength!
    const what = strongNow.setup.side === 'dip' ? 'dip' : 'tepe'
    return {
      on: true, now: `güçlü ${what} kurulumu açık`,
      title: `${code(a.symbol)}: güçlü ${what} kurulumu`,
      text: `${code(a.symbol)}: ${strongNow.setup.label}, ${REGIME_LABEL[strongNow.regime]}. Benzer durumlarda 3 ay sonra fiyat, sınanan üç dönemin en kötüsünde bile %${Math.round(st.hit * 100)} ${what === 'dip' ? 'yukarıdaydı' : 'aşağıdaydı'} (olağan %${Math.round(st.base * 100)}).`,
    }
  }
  if (a.level === 'confirmed') {
    if (!su) throw new Error('kurulum verisi alınamadı (yalnızca BIST ve ABD hisselerinde çalışır)')
    return { on: false, now: su.list.some((x) => x.strength?.strong) ? 'güçlü kurulum yok' : 'bu pazarda güçlü kurulum tanımlı değil' }
  }
  const an = await src.analysis(a.symbol)
  if (!an || !an.frames.length) throw new Error('geçmiş veri alınamadı')
  const act = activeSignals(an, a.side, 'confirmed')
  const s = act[0]
  if (!s) return { on: false, now: 'sinyal yok' }
  const hits = Math.round((s.main.hit ?? 0) * s.main.n)
  const what = `${s.side === 'dip' ? 'Dip' : 'Tepe'} sinyali`
  return {
    on: true, now: `${what.toLowerCase()} açık`,
    title: `${code(a.symbol)}: ${what.toLowerCase()} geldi`,
    text: `${code(a.symbol)}: ${what} (hisseye özgü, teyitli). Kural: ${ruleText(s)}. Geçmişte ${s.main.n} sinyalin ${hits} tanesi tuttu.${act.length > 1 ? ` Aynı anda ${act.length - 1} kural daha açık.` : ''}`,
  }
}

/** Tüm alarmları bir kez kontrol eder; yeni durumları ve çalanları döndürür. */
export async function checkAlarms(alarms: Alarm[], prev: States, src: Source, now = Date.now()): Promise<{ states: States; fired: Fired[] }> {
  const states: States = {}
  const fired: Fired[] = []
  const live = alarms.filter((a) => !prev[a.id]?.done)
  const cache: Parameters<typeof evaluate>[2] = {}
  const symbols = [...new Set(live.filter((a): a is PriceAlarm => a.type === 'price').map((a) => a.symbol.toUpperCase()))]
  if (symbols.length) cache.prices = await src.prices(symbols).catch(() => new Map())
  for (const a of alarms) {
    const before = prev[a.id]
    if (before?.done) { states[a.id] = before; continue }
    try {
      const e = await evaluate(a, src, cache)
      const st: AlarmState = { on: e.on, now: e.now, firedAt: before?.firedAt, text: before?.text }
      if (e.on && !before?.on) {
        st.firedAt = now; st.text = e.text
        if (a.type === 'price') st.done = true
        fired.push({ alarm: a, title: e.title ?? describe(a), text: e.text ?? describe(a) })
      }
      states[a.id] = st
    } catch (err) {
      // Veri alınamadıysa durum korunur: geçici bir hata alarmı yeniden çaldırmasın
      states[a.id] = { ...(before ?? { on: false }), error: (err as Error).message }
    }
  }
  return { states, fired }
}

export const newId = () => Math.random().toString(36).slice(2, 10)
export const PRODUCT_TARGETS = PREMIUM_PAIRS.map((p) => p.code)

/** Dışarıdan gelen (depo, içe aktarma) veriyi doğrular */
export function sanitizeAlarms(raw: unknown): Alarm[] {
  if (!Array.isArray(raw)) return []
  const out: Alarm[] = []
  for (const x of raw as Record<string, unknown>[]) {
    if (!x || typeof x.id !== 'string' || typeof x.created !== 'number') continue
    const base = { id: x.id.slice(0, 24), created: x.created }
    const sym = typeof x.symbol === 'string' && /^[A-Z0-9_.!]+:[A-Z0-9_.!]+$/i.test(x.symbol) ? x.symbol.toUpperCase() : undefined
    if (x.type === 'price' && sym && (x.op === 'below' || x.op === 'above') && typeof x.value === 'number' && x.value > 0) out.push({ ...base, type: 'price', symbol: sym, op: x.op, value: x.value })
    else if (x.type === 'premium' && typeof x.target === 'string' && (x.target === 'any' || isAdvice(x.target) || PRODUCT_TARGETS.includes(x.target))) out.push({ ...base, type: 'premium', target: x.target })
    else if (x.type === 'outlook' && typeof x.asset === 'string' && x.asset in OUTLOOK_NAMES && (x.to === 'up' || x.to === 'down')) out.push({ ...base, type: 'outlook', asset: x.asset, to: x.to })
    else if (x.type === 'signal' && sym && (x.side === 'dip' || x.side === 'top' || x.side === 'both') && (x.level === 'confirmed' || x.level === 'promising')) out.push({ ...base, type: 'signal', symbol: sym, side: x.side, level: x.level })
  }
  return out.slice(0, 50)
}
