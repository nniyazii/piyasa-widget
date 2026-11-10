/** Yıllık dilimler: Y1, Y2 (seçim), Y3 = son yıl (sınama). */
import { product } from './grid'
import { evaluate, loadLab, line, type Eval } from './lab'
import type { Condition, Screen } from '../src/core/screener'

export async function folds() {
  const l = await loadLab()
  const e = l.lastDay
  return { y1: { start: e - 3 * 365, end: e - 2 * 365 }, y2: { start: e - 2 * 365, end: e - 365 }, y3: { start: e - 365, end: e }, all: { start: e - 3 * 365, end: e } }
}

export interface FoldEval { conds: Condition[]; y1: Eval; y2: Eval; y3?: Eval; all?: Eval }

export const sc = (e?: Eval) => e?.rel.score ?? 0
/** Seçim ölçütü: ilk iki yılın en kötüsü (eşitlikte ortalaması) */
export const pick = (f: FoldEval) => Math.min(sc(f.y1), sc(f.y2)) * 1000 + (sc(f.y1) + sc(f.y2)) / 2

export async function foldSearch(base: Screen, axes: Condition[][][], top = 3) {
  const F = await folds()
  const out: FoldEval[] = []
  for (const conds of product(axes)) {
    const s = { ...base, conditions: conds }
    out.push({ conds, y1: await evaluate(s, F.y1), y2: await evaluate(s, F.y2) })
  }
  out.sort((a, b) => pick(b) - pick(a))
  const best = out.slice(0, top)
  for (const c of best) {
    c.y3 = await evaluate({ ...base, conditions: c.conds }, F.y3)
    c.all = await evaluate({ ...base, conditions: c.conds }, F.all)
  }
  return { best, tried: out.length }
}

export async function foldEval(s: Screen): Promise<Required<FoldEval>> {
  const F = await folds()
  return { conds: s.conditions, y1: await evaluate(s, F.y1), y2: await evaluate(s, F.y2), y3: await evaluate(s, F.y3), all: await evaluate(s, F.all) }
}

export function show(label: string, f: FoldEval) {
  return [`  ${label}`, `    y1  ${line(f.y1)}`, `    y2  ${line(f.y2)}`, `    y3* ${f.y3 ? line(f.y3) : '—'}`, `    tümü ${f.all ? line(f.all) : '—'}`].join('\n')
}
