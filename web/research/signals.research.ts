import { readFileSync } from 'node:fs'
import { it } from 'vitest'
import { analyze, FILTER_LABEL, triggerLabel, type Timeframe } from '../src/core/signals'
import { shardOf, unpackBars } from '../src/data/bars'
it('signals', () => {
  for (const sym of (process.env.SYMS ?? 'NASDAQ:SNDK,NASDAQ:AAPL,BIST:THYAO,BIST:XU100').split(',')) {
    const frames: any = {}
    for (const tf of ['W', 'D', 'H4', 'H1'] as Timeframe[]) frames[tf] = unpackBars(JSON.parse(readFileSync(`research/out/bars/${tf}/${String(shardOf(sym)).padStart(2, '0')}.json`, 'utf8')).bars[sym])
    const t0 = performance.now()
    const a = analyze(frames)
    const ms = performance.now() - t0
    const all = a.frames.flatMap((f) => [...f.dips, ...f.tops])
    console.log('\n==', sym, Math.round(ms) + 'ms', 'confirmed', all.filter((s) => s.verdict === 'confirmed').length, 'promising', all.filter((s) => s.verdict === 'promising').length, '/', all.length)
    for (const s of all.filter((x) => x.verdict === 'confirmed')) console.log('  ', s.tf, s.side, triggerLabel(s.trigger), '|', FILTER_LABEL[s.filter], 'n', s.main.n, 'hit', s.main.hit?.toFixed(2), 'base', s.main.baseHit?.toFixed(2), 'med', s.main.median?.toFixed(3), 'bmed', s.main.baseMedian?.toFixed(3), s.active ? 'ACTIVE' : '', 'trig', a.frames.find((f) => f.tf === s.tf)!.triggers[s.trigger.id]?.toFixed(2))
  }
})
