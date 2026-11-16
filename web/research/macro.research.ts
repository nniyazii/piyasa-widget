import { readFileSync } from 'node:fs'
import { it } from 'vitest'
import { FEATURES, macroView, monthLabel, type MacroData } from '../src/core/macro'
it('makro', () => {
  const d = JSON.parse(readFileSync('public/data/macro.json', 'utf8')) as MacroData
  const t0 = performance.now(); const m = macroView(d); console.log('süre', Math.round(performance.now() - t0), 'ms; bugün', monthLabel(m.world.now))
  const pc = (x?: number) => (x == null ? '-' : (x * 100).toFixed(0) + '%')
  console.log('GEÇERLİ KOŞULLAR:', m.activeConditions.map((c) => c.label).join(' | '))
  console.log('tutarlı örüntü:', m.patterns.filter((p) => p.consistent).length, '/', m.patterns.length)
  for (const a of m.assets) {
    console.log(`\n${a.asset.label}: ${a.stance} (${a.score}); olağan ${pc(a.base?.hit)} / ${pc(a.base?.median)}; benzer dönemler ${a.analog ? `${a.analog.up}/${a.analog.n}, ortanca ${pc(a.analog.median)}` : '-'}`)
    for (const p of a.active) console.log(`   ${p.sign > 0 ? '+' : '−'} ${p.cond.label}: ${p.n} ay, ${p.episodes} dönem; yukarı ${pc(p.hit)} (olağan ${pc(p.base)}), ortanca ${pc(p.median)} (olağan ${pc(p.baseMedian)}) | ` + p.eras.map((e) => `${e.n}:${pc(e.hit)}/${pc(e.base)}`).join(' '))
  }
  console.log('\nTÜM TUTARLI ÖRÜNTÜLER:'); for (const p of m.patterns.filter((p) => p.consistent).sort((x, y) => Math.abs(y.hit - y.base) - Math.abs(x.hit - x.base))) console.log(`  ${p.sign > 0 ? '+' : '−'} ${p.asset.short.padEnd(13)} ${p.cond.label.padEnd(62)} ${String(p.n).padStart(4)} ay ${String(p.episodes).padStart(2)} dönem  yukarı ${pc(p.hit)}/${pc(p.base)}  ortanca ${pc(p.median)}/${pc(p.baseMedian)}`)
  console.log('\nBENZER DÖNEMLER:'); console.log('  şimdi      ', m.analogs.now.map((x, j) => `${FEATURES[j].id}=${x?.toFixed(1)}`).join(' '))
  for (const x of m.analogs.list) console.log(' ', monthLabel(x.month).padEnd(9), 'uzaklık', x.distance.toFixed(2), '| altın', pc(x.returns.GOLD), 'S&P', pc(x.returns.SPX), 'DXY', pc(x.returns.DXY), 'petrol', pc(x.returns.OIL), 'USDTRY', pc(x.returns.USDTRY), 'BIST$', pc(x.returns.XU100USD))
  console.log('\nİLİŞKİLER (uzun / son 5 yıl):'); for (const r of m.relations.filter((r) => Math.abs(r.long) > 0.3 || Math.abs(r.recent - r.long) > 0.5)) console.log('  ', r.asset.short.padEnd(14), r.driverLabel.padEnd(26), r.long.toFixed(2), r.recent.toFixed(2))
})
