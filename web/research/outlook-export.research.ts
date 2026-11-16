/**
 * Görünüm'ün hazır hâli (Android uygulaması için): DATA=dist/data/macro.json OUT=dist/data/outlook.json npm run outlook
 * Hesap web'dekiyle aynı motorla yapılır (src/core/outlook.ts); uygulama yalnızca gösterir.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { monthLabel, type MacroData } from '../src/core/macro'
import { LAYER_LABEL, outlookView } from '../src/core/outlook'

it('görünüm dışa aktarımı', () => {
  const v = outlookView(JSON.parse(readFileSync(process.env.DATA ?? 'public/data/macro.json', 'utf8')) as MacroData)
  const out = {
    generated: Date.now(), month: v.month, regime: v.regime,
    conditions: v.macro.activeConditions.map((c) => c.label),
    analogs: v.macro.analogs.list.slice(0, 5).map((x) => monthLabel(x.month)),
    list: v.list.map((o) => ({
      id: o.asset.id, label: o.asset.label, short: o.asset.short, price: o.price, stance: o.stance, conviction: o.conviction, score: o.score, why: o.why, flips: o.flips,
      layers: o.layers.map((l) => ({ id: l.id, label: LAYER_LABEL[l.id], vote: l.vote, counts: l.counts, text: l.text, record: l.record })),
    })),
  }
  writeFileSync(process.env.OUT ?? 'public/data/outlook.json', JSON.stringify(out))
  console.log(`görünüm: ${out.list.map((o) => `${o.short} ${o.stance}`).join(', ')}`)
})
