import { readFileSync } from 'node:fs'
import { it } from 'vitest'
import { analyze, durationLabel, triggerPrice, VERDICT_LABEL, type Timeframe } from '../src/core/signals'
import { shardOf, unpackBars } from '../src/data/bars'
it('signals', () => {
  for (const sym of (process.env.SYMS ?? 'NASDAQ:SNDK,NASDAQ:AAPL,BIST:THYAO,BIST:XU100').split(',')) {
    const frames: any = {}
    for (const tf of ['W', 'D', 'H4', 'H1'] as Timeframe[]) {
      const f = JSON.parse(readFileSync(`research/out/bars/${tf}/${String(shardOf(sym)).padStart(2, '0')}.json`, 'utf8')).bars[sym]
      frames[tf] = unpackBars(f)
    }
    const a = analyze(frames)
    console.log('\n==', sym, 'bestDip', a.bestDip && `${a.bestDip.tf} ${a.bestDip.level} ${a.bestDip.verdict}`, 'bestTop', a.bestTop && `${a.bestTop.tf} ${a.bestTop.level} ${a.bestTop.verdict}`)
    for (const f of a.frames) {
      console.log(f.tf, 'bars', f.bars, new Date(f.from * 1000).toISOString().slice(0, 10), 'rsi', f.rsi.toFixed(1), 'close', f.close, 'spacing', durationLabel(1, f.spacing), durationLabel(f.bars, f.spacing))
      for (const s of [...f.dips, ...f.tops]) console.log('  ', s.side, s.level, 'n', s.main.n, '/', s.events.length, 'hit', s.main.hit?.toFixed(2), 'base', s.main.baseHit?.toFixed(2), 'med', s.main.median?.toFixed(3), 'bmed', s.main.baseMedian?.toFixed(3), VERDICT_LABEL[s.verdict], s.active ? 'ACTIVE' : '', 'trig', triggerPrice(f.close, f.gain, f.loss, s.level, s.side)?.toFixed(2))
    }
  }
})
