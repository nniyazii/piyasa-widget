/** Aylık makro seriler (data/macro.json): bir kez yüklenir. */
import { world, type MacroData, type World } from '../core/macro'

let cache: Promise<MacroData | undefined> | undefined
export const loadMacro = () => (cache ??= fetch('data/macro.json', { cache: 'no-cache' }).then((r) => (r.ok ? (r.json() as Promise<MacroData>) : undefined)).catch(() => undefined))
let w: { d: MacroData; w: World } | undefined
export const loadWorld = () => loadMacro().then((d) => (d ? (w?.d === d ? w : (w = { d, w: world(d) })).w : undefined))
