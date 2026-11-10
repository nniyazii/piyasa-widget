/**
 * Hazır listelerin güvenilirlik skorları (son 3 yıl) → data/scores.json. CI her gün çalıştırır:
 *   LAB_DATA=dist/data OUT=dist/data/scores.json npx vitest run -c vitest.research.config.ts research/scores.research.ts
 * Uygulama skoru, liste tanımı (koşullar, evren, para birimi) aynıysa gösterir.
 */
import { it } from 'vitest'
import { SCREEN_TEMPLATES } from '../src/core/screener'
import { fingerprint } from '../src/data/reliability'
import { save } from './grid'
import { evaluate, loadLab } from './lab'

const YEARS = 3

it('hazır listelerin skorları', async () => {
  const l = await loadLab()
  const period = { start: l.lastDay - Math.round(YEARS * 365.25), end: l.lastDay }
  const scores: Record<string, unknown> = {}
  const table: string[] = []
  for (const s of SCREEN_TEMPLATES) {
    if (s.universe !== 'BIST' && s.universe !== 'US') continue
    const { r, rel } = await evaluate(s, period)
    const p = r.portfolios
    scores[fingerprint(s)] = {
      id: s.id, name: s.name, rel,
      portfolios: { list: p?.list.total, hold1m: p?.hold1m.total, hold3m: p?.hold3m.total, bench: r.portfolio.bench },
    }
    table.push(`${String(rel.score ?? '—').padStart(3)} ${rel.label.padEnd(13)} ${s.name}`)
  }
  console.log(table.join('\n'))
  save(process.env.OUT ?? 'research/out/scores.json', { generated: Date.now(), years: YEARS, scores })
}, 600_000)
