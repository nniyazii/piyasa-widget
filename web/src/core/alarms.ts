/**
 * Alarmlar: tek bir yerden kurulan uyarılar.
 *   price    Fiyat bir düzeyin altına iner ya da üstüne çıkar
 *   premium  Altın/gümüş ürünü değerinin altına iner (al sinyali) ya da bir birikim/para arzı önerisi güçlenir
 *   signal   Hissede pazar genelinde sınanmış güçlü bir dip ya da tepe kurulumu oluşur
 *   outlook  Bir varlığın birleştirilmiş görünümü yön değiştirir
 *   event    Bir varlıkta seçilen olay (grafik tezgâhındaki olaylar ya da kullanıcının tanımladığı) gerçekleşir
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
import { customEvent, customLabel, eventDefs, prepare, sanitizeCustom, study, TF_LABEL, type CustomSpec, type EventDef, type Tf } from './study'
import { assetInfo, isStock, type Frames } from './subject'

interface Base { id: string; created: number }
export interface PriceAlarm extends Base { type: 'price'; symbol: string; op: 'below' | 'above'; value: number }
/** target: ürün kodu (GMSTR…), 'any' (herhangi bir ürün) ya da bir öneri kimliği */
export interface PremiumAlarm extends Base { type: 'premium'; target: string }
export interface SignalAlarm extends Base { type: 'signal'; symbol: string; side: 'dip' | 'top' | 'both' }
/** Görünüm alarmı: varlığın birleştirilmiş görüşü olumluya (up) ya da olumsuza (down) dönerse */
export interface OutlookAlarm extends Base { type: 'outlook'; asset: string; to: 'up' | 'down' }
/** Olay alarmı: varlıkta (makro kod ya da hisse) seçilen zaman diliminde olay gerçekleşirse. custom: kullanıcının tanımı; usd: BIST hissesi dolar bazında */
export interface EventAlarm extends Base { type: 'event'; subject: string; tf: Tf; event: string; custom?: CustomSpec; usd?: boolean; /** Olayın adı (makro olaylarda tanım veriye bağlı olduğu için saklanır) */ label?: string }
export type Alarm = PriceAlarm | PremiumAlarm | SignalAlarm | OutlookAlarm | EventAlarm

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
  /** Görünüm: varlık kimliği → görüş (Olumlu, Hafif olumlu, Nötr, Hafif olumsuz, Olumsuz) ve güven */
  outlook?(): Promise<Record<string, { stance: string; conviction: string; name: string; why: string }> | undefined>
  /** Güçlü kurulumlar (hisse değilse undefined) */
  setups?(symbol: string): Promise<StockSetups | undefined>
  /** Olay alarmı için varlığın mumları; makro olaylar için ek tanımlar */
  subject?(id: string, usd: boolean): Promise<{ short: string; frames: Frames; macroDefs?: EventDef[] } | undefined>
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
  if (a.type === 'signal') return `${code(a.symbol)} için güçlü ${SIDE[a.side]} kurulumu oluşursa`
  if (a.type === 'event') return `${subjectName(a.subject)}${a.usd ? ' (dolar bazında)' : ''}, ${TF_LABEL[a.tf].toLocaleLowerCase('tr')} veride: ${eventLabel(a)}`
  if (a.target === 'any') return 'Altın ya da gümüş ürünlerinden biri değerinin altına inerse'
  const adv = ADVICE_TARGETS.find((x) => x.id === a.target)
  if (adv) return `${adv.label} güçlü sinyal verirse`
  return `${a.target} değerinin altına inerse`
}
export const TYPE_LABEL: Record<Alarm['type'], string> = { price: 'Fiyat', premium: 'Avantajlı fiyat', signal: 'Güçlü kurulum', outlook: 'Görünüm', event: 'Olay' }
export const subjectName = (id: string) => (isStock(id) ? code(id) : assetInfo(id)?.short ?? id)
/** Olay alarmının olay adı (tanım bulunamazsa kimliği) */
export function eventLabel(a: Pick<EventAlarm, 'tf' | 'event' | 'custom' | 'label'>, extra: EventDef[] = []): string {
  if (a.label) return a.label
  if (a.custom) return a.custom.name || customLabel(a.custom)
  return [...eventDefs(a.tf), ...extra].find((d) => d.id === a.event)?.label ?? a.event
}
/** Görünüm sayfasındaki varlıklar (alarm formu ve cümlesi için) */
export const OUTLOOK_NAMES: Record<string, string> = { GOLD: 'Altın', GAUTRY: 'Gram altın', SILVER: 'Gümüş', USDTRY: 'Dolar/TL', XU100USD: 'BIST (dolar)', SPX: 'ABD borsası', OIL: 'Petrol', COPPER: 'Bakır' }

const pct = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + '%' + Fmt.number(Math.abs(v * 100), 1)

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
  if (a.type === 'event') {
    const sub = await src.subject?.(a.subject, !!a.usd)
    const bars = sub?.frames[a.tf]
    if (!sub || !bars || bars.t.length < 60) throw new Error('geçmiş veri alınamadı')
    const def = a.custom ? customEvent(a.custom) : [...eventDefs(a.tf), ...(sub.macroDefs ?? [])].find((d) => d.id === a.event)
    if (!def) throw new Error('olay tanımı bulunamadı')
    const x = prepare(bars, a.tf)
    if (def.needsVolume && !x.v) throw new Error('bu varlıkta hacim verisi yok')
    const st = study(x, def)
    // Olay son iki mumdan birinde başladıysa "gerçekleşti" sayılır (son mum henüz kapanmamış olabilir)
    const on = !!st.recent && st.recent.elapsed <= 1
    const name = def.standalone ? def.label : `${sub.short} ${def.label}`
    const best = st.best
    const odds = st.view.filter((h) => h.n >= 5).map((h) => `${h.label} %${Math.round(h.up * 100)} (olağan %${Math.round(h.base * 100)})`).join(', ')
    return {
      on, now: on ? 'gerçekleşti' : st.onsets.length ? `son kez ${new Date(x.t[st.onsets[st.onsets.length - 1]] * 1000).toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' })}` : 'hiç olmadı',
      title: `${sub.short}: ${def.label}`,
      text: `${name} (${TF_LABEL[a.tf].toLocaleLowerCase('tr')} veri${a.usd ? ', dolar bazında' : ''}). Geçmişte ${Math.max(0, st.onsets.length - 1)} kez oldu. Sonrasında yukarıda olma oranı: ${odds || 'örnek az'}.${best ? ` En belirgin vade ${best.label}.` : ' Hiçbir vadede olağandan belirgin biçimde ayrışmıyor.'}`,
    }
  }
  // Güçlü kurulumlar (pazar genelinde üç dönemde sınanmış)
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
  if (!su) throw new Error('kurulum verisi alınamadı (yalnızca BIST ve ABD hisselerinde çalışır)')
  return { on: false, now: su.list.some((x) => x.strength?.strong) ? 'güçlü kurulum yok' : 'bu pazarda güçlü kurulum tanımlı değil' }
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
    else if (x.type === 'signal' && sym && (x.side === 'dip' || x.side === 'top' || x.side === 'both')) out.push({ ...base, type: 'signal', symbol: sym, side: x.side })
    else if (x.type === 'event' && typeof x.subject === 'string' && (x.tf === 'M' || x.tf === 'W' || x.tf === 'D') && typeof x.event === 'string' && x.event.length < 40) {
      const subject = /^[A-Z0-9_.!]+:[A-Z0-9_.!]+$/i.test(x.subject) ? x.subject.toUpperCase() : assetInfo(x.subject)?.id
      const custom = x.custom ? sanitizeCustom([x.custom])[0] : undefined
      if (subject && (!x.event.startsWith('c:') || custom)) out.push({ ...base, type: 'event', subject, tf: x.tf, event: x.event, ...(custom ? { custom } : {}), ...(x.usd === true ? { usd: true } : {}), ...(typeof x.label === 'string' && x.label ? { label: x.label.replace(/[<>]/g, '').slice(0, 140) } : {}) })
    }
  }
  return out.slice(0, 50)
}
