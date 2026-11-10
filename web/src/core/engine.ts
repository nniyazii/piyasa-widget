import { evaluate, FormulaError, NoDataError, parse, type Node } from './formula'
import * as Fmt from './format'
import type { Change } from './format'
import type { Formula, Instrument, Quote } from './models'
import { chartUrlFor } from './tradingview'

export interface EvalResult {
  value?: number
  prev?: number
  error?: string
}

interface Ctx {
  instruments: Instrument[]
  formulas: Formula[]
  quotes: Record<string, Quote>
}

/** Formülleri mevcut fiyatlarla hesaplar; formüller birbirine ve enstrümanlara başvurabilir. */
export class FormulaEngine {
  private readonly instrumentKeys: Set<string>
  private readonly formulaByKey: Map<string, Formula>
  private readonly parsed = new Map<string, Node>()
  private readonly cache = new Map<string, EvalResult>()
  private stack: string[] = []

  constructor(private readonly ctx: Ctx) {
    this.instrumentKeys = new Set(ctx.instruments.map((i) => i.key))
    this.formulaByKey = new Map(ctx.formulas.map((f) => [f.key, f]))
  }

  has(name: string) {
    return this.instrumentKeys.has(name) || this.formulaByKey.has(name)
  }

  private node(key: string): Node {
    let n = this.parsed.get(key)
    if (!n) {
      n = parse(this.formulaByKey.get(key)!.expression)
      this.parsed.set(key, n)
    }
    return n
  }

  private resolve = (name: string, prev: boolean): number => {
    if (this.instrumentKeys.has(name)) {
      const q = this.ctx.quotes[name]
      if (!q) throw new NoDataError(name)
      if (prev) {
        if (q.prevClose == null) throw new NoDataError(name)
        return q.prevClose
      }
      return q.price
    }
    if (this.formulaByKey.has(name)) {
      if (this.stack.includes(name)) throw new FormulaError(`Döngüsel başvuru: ${[...this.stack, name].join(' → ')}`)
      this.stack.push(name)
      try {
        return evaluate(this.node(name), this.resolve, prev)
      } finally {
        this.stack.pop()
      }
    }
    throw new FormulaError(`Bilinmeyen değişken: ${name}`)
  }

  evaluateKey(key: string): EvalResult {
    const hit = this.cache.get(key)
    if (hit) return hit
    const r = this.run(null, (prev) => this.resolve(key, prev))
    this.cache.set(key, r)
    return r
  }

  evaluateExpression(expression: string, selfKey?: string): EvalResult {
    let node: Node
    try {
      node = parse(expression)
    } catch (e) {
      return { error: (e as Error).message }
    }
    return this.run(selfKey ?? null, (prev) => evaluate(node, this.resolve, prev))
  }

  private run(selfKey: string | null, block: (prev: boolean) => number): EvalResult {
    const once = (prev: boolean) => {
      this.stack = selfKey ? [selfKey] : []
      return block(prev)
    }
    let value: number
    try {
      value = once(false)
    } catch (e) {
      return { error: (e as Error).message }
    }
    let prev: number | undefined
    try {
      prev = once(true)
    } catch {
      prev = undefined
    }
    return { value, prev }
  }
}

export interface DisplayItem {
  key: string
  title: string
  subtitle: string
  value?: number
  prev?: number
  valueText: string
  change: Change
  error?: string
  isFormula: boolean
  quote?: Quote
  decimals: number
  prefix: string
  suffix: string
  url?: string
}

export function displayItem(ctx: Ctx, engine: FormulaEngine, key: string): DisplayItem | undefined {
  const ins = ctx.instruments.find((i) => i.key === key)
  if (ins) {
    const q = ctx.quotes[key]
    return {
      key,
      title: ins.name,
      subtitle: ins.note ? `${ins.symbol}, ${ins.note}` : ins.symbol,
      value: q?.price,
      prev: q?.prevClose,
      valueText: q ? Fmt.value(q.price, ins.decimals, ins.prefix, ins.suffix) : '—',
      change: Fmt.changeFor(q?.price, q?.prevClose, ins.suffix),
      error: q ? undefined : 'Veri bekleniyor',
      isFormula: false,
      quote: q,
      decimals: ins.decimals,
      prefix: ins.prefix,
      suffix: ins.suffix,
      url: chartUrlFor(ctx, key),
    }
  }
  const f = ctx.formulas.find((x) => x.key === key)
  if (f) {
    const r = engine.evaluateKey(key)
    return {
      key,
      title: f.name,
      subtitle: f.expression,
      value: r.value,
      prev: r.prev,
      valueText: r.value != null ? Fmt.value(r.value, f.decimals, f.prefix, f.suffix) : '—',
      change: Fmt.changeFor(r.value, r.prev, f.suffix),
      error: r.error,
      isFormula: true,
      decimals: f.decimals,
      prefix: f.prefix,
      suffix: f.suffix,
      url: chartUrlFor(ctx, key),
    }
  }
  return undefined
}
