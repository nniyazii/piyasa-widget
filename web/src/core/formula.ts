/**
 * Küçük, bağımlılıksız formül dili (Android uygulamasıyla birebir aynı).
 *
 *   GRAM_ALTIN = ONS * USDTRY / OZ
 *   BIST_USD   = XU100 / USDTRY
 *   FARK       = pct(GRAM_ALTIN; prev(GRAM_ALTIN))
 *
 * Operatörler: + - * / ^ ve parantez. Ondalık ayırıcı nokta, argüman ayırıcı virgül veya noktalı virgül.
 * Değişken adları büyük/küçük harf duyarsızdır.
 */

export class FormulaError extends Error {
  constructor(message: string, readonly position = -1) {
    super(message)
  }
}

/** Değişken tanımlı ama henüz fiyatı (veya önceki kapanışı) yok. */
export class NoDataError extends FormulaError {
  constructor(readonly variable: string) {
    super(`${variable} için veri yok`)
  }
}

export type Node =
  | { t: 'num'; value: number }
  | { t: 'var'; name: string; pos: number }
  | { t: 'unary'; op: '+' | '-'; operand: Node }
  | { t: 'bin'; op: '+' | '-' | '*' | '/' | '^'; left: Node; right: Node }
  | { t: 'call'; name: string; args: Node[]; pos: number }

export const TROY_OUNCE_GRAMS = 31.1034768

export const CONSTANTS: Record<string, number> = { OZ: TROY_OUNCE_GRAMS, PI: Math.PI, E: Math.E }

export const FUNCTIONS = [
  'min', 'max', 'avg', 'sum', 'abs', 'sqrt', 'ln', 'log', 'exp', 'pow',
  'round', 'floor', 'ceil', 'pct', 'prev', 'chg',
] as const

const FUNCTION_SET = new Set<string>(FUNCTIONS)

/** Kullanıcı anahtarı olarak kullanılamayacak adlar. */
export const RESERVED = new Set<string>([...Object.keys(CONSTANTS), ...FUNCTIONS.map((f) => f.toUpperCase())])

export const normalizeName = (name: string) => name.trim().toUpperCase()

const KEY_RE = /^[A-Z_][A-Z0-9_]*$/

export const isValidKey = (key: string) => KEY_RE.test(key) && !RESERVED.has(key)

const TR_ASCII: Record<string, string> = {
  ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U',
}

/** Serbest metinden geçerli bir anahtar: "Gram Altın" → "GRAM_ALTIN". */
export function suggestKey(text: string): string {
  const ascii = [...text].map((c) => TR_ASCII[c] ?? c).join('')
  let key = ascii.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (!key) key = 'F'
  if (/^\d/.test(key)) key = 'F_' + key
  if (RESERVED.has(key)) key += '_1'
  return key
}

/** [key] alınmışsa _2, _3 … ekler. */
export function uniqueKey(key: string, taken: Iterable<string>): string {
  const set = new Set(taken)
  if (!set.has(key)) return key
  let n = 2
  while (set.has(`${key}_${n}`)) n++
  return `${key}_${n}`
}

export function variables(node: Node, out = new Set<string>()): Set<string> {
  switch (node.t) {
    case 'num': break
    case 'var': if (!(node.name in CONSTANTS)) out.add(node.name); break
    case 'unary': variables(node.operand, out); break
    case 'bin': variables(node.left, out); variables(node.right, out); break
    case 'call': node.args.forEach((a) => variables(a, out)); break
  }
  return out
}

/** Formüldeki değişkenler, ilk görülme sırasıyla. */
export function orderedVariables(node: Node): string[] {
  switch (node.t) {
    case 'num': return []
    case 'var': return [node.name]
    case 'unary': return orderedVariables(node.operand)
    case 'bin': return [...orderedVariables(node.left), ...orderedVariables(node.right)]
    case 'call': return node.args.flatMap(orderedVariables)
  }
}

const isDigit = (c: string | undefined) => c !== undefined && c >= '0' && c <= '9'
const isLetter = (c: string | undefined) => c !== undefined && /\p{L}/u.test(c)
const isWs = (c: string | undefined) => c !== undefined && /\s/.test(c)

export function parse(src: string): Node {
  if (!src.trim()) throw new FormulaError('Formül boş')
  let pos = 0
  const peek = () => {
    while (pos < src.length && isWs(src[pos])) pos++
    return src[pos]
  }
  const expect = (ch: string) => {
    if (peek() !== ch) throw new FormulaError(`'${ch}' bekleniyordu (konum ${pos + 1})`, pos)
    pos++
  }
  const expression = (): Node => {
    let left = term()
    for (;;) {
      const c = peek()
      if (c === '+' || c === '-' || c === '−') {
        pos++
        left = { t: 'bin', op: c === '+' ? '+' : '-', left, right: term() }
      } else return left
    }
  }
  const term = (): Node => {
    let left = unary()
    for (;;) {
      const c = peek()
      if (c === '*' || c === '/' || c === '×' || c === '÷') {
        pos++
        const op = c === '×' ? '*' : c === '÷' ? '/' : c
        left = { t: 'bin', op, left, right: unary() }
      } else return left
    }
  }
  const unary = (): Node => {
    const c = peek()
    if (c === '-' || c === '+' || c === '−') {
      pos++
      return { t: 'unary', op: c === '+' ? '+' : '-', operand: unary() }
    }
    return power()
  }
  // Sağdan birleşimli: 2^3^2 = 2^(3^2); -2^2 = -(2^2)
  const power = (): Node => {
    const base = primary()
    if (peek() === '^') {
      pos++
      return { t: 'bin', op: '^', left: base, right: unary() }
    }
    return base
  }
  const primary = (): Node => {
    const c = peek()
    if (c === undefined) throw new FormulaError('Formül beklenmedik şekilde bitti', pos)
    if (c === '(') {
      pos++
      const inner = expression()
      expect(')')
      return inner
    }
    if (isDigit(c) || c === '.') return number()
    if (isLetter(c) || c === '_') return identifier()
    throw new FormulaError(`Beklenmeyen '${c}' (konum ${pos + 1})`, pos)
  }
  const number = (): Node => {
    const start = pos
    while (pos < src.length && (isDigit(src[pos]) || src[pos] === '.')) pos++
    if (pos < src.length && (src[pos] === 'e' || src[pos] === 'E')) {
      const save = pos
      pos++
      if (src[pos] === '+' || src[pos] === '-') pos++
      if (isDigit(src[pos])) {
        while (isDigit(src[pos])) pos++
      } else pos = save
    }
    const text = src.slice(start, pos)
    const v = Number(text)
    if (!/^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text) || Number.isNaN(v)) throw new FormulaError(`Geçersiz sayı '${text}'`, start)
    return { t: 'num', value: v }
  }
  const identifier = (): Node => {
    const start = pos
    while (pos < src.length && (isLetter(src[pos]) || isDigit(src[pos]) || src[pos] === '_')) pos++
    const raw = src.slice(start, pos)
    if (peek() === '(') {
      pos++
      const args: Node[] = []
      if (peek() !== ')') {
        for (;;) {
          args.push(expression())
          const sep = peek()
          if (sep === ',' || sep === ';') pos++
          else break
        }
      }
      expect(')')
      const fn = raw.toLowerCase()
      if (!FUNCTION_SET.has(fn)) throw new FormulaError(`Bilinmeyen fonksiyon '${raw}'`, start)
      return { t: 'call', name: fn, args, pos: start }
    }
    return { t: 'var', name: normalizeName(raw), pos: start }
  }
  const node = expression()
  peek()
  if (pos < src.length) throw new FormulaError(`Beklenmeyen '${src[pos]}' (konum ${pos + 1})`, pos)
  return node
}

export type Resolver = (name: string, prev: boolean) => number

export function evaluate(node: Node, resolve: Resolver, prev = false): number {
  const v = evalNode(node, resolve, prev)
  if (!Number.isFinite(v)) throw new FormulaError('Geçersiz sonuç')
  return v
}

function evalNode(node: Node, resolve: Resolver, prev: boolean): number {
  switch (node.t) {
    case 'num': return node.value
    case 'var': return CONSTANTS[node.name] ?? resolve(node.name, prev)
    case 'unary': return node.op === '-' ? -evalNode(node.operand, resolve, prev) : evalNode(node.operand, resolve, prev)
    case 'bin': {
      const a = evalNode(node.left, resolve, prev)
      const b = evalNode(node.right, resolve, prev)
      switch (node.op) {
        case '+': return a + b
        case '-': return a - b
        case '*': return a * b
        case '/': if (b === 0) throw new FormulaError('Sıfıra bölme'); return a / b
        case '^': return a ** b
      }
      throw new FormulaError('Bilinmeyen operatör')
    }
    case 'call': return call(node, resolve, prev)
  }
}

function call(node: Extract<Node, { t: 'call' }>, resolve: Resolver, prev: boolean): number {
  const n = node.args.length
  const arity = (...allowed: number[]) => {
    if (!allowed.includes(n)) throw new FormulaError(`${node.name}() ${allowed.join(' veya ')} argüman alır`, node.pos)
  }
  const arg = (i: number) => evalNode(node.args[i], resolve, prev)
  const all = () => {
    if (n === 0) throw new FormulaError(`${node.name}() en az bir argüman alır`, node.pos)
    return node.args.map((a) => evalNode(a, resolve, prev))
  }
  switch (node.name) {
    case 'min': return Math.min(...all())
    case 'max': return Math.max(...all())
    case 'sum': return all().reduce((a, b) => a + b, 0)
    case 'avg': { const v = all(); return v.reduce((a, b) => a + b, 0) / v.length }
    case 'abs': arity(1); return Math.abs(arg(0))
    case 'sqrt': arity(1); return Math.sqrt(arg(0))
    case 'ln': arity(1); return Math.log(arg(0))
    case 'log': arity(1); return Math.log10(arg(0))
    case 'exp': arity(1); return Math.exp(arg(0))
    case 'pow': arity(2); return arg(0) ** arg(1)
    case 'floor': arity(1); return Math.floor(arg(0))
    case 'ceil': arity(1); return Math.ceil(arg(0))
    case 'round': {
      arity(1, 2)
      const digits = n === 2 ? Math.trunc(arg(1)) : 0
      const f = 10 ** digits
      return Math.round(arg(0) * f) / f
    }
    // a'nın b'ye göre yüzde farkı
    case 'pct': {
      arity(2)
      const b = arg(1)
      if (b === 0) throw new FormulaError('Sıfıra bölme')
      return (arg(0) / b - 1) * 100
    }
    // ifadenin önceki kapanıştaki değeri
    case 'prev': arity(1); return evalNode(node.args[0], resolve, true)
    // ifadenin günlük yüzde değişimi
    case 'chg': {
      arity(1)
      const now = evalNode(node.args[0], resolve, prev)
      const before = evalNode(node.args[0], resolve, true)
      if (before === 0) throw new FormulaError('Sıfıra bölme')
      return (now / before - 1) * 100
    }
  }
  throw new FormulaError(`Bilinmeyen fonksiyon '${node.name}'`, node.pos)
}

// ------------------------------------------------------------------ parçalar (görsel kurucu)

/** İfadeyi parçalara ayırır; fonksiyonlar açılış paranteziyle tek parça: "pct(". */
export function tokenize(expr: string): string[] {
  const out: string[] = []
  let i = 0
  while (i < expr.length) {
    const c = expr[i]
    if (isWs(c)) { i++; continue }
    if (isDigit(c) || c === '.') {
      const start = i
      while (i < expr.length && (isDigit(expr[i]) || expr[i] === '.')) i++
      if (expr[i] === 'e' || expr[i] === 'E') {
        const save = i
        i++
        if (expr[i] === '+' || expr[i] === '-') i++
        if (isDigit(expr[i])) { while (isDigit(expr[i])) i++ } else i = save
      }
      out.push(expr.slice(start, i))
      continue
    }
    if (isLetter(c) || c === '_') {
      const start = i
      while (i < expr.length && (isLetter(expr[i]) || isDigit(expr[i]) || expr[i] === '_')) i++
      const name = expr.slice(start, i)
      let j = i
      while (j < expr.length && isWs(expr[j])) j++
      if (expr[j] === '(') {
        out.push(name.toLowerCase() + '(')
        i = j + 1
      } else out.push(normalizeName(name))
      continue
    }
    out.push(c === '×' ? '*' : c === '÷' ? '/' : c === '−' ? '-' : c === ',' ? ';' : c)
    i++
  }
  return out
}

export function render(tokens: string[]): string {
  let s = ''
  tokens.forEach((t, i) => {
    const prev = tokens[i - 1]
    if (prev !== undefined && !prev.endsWith('(') && t !== ')' && t !== ';') s += ' '
    s += t
  })
  return s
}

export const isFunctionToken = (t: string) => t.endsWith('(') && t.length > 1
export const isNumberToken = (t: string) => isDigit(t[0]) || t[0] === '.'
export const isOperatorToken = (t: string) => ['+', '-', '*', '/', '^'].includes(t)
export const isVariableToken = (t: string) => !isFunctionToken(t) && !isNumberToken(t) && (isLetter(t[0]) || t[0] === '_')
