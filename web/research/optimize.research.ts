/**
 * Hazır listelerin iyileştirilmesi (yıllık dilimlerle):
 *   seçim: ilk iki yılın en kötüsünde en iyi ayar (tek bir piyasa rejimine uydurmayı önler)
 *   doğrulama: son yıl (hiç bakılmadan); kabul: son yılda ≥ mevcut + 5 ve tüm dönemde düşmüyor
 */
import { it } from 'vitest'
import { SCREEN_TEMPLATES } from '../src/core/screener'
import { describeAll, save } from './grid'
import { GRIDS } from './grids'
import { foldEval, foldSearch, sc, show } from './folds'

it('hazır listeleri iyileştir (yıllık dilimler)', async () => {
  const decisions: Record<string, unknown> = {}
  for (const [id, axes] of Object.entries(GRIDS)) {
    const base = SCREEN_TEMPLATES.find((s) => s.id === id)!
    const cur = await foldEval(base)
    const { best, tried } = await foldSearch(base, axes, 3)
    const lines = [`\n■ ${base.name}  (${tried} ayar denendi)`, `  mevcut: ${describeAll(base.conditions)}`, show('mevcut', cur)]
    let accepted: (typeof best)[0] | undefined
    best.forEach((c, i) => {
      lines.push(`  aday ${i + 1}: ${describeAll(c.conds)}`, show(`aday ${i + 1}`, c))
      const ok = sc(c.y3) >= sc(cur.y3) + 5 && sc(c.all) >= sc(cur.all)
      if (ok && !accepted) accepted = c
    })
    lines.push(`  → karar: ${accepted ? 'DEĞİŞTİR: ' + describeAll(accepted.conds) : 'aynı kalsın'}`)
    console.log(lines.join('\n'))
    decisions[id] = {
      name: base.name, accepted: !!accepted, conds: accepted?.conds ?? base.conditions,
      before: { y1: cur.y1.rel.score, y2: cur.y2.rel.score, y3: cur.y3.rel.score, all: cur.all.rel.score },
      after: accepted ? { y1: accepted.y1.rel.score, y2: accepted.y2.rel.score, y3: accepted.y3!.rel.score, all: accepted.all!.rel.score } : undefined,
    }
  }
  save(process.env.OUT ?? 'research/out/optimize.json', decisions)
})
