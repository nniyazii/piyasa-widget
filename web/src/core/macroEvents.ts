/**
 * Makro durumların başlaması, aylık mumlar üzerinde olay olarak: "getiri eğrisi tersine döndü", "Fed faiz indirmeye
 * başladı"… Olayın ayı makro seriden bulunur; sonrası, incelenen varlığın aylık mumlarından ölçülür.
 */
import { CONDITIONS, type World } from './macro'
import type { Ctx, EventDef } from './study'

const monthKey = (t: number) => { const d = new Date((t + 43200) * 1000); return d.getUTCFullYear() * 12 + d.getUTCMonth() }
/** [group] 'tr' olan durumlar yalnızca Türkiye varlıklarına uygulanır */
export function macroEventDefs(w: World, assetGroup: 'global' | 'tr'): EventDef[] {
  return CONDITIONS.filter((c) => c.group !== 'tr' || assetGroup === 'tr').map((c) => ({
    id: 'm:' + c.id, group: 'makro' as const, standalone: true, label: c.label,
    state: (x: Ctx, i: number) => c.test(w, monthKey(x.t[i])),
  }))
}
