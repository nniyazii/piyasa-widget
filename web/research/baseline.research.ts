import { it } from 'vitest'
import { SCREEN_TEMPLATES } from '../src/core/screener'
import { evaluate, iso, line, loadLab, periods } from './lab'

it('mevcut hazır listeler: eğitim / sınama / tümü', async () => {
  const l = await loadLab()
  const P = periods(l)
  console.log(`BIST ${l.universe.BIST.length}, ABD ${l.universe.US.length} hisse; eğitim ${iso(P.train.start)}–${iso(P.train.end)}, sınama ${iso(P.test.start)}–${iso(P.test.end)}`)
  for (const s of SCREEN_TEMPLATES.filter((x) => x.universe !== 'MY_LIST')) {
    console.log(`\n${s.name}`)
    for (const k of ['train', 'test', 'all'] as const) {
      const t0 = Date.now()
      const e = await evaluate(s, P[k])
      console.log(`  ${k.padEnd(5)} ${line(e)}  (${Date.now() - t0} ms)`)
    }
  }
})
