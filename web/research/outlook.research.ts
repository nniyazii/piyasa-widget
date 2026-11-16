import { readFileSync } from 'node:fs'
import { it } from 'vitest'
import type { MacroData } from '../src/core/macro'
import { outlookView } from '../src/core/outlook'
it('görünüm', () => {
  const v = outlookView(JSON.parse(readFileSync('public/data/macro.json', 'utf8')) as MacroData)
  console.log(v.regime.title); for (const l of v.regime.lines) console.log('  ', l)
  for (const o of v.list) {
    console.log(`\n${o.asset.label}: ${o.stance} (puan ${o.score}, güven ${o.conviction}) — ${o.why}`)
    for (const l of o.layers) console.log(`   [${l.vote > 0 ? '+' : ''}${l.vote}${l.counts ? '' : ' sayılmaz'}] ${l.id}: ${l.text}${l.record ? ` | sicil ${(l.record.hit * 100).toFixed(0)}%/${(l.record.base * 100).toFixed(0)}% n=${l.record.n}` : ''}`)
    for (const f of o.flips) console.log('   ↺', f)
  }
})
