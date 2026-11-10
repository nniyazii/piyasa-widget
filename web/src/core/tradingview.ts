import { CONSTANTS, orderedVariables, parse, type Node } from './formula'
import type { Formula, Instrument } from './models'

/**
 * Enstrüman ve formülleri TradingView sembollerine çevirir.
 * Formüller TradingView'un spread sözdizimine açılır: GRAM_ALTIN → OANDA:XAUUSD*FX:USDTRY/31.1034768
 */
interface Ctx {
  instruments: Instrument[]
  formulas: Formula[]
}

interface Expr { text: string; prec: number }
const ATOM = 3
const precOf = (op: string) => (op === '+' || op === '-' ? 1 : 2)
const wrap = (e: Expr, min: number) => (e.prec < min ? `(${e.text})` : e.text)
const num = (v: number) => (Number.isInteger(v) && Math.abs(v) < 1e15 ? String(v) : String(v))

function expand(ctx: Ctx, node: Node, visiting: Set<string>): Expr | null {
  switch (node.t) {
    case 'num': return { text: num(node.value), prec: ATOM }
    case 'var': {
      const c = CONSTANTS[node.name]
      if (c !== undefined) return { text: num(c), prec: ATOM }
      const ins = ctx.instruments.find((i) => i.key === node.name)
      if (ins) return { text: ins.symbol, prec: ATOM }
      const f = ctx.formulas.find((x) => x.key === node.name)
      if (f && !visiting.has(f.key)) {
        visiting.add(f.key)
        let r: Expr | null = null
        try { r = expand(ctx, parse(f.expression), visiting) } catch { r = null }
        visiting.delete(f.key)
        return r
      }
      return null
    }
    case 'unary': {
      const e = expand(ctx, node.operand, visiting)
      if (!e) return null
      return node.op === '+' ? e : { text: '-' + wrap(e, ATOM), prec: 2 }
    }
    case 'bin': {
      if (node.op === '^') return null
      const l = expand(ctx, node.left, visiting)
      const r = expand(ctx, node.right, visiting)
      if (!l || !r) return null
      const p = precOf(node.op)
      const rightNeed = node.op === '-' || node.op === '/' ? p + 1 : p
      return { text: wrap(l, p) + node.op + wrap(r, rightNeed), prec: p }
    }
    case 'call': return null
  }
}

function firstInstrument(ctx: Ctx, node: Node, visiting: Set<string>): Instrument | undefined {
  for (const name of orderedVariables(node)) {
    const ins = ctx.instruments.find((i) => i.key === name)
    if (ins) return ins
    const f = ctx.formulas.find((x) => x.key === name)
    if (!f || visiting.has(name)) continue
    visiting.add(name)
    try {
      const r = firstInstrument(ctx, parse(f.expression), visiting)
      if (r) return r
    } catch { /* geçersiz formül */ }
  }
  return undefined
}

/** Anahtar için TradingView sembolü/ifadesi; çevrilemiyorsa formüldeki ilk enstrüman. */
export function symbolFor(ctx: Ctx, key: string): string | undefined {
  const ins = ctx.instruments.find((i) => i.key === key)
  if (ins) return ins.symbol
  const f = ctx.formulas.find((x) => x.key === key)
  if (!f) return undefined
  let node: Node
  try { node = parse(f.expression) } catch { return undefined }
  const e = expand(ctx, node, new Set([key]))
  if (e) return e.text
  return firstInstrument(ctx, node, new Set([key]))?.symbol
}

/** Formül TradingView'da birebir açılabiliyor mu (fonksiyon içermiyor). */
export function isExactSpread(ctx: Ctx, key: string): boolean {
  const f = ctx.formulas.find((x) => x.key === key)
  if (!f) return true
  try { return expand(ctx, parse(f.expression), new Set([key])) !== null } catch { return false }
}

export const chartUrl = (symbol: string) => 'https://www.tradingview.com/chart/?symbol=' + encodeURIComponent(symbol)

export function chartUrlFor(ctx: Ctx, key: string): string | undefined {
  const s = symbolFor(ctx, key)
  return s ? chartUrl(s) : undefined
}
