/**
 * Görünüm'ün hazır hâli (Android uygulaması için): DATA=dist/data/macro.json OUT=dist/data/outlook.json npm run outlook
 * Hesap web'dekiyle aynı motorla yapılır (src/core/outlook.ts); uygulama yalnızca gösterir.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { it } from 'vitest'
import { monthLabel, world, type MacroData } from '../src/core/macro'
import { macroEventDefs } from '../src/core/macroEvents'
import { LAYER_LABEL, outlookView } from '../src/core/outlook'
import { agoLabel, eventDefs, prepare, recentStudies, sentence, TF_LABEL, type Study, type Tf } from '../src/core/study'
import { convertFrames, framesFromFile, GRAM, IN_USD, MACRO_ASSETS, type AssetInfo, type CandleFile, type Frames } from '../src/core/subject'

const dayFmt = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const monthFmt = new Intl.DateTimeFormat('tr-TR', { month: 'short', year: 'numeric', timeZone: 'UTC' })

it('görünüm dışa aktarımı', () => {
  const path = process.env.DATA ?? 'public/data/macro.json'
  const data = JSON.parse(readFileSync(path, 'utf8')) as MacroData
  const v = outlookView(data)
  const w = world(data)
  // Mumlar makro dosyanın yanındaki candles klasöründen; bütün varlıklar, üç zaman dilimi
  const dir = process.env.CANDLES ?? join(dirname(path), 'candles')
  const file = (id: string): Frames | undefined => { const f = join(dir, `${id}.json`); return existsSync(f) ? framesFromFile(JSON.parse(readFileSync(f, 'utf8')) as CandleFile) : undefined }
  const fx = file('USDTRY')
  const hits: { a: AssetInfo; tf: Tf; t: number; s: Study; diff: number }[] = []
  let tested = 0, recent = 0
  for (const a of MACRO_ASSETS) {
    let frames = file(a.source ?? a.id)
    if (frames && a.via) frames = fx ? convertFrames(frames, fx, a.via === 'gram' ? GRAM : IN_USD) : undefined
    if (!frames) continue
    for (const tf of ['M', 'W', 'D'] as Tf[]) {
      const b = frames[tf]
      if (!b || b.t.length < 120) continue
      const x = prepare(b, tf)
      const defs = [...eventDefs(tf), ...(tf === 'M' ? macroEventDefs(w, a.group) : [])].filter((d) => !d.needsVolume || !!x.v)
      const r = recentStudies(x, defs)
      tested += defs.length; recent += r.length
      for (const s of r) if (s.best) hits.push({ a, tf, t: x.t[s.recent!.index], s, diff: Math.abs(s.best.up - s.best.base) })
    }
  }
  hits.sort((p, q) => q.diff - p.diff)
  const seen = new Map<string, number>()
  const top = hits.filter((h) => { const k = h.a.id + h.tf; const n = seen.get(k) ?? 0; seen.set(k, n + 1); return n < 2 }).slice(0, 24)
  const out = {
    generated: Date.now(), month: v.month, regime: v.regime,
    conditions: v.macro.activeConditions.map((c) => c.label),
    analogs: v.macro.analogs.list.slice(0, 5).map((x) => monthLabel(x.month)),
    // Yakın zamanda gerçekleşen ve sonrasında yönü her zamankinden belirgin biçimde ayrıştırmış olaylar (bugünden sonraki dört vade)
    tested, recent,
    events: top.map((h) => ({
      asset: h.a.short, id: h.a.id, event: h.s.def.id, tf: h.tf, frame: TF_LABEL[h.tf],
      date: (h.tf === 'M' ? monthFmt : dayFmt).format(h.t * 1000), ago: agoLabel(h.tf, h.s.recent!.elapsed),
      macro: h.s.def.group === 'makro', text: sentence(h.a.short, h.s), times: h.s.recent!.stats[0].n,
      odds: h.s.view.map((o) => ({ label: o.label, n: o.n, up: Number.isNaN(o.up) ? null : Number(o.up.toFixed(3)), base: Number(o.base.toFixed(3)), median: Number.isNaN(o.median) ? null : Number(o.median.toFixed(4)), clear: o.clear })),
    })),
    list: v.list.map((o) => ({
      id: o.asset.id, label: o.asset.label, short: o.asset.short, price: o.price, stance: o.stance, conviction: o.conviction, score: o.score, why: o.why, flips: o.flips,
      layers: o.layers.map((l) => ({ id: l.id, label: LAYER_LABEL[l.id], vote: l.vote, counts: l.counts, text: l.text, record: l.record })),
    })),
  }
  writeFileSync(process.env.OUT ?? 'public/data/outlook.json', JSON.stringify(out))
  console.log(`görünüm: ${out.list.map((o) => `${o.short} ${o.stance}`).join(', ')}\nolaylar: ${tested} sınandı, ${recent} yakın zamanda, ${hits.length} belirgin\n${out.events.slice(0, 6).map((e) => `  [${e.frame}] ${e.text}`).join('\n')}`)
})
