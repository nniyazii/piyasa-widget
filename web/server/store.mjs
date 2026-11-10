/**
 * Fiyat geçmişi deposu: bir kez çekilen geçmiş saklanır, sonra yalnızca son günler eklenir.
 *
 * Artımlı güncelleme: her sembol için son ~100 günlük çubuk istenir; önceki kayıtla çakışan günlerin
 * kapanışları karşılaştırılır. Uyuşmazsa (bölünme, bedelsiz, düzeltilmiş geçmiş) o sembol baştan çekilir.
 *
 * Biçimler (tarayıcıyla ortak):
 *   günlük: [ilk gün (epoch gün), [gün farkları…], [kapanışlar…]]
 *   aylık:  [[ay başı (epoch sn, UTC), en düşük, en yüksek, kapanış], …]
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { monthlyFromDaily, packDaily, tvBars } from './tv.mjs'

export const DAILY_KEEP = 1000
const RECENT = 100
const FULL = 1600
const sig = (v) => (v == null || !Number.isFinite(v) ? null : Number(v.toPrecision(6)))
const HALF_DAY = 12 * 3600
const dayOf = (t) => Math.floor((t + HALF_DAY) / 86400)

export function unpackDaily(p) {
  if (!p) return { days: [], close: [] }
  const days = [p[0]]
  for (const d of p[1]) days.push(days[days.length - 1] + d)
  return { days, close: p[2] }
}

function packArrays(days, close) {
  if (!days.length) return null
  return [days[0], days.slice(1).map((d, i) => d - days[i]), close]
}

/**
 * Önceki günlük seriye yeni çubukları ekler. Çakışan günlerde kapanışlar tutmazsa null döner
 * (geçmiş düzeltilmiş: sembol baştan çekilmeli).
 */
export function mergeDaily(basePacked, recentBars, keep = DAILY_KEEP) {
  const base = unpackDaily(basePacked)
  if (!base.days.length || !recentBars?.length) return null
  const recentDays = recentBars.map((b) => dayOf(b.t))
  const first = recentDays[0]
  // Çakışma denetimi: hem eski hem yeni kayıtta olan günler (en az 3)
  // Eski kaydın son günü o sırada henüz kapanmamış olabilir: karşılaştırmaya katma
  const byDay = new Map(base.days.slice(0, -1).map((d, i) => [d, base.close[i]]))
  let overlap = 0
  for (let i = 0; i < recentBars.length; i++) {
    const old = byDay.get(recentDays[i])
    if (old == null) continue
    // Son gün henüz kapanmamış olabilir: karşılaştırmaya katma
    if (i === recentBars.length - 1) continue
    overlap++
    const now = sig(recentBars[i].c)
    if (now == null || Math.abs(now / old - 1) > 0.002) return null
  }
  if (overlap < 3) return null
  const cut = base.days.findIndex((d) => d >= first)
  const keepTo = cut < 0 ? base.days.length : cut
  const days = [...base.days.slice(0, keepTo), ...recentDays]
  const close = [...base.close.slice(0, keepTo), ...recentBars.map((b) => sig(b.c))]
  return packArrays(days.slice(-keep), close.slice(-keep))
}

/** Önceki aylık çubuklara yeni günlüklerden türetilen ayları işler (pencerenin ilk, yarım ayı hariç). */
export function mergeMonthly(baseMonthly, recentBars) {
  const fresh = monthlyFromDaily(recentBars).map(([t, l, h, c]) => [t, sig(l), sig(h), sig(c)])
  if (!fresh.length) return baseMonthly
  const firstMonth = fresh[0][0]
  const replace = new Map(fresh.slice(1).map((m) => [m[0], m]))
  const out = (baseMonthly ?? []).filter((m) => m[0] <= firstMonth && !replace.has(m[0]))
  // Pencerenin ilk ayı eskide yoksa (yeni sembol) onu da al
  if (!out.some((m) => m[0] === firstMonth)) out.push(fresh[0])
  return [...out, ...replace.values()].sort((a, b) => a[0] - b[0])
}

/**
 * Sembollerin geçmişini günceller.
 * @param {string[]} symbols
 * @param {{ daily: Record<string, any>, monthly: Record<string, any> }} base önceki kayıtlar
 * @returns {Promise<{ daily: Record<string, any>, monthly: Record<string, any>, stats: { incremental: number, full: number, failed: number, kept: number } }>}
 */
export async function refreshHistory(symbols, base, { parallel = 8, onProgress } = {}) {
  const daily = {}
  const monthly = {}
  const stats = { incremental: 0, full: 0, failed: 0, kept: 0 }
  const haveBase = symbols.filter((s) => base.daily?.[s] && base.monthly?.[s])
  const needFull = new Set(symbols.filter((s) => !haveBase.includes(s)))
  let done = 0
  if (haveBase.length) {
    const recent = await tvBars(haveBase, { resolution: '1D', count: RECENT, parallel, onProgress: (d) => onProgress?.(d, symbols.length) })
    for (const s of haveBase) {
      const bars = recent.get(s)
      const merged = bars ? mergeDaily(base.daily[s], bars) : null
      if (merged) {
        daily[s] = merged
        monthly[s] = mergeMonthly(base.monthly[s], bars)
        stats.incremental++
      } else if (bars) needFull.add(s) // geçmiş düzeltilmiş: baştan
      else { daily[s] = base.daily[s]; monthly[s] = base.monthly[s]; stats.kept++ } // erişilemedi: eskisi kalsın
    }
    done = haveBase.length
  }
  if (needFull.size) {
    const list = [...needFull]
    const full = await tvBars(list, { resolution: '1D', count: FULL, parallel, onProgress: (d) => onProgress?.(done + d, symbols.length) })
    for (const s of list) {
      const bars = full.get(s)
      if (bars?.length) {
        daily[s] = packDaily(bars.slice(-DAILY_KEEP))
        monthly[s] = monthlyFromDaily(bars).map(([t, l, h, c]) => [t, sig(l), sig(h), sig(c)])
        stats.full++
      } else if (base.daily?.[s] || base.monthly?.[s]) {
        if (base.daily?.[s]) daily[s] = base.daily[s]
        if (base.monthly?.[s]) monthly[s] = base.monthly[s]
        stats.kept++
      } else stats.failed++
    }
  }
  return { daily, monthly, stats }
}

// ------------------------------------------------------------------ diskte kalıcı depo (kendi sunucunuz)

/**
 * Sembol başına dosya: DATA_DIR/<sembol>.json = { updated (epoch ms), daily, monthly }.
 * Sunucu yeniden başlasa da geçmiş yeniden çekilmez; bayatlayanlar artımlı güncellenir.
 */
export class DiskStore {
  constructor(dir, maxAgeMs = 6 * 3600 * 1000) {
    this.dir = dir
    this.maxAgeMs = maxAgeMs
    this.memory = new Map()
    mkdirSync(dir, { recursive: true })
  }

  file(s) {
    return join(this.dir, s.replace(/[^A-Za-z0-9_.-]+/g, '_') + '.json')
  }

  read(s) {
    if (this.memory.has(s)) return this.memory.get(s)
    try {
      const v = JSON.parse(readFileSync(this.file(s), 'utf8'))
      this.memory.set(s, v)
      return v
    } catch {
      return undefined
    }
  }

  write(s, v) {
    this.memory.set(s, v)
    if (this.memory.size > 4000) this.memory.delete(this.memory.keys().next().value)
    const f = this.file(s)
    try {
      writeFileSync(f + '.tmp', JSON.stringify(v))
      renameSync(f + '.tmp', f)
    } catch { /* disk dolu ya da salt okunur: bellekte devam */ }
  }

  /** İstenen sembollerin kayıtları; bayat ya da eksikler TradingView'dan artımlı güncellenir. */
  async get(symbols) {
    const now = Date.now()
    const out = {}
    const stale = []
    for (const s of symbols) {
      const v = this.read(s)
      if (v && now - v.updated < this.maxAgeMs) out[s] = v
      else stale.push(s)
    }
    if (stale.length) {
      const base = { daily: {}, monthly: {} }
      for (const s of stale) {
        const v = this.read(s)
        if (v) { base.daily[s] = v.daily; base.monthly[s] = v.monthly }
      }
      const r = await refreshHistory(stale, base)
      for (const s of stale) {
        if (!r.daily[s] && !r.monthly[s]) { out[s] = this.read(s) ?? null; continue }
        const v = { updated: now, daily: r.daily[s] ?? null, monthly: r.monthly[s] ?? null }
        this.write(s, v)
        out[s] = v
      }
    }
    return out
  }
}
