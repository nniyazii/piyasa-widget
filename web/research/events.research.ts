import { readFileSync } from 'node:fs'
import { it } from 'vitest'
import { eventsView, sentence } from '../src/core/events'
import { monthLabel, type MacroData } from '../src/core/macro'
it('olaylar', () => {
  const t0 = performance.now(); const v = eventsView(JSON.parse(readFileSync('public/data/macro.json', 'utf8')) as MacroData)
  console.log('süre', Math.round(performance.now() - t0), 'ms; olay', v.recent.length)
  const pc = (x: number) => (Number.isNaN(x) ? '-' : (x * 100).toFixed(0) + '%')
  const seen = new Set<string>()
  for (const o of v.recent) { const key = o.def.kind === 'macro' ? o.def.id : o.def.id + o.asset.id; if (o.def.kind === 'macro' && seen.has(key)) continue; seen.add(key)
    console.log(`${monthLabel(o.month)} ${o.informative ? '*' : ' '} ${sentence(o)} [${o.def.kind === 'macro' ? 'makro → ' + o.asset.short : ''} geçmişte ${o.history.length} kez] ` + o.stats.map((s) => `${s.months}ay ${pc(s.up)}/${pc(s.base)} n${s.n}`).join(' | ')) }
  console.log('\nBİRLEŞİK:'); for (const a of v.odds) console.log(' ', a.asset.short.padEnd(14), a.events.length, 'olay |', a.stats.map((s) => `${s.months}ay ${pc(s.up)} [${pc(s.lo)}–${pc(s.hi)}] olağan ${pc(s.base)} n${s.n} ort ${pc(s.median)}`).join(' | '))
})
