import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DiskStore, mergeDaily, mergeMonthly, unpackDaily } from './store.mjs'
import { packDaily } from './tv.mjs'

const D = 86400
const bar = (day, c, l = c, h = c) => ({ t: day * D, o: c, h, l, c })
const base = packDaily(Array.from({ length: 10 }, (_, i) => bar(20000 + i, 100 + i)))

describe('artımlı geçmiş', () => {
  it('çakışan günler tutarsa yalnızca yeni günler eklenir', () => {
    const recent = [5, 6, 7, 8, 9, 10, 11].map((i) => bar(20000 + i, 100 + i))
    const m = unpackDaily(mergeDaily(base, recent))
    expect(m.days).toEqual(Array.from({ length: 12 }, (_, i) => 20000 + i))
    expect(m.close.at(-1)).toBe(111)
  })

  it('eski kaydın son günü (o sırada kapanmamış) farklı olabilir', () => {
    const recent = [5, 6, 7, 8, 9, 10].map((i) => bar(20000 + i, i === 9 ? 120 : 100 + i))
    expect(unpackDaily(mergeDaily(base, recent)).close.slice(-2)).toEqual([120, 110])
  })

  it('bugünün henüz kapanmamış çubuğu güncellenir', () => {
    const recent = [6, 7, 8, 9].map((i) => bar(20000 + i, i === 9 ? 150 : 100 + i))
    expect(unpackDaily(mergeDaily(base, recent)).close.at(-1)).toBe(150)
  })

  it('bölünme/bedelsiz sonrası geçmiş değiştiyse birleştirmez (baştan çekilmeli)', () => {
    const recent = [6, 7, 8, 9, 10].map((i) => bar(20000 + i, (100 + i) / 2))
    expect(mergeDaily(base, recent)).toBeNull()
  })

  it('çakışma yetersizse birleştirmez', () => {
    expect(mergeDaily(base, [bar(20020, 1), bar(20021, 2)])).toBeNull()
    expect(mergeDaily(null, [bar(20020, 1)])).toBeNull()
  })

  it('en fazla [keep] gün tutulur', () => {
    const recent = [5, 6, 7, 8, 9, 10].map((i) => bar(20000 + i, 100 + i))
    expect(unpackDaily(mergeDaily(base, recent, 5)).days).toEqual([20006, 20007, 20008, 20009, 20010])
  })

  it('aylar: pencerenin ilk (yarım) ayı korunur, sonrakiler yenilenir', () => {
    const ms = (y, m) => Date.UTC(y, m, 1) / 1000
    const old = [[ms(2026, 0), 1, 9, 5], [ms(2026, 1), 2, 8, 6], [ms(2026, 2), 3, 7, 4]]
    const day = (y, m, d) => Date.UTC(y, m, d) / 1000 / D
    // Şubat'ın yalnızca sonu, Mart'ın tamamı, Nisan başı
    const recent = [bar(day(2026, 1, 26), 6.5, 6, 7), bar(day(2026, 2, 10), 4.5, 1, 10), bar(day(2026, 3, 2), 5, 5, 5)]
    const m = mergeMonthly(old, recent)
    expect(m).toEqual([[ms(2026, 0), 1, 9, 5], [ms(2026, 1), 2, 8, 6], [ms(2026, 2), 1, 10, 4.5], [ms(2026, 3), 5, 5, 5]])
  })

  it('disk deposu yeniden açılınca kayıtları okur', () => {
    const dir = mkdtempSync(join(tmpdir(), 'piyasa-'))
    const a = new DiskStore(dir)
    a.write('BIST:THYAO', { updated: 1, daily: base, monthly: [] })
    const b = new DiskStore(dir)
    expect(b.read('BIST:THYAO').daily).toEqual(base)
  })
})
