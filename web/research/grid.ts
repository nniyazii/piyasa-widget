/** Izgara araması: eğitimde seç, sınamada doğrula. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { describe as describeCond, type Condition, type FieldId, type Screen } from '../src/core/screener'
import { evaluate, line, loadLab, periods, type Eval } from './lab'

export const MLR = 1e9
export const C = (left: FieldId, op: Condition['op'], right: FieldId | null, value: number): Condition => ({ left, op, right, value })

/** Kartezyen çarpım: her eksen bir koşul listesi üretir (boş liste = o eksen koşul eklemez). */
export function product(axes: Condition[][][]): Condition[][] {
  return axes.reduce<Condition[][]>((acc, axis) => acc.flatMap((a) => axis.map((x) => [...a, ...x])), [[]])
}

export interface Candidate { conds: Condition[]; train: Eval; test: Eval; all: Eval }

export async function search(base: Screen, axes: Condition[][][], opts: { top?: number } = {}): Promise<Candidate[]> {
  const l = await loadLab()
  const P = periods(l)
  const out: Candidate[] = []
  for (const conds of product(axes)) {
    const s = { ...base, conditions: conds }
    const train = await evaluate(s, P.train)
    out.push({ conds, train, test: undefined as never, all: undefined as never })
  }
  // Eğitim skoruna göre sırala (eşitlikte 1A t), yalnızca ilk [top] aday sınamaya girer
  const key = (e: Eval) => (e.rel.score ?? -1) * 100 + (e.rel.t1m ?? -9)
  out.sort((a, b) => key(b.train) - key(a.train))
  const top = out.slice(0, opts.top ?? 5)
  for (const c of top) {
    c.test = await evaluate({ ...base, conditions: c.conds }, P.test)
    c.all = await evaluate({ ...base, conditions: c.conds }, P.all)
  }
  return top
}

export const describeAll = (c: Condition[]) => c.map(describeCond).join('; ')

export function report(name: string, baseline: { train: Eval; test: Eval; all: Eval }, top: Candidate[]) {
  const rows: string[] = [`\n■ ${name}`, `  mevcut: ${describeAll(baselineConds)}`]
  rows.push(`    eğitim ${line(baseline.train)}`, `    sınama ${line(baseline.test)}`, `    tümü   ${line(baseline.all)}`)
  top.forEach((c, i) => {
    rows.push(`  aday ${i + 1}: ${describeAll(c.conds)}`, `    eğitim ${line(c.train)}`, `    sınama ${line(c.test)}`, `    tümü   ${line(c.all)}`)
  })
  console.log(rows.join('\n'))
}
let baselineConds: Condition[] = []
export const setBaseline = (c: Condition[]) => { baselineConds = c }

export function save(path: string, data: unknown) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 1))
}
