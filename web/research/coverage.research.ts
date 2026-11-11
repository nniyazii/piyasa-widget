/**
 * Kapsam denetimi: her hazır liste son 3 yılda kaç kez, kaç hissede, kaç ayda eşleşti?
 * "Listem" evrenli listeler BIST ve ABD evrenlerinde denenir (kullanıcının listesi bilinmez).
 *   npm run research -- research/coverage.research.ts --silent=false
 */
import { it } from 'vitest'
import { SCREEN_TEMPLATES, type Screen } from '../src/core/screener'
import { evaluate, loadLab } from './lab'

it('hazır listelerin kapsamı (3 yıl)', async () => {
  const l = await loadLab()
  const period = { start: l.lastDay - Math.round(3 * 365.25), end: l.lastDay }
  const rows: string[] = []
  for (const s of SCREEN_TEMPLATES) {
    const runs: [string, Screen][] = s.universe === 'MY_LIST'
      ? [['BIST', { ...s, universe: 'BIST', category: null }], ['US', { ...s, universe: 'US', category: null }]]
      : [[s.universe, s]]
    for (const [u, sc] of runs) {
      const { r, rel } = await evaluate(sc, period)
      const months = new Set(r.episodes.map((e) => Math.floor(e.entryDay / 30.44))).size
      rows.push([
        String(r.episodes.length).padStart(5), String(r.distinct).padStart(4), String(months).padStart(3),
        (r.portfolio.avgMembers ?? 0).toFixed(1).padStart(5), String(r.currentMembers.length).padStart(3),
        String(rel.score ?? '—').padStart(3), u.padEnd(4), s.name,
      ].join(' '))
    }
  }
  console.log('giriş hisse  ay  ort.üye şimdi skor evren liste\n' + rows.join('\n'))
}, 900_000)
