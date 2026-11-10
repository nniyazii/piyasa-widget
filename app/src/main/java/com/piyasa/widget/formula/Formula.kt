package com.piyasa.widget.formula

import java.util.Locale
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.log10
import kotlin.math.pow
import kotlin.math.sqrt

/**
 * Küçük, bağımlılıksız formül dili.
 *
 *   GRAM_ALTIN = ONS * USDTRY / OZ
 *   BIST_USD   = XU100 / USDTRY
 *   FARK       = pct(GRAM_ALTIN, prev(GRAM_ALTIN))
 *
 * Operatörler: + - * / ^ ve parantez. Ondalık ayırıcı nokta, argüman ayırıcı virgül veya noktalı virgül.
 * Değişken isimleri büyük/küçük harf duyarsızdır.
 */
open class FormulaException(message: String, val position: Int = -1) : Exception(message)

/** Değişken tanımlı ama henüz fiyatı (veya önceki kapanışı) yok. */
class NoDataException(val name: String) : FormulaException("$name için veri yok")

sealed interface Node {
    data class Num(val value: Double) : Node
    data class Var(val name: String, val pos: Int) : Node
    data class Unary(val op: Char, val operand: Node) : Node
    data class Bin(val op: Char, val left: Node, val right: Node) : Node
    data class Call(val name: String, val args: List<Node>, val pos: Int) : Node
}

object Formulas {
    const val TROY_OUNCE_GRAMS = 31.1034768

    val constants: Map<String, Double> = mapOf(
        "OZ" to TROY_OUNCE_GRAMS,
        "PI" to Math.PI,
        "E" to Math.E,
    )

    val functionNames: Set<String> = setOf(
        "min", "max", "avg", "sum", "abs", "sqrt", "ln", "log", "exp", "pow",
        "round", "floor", "ceil", "pct", "prev", "chg",
    )

    /** Kullanıcı anahtarı olarak kullanılamayacak isimler. */
    val reserved: Set<String> = constants.keys + functionNames.map { it.uppercase(Locale.ROOT) }

    fun normalizeName(name: String): String = name.trim().uppercase(Locale.ROOT)

    private val keyRegex = Regex("^[A-Z_][A-Z0-9_]*$")

    fun isValidKey(key: String): Boolean = keyRegex.matches(key) && key !in reserved

    /** Serbest metinden geçerli bir anahtar üretir: "Gram Altın" -> "GRAM_ALTIN". */
    fun suggestKey(text: String): String {
        val map = mapOf('ç' to 'c', 'ğ' to 'g', 'ı' to 'i', 'ö' to 'o', 'ş' to 's', 'ü' to 'u',
            'Ç' to 'C', 'Ğ' to 'G', 'İ' to 'I', 'Ö' to 'O', 'Ş' to 'S', 'Ü' to 'U')
        val ascii = text.map { map[it] ?: it }.joinToString("")
        var key = ascii.uppercase(Locale.ROOT).replace(Regex("[^A-Z0-9]+"), "_").trim('_')
        if (key.isEmpty()) key = "F"
        if (key.first().isDigit()) key = "F_$key"
        if (key in reserved) key += "_1"
        return key
    }

    fun variables(node: Node): Set<String> = buildSet { collect(node, this) }

    private fun collect(node: Node, out: MutableSet<String>) {
        when (node) {
            is Node.Num -> Unit
            is Node.Var -> if (node.name !in constants) out += node.name
            is Node.Unary -> collect(node.operand, out)
            is Node.Bin -> { collect(node.left, out); collect(node.right, out) }
            is Node.Call -> node.args.forEach { collect(it, out) }
        }
    }
}

class Parser private constructor(private val src: String) {
    private var pos = 0

    companion object {
        fun parse(src: String): Node {
            if (src.isBlank()) throw FormulaException("Formül boş")
            val p = Parser(src)
            val node = p.expression()
            p.skipWs()
            if (p.pos < src.length) throw FormulaException("Beklenmeyen '${src[p.pos]}' (konum ${p.pos + 1})", p.pos)
            return node
        }
    }

    private fun skipWs() {
        while (pos < src.length && src[pos].isWhitespace()) pos++
    }

    private fun peek(): Char? {
        skipWs()
        return src.getOrNull(pos)
    }

    private fun expression(): Node {
        var left = term()
        while (true) {
            val c = peek()
            if (c == '+' || c == '-') {
                pos++
                left = Node.Bin(c, left, term())
            } else return left
        }
    }

    private fun term(): Node {
        var left = unary()
        while (true) {
            val c = peek()
            if (c == '*' || c == '/' || c == '×' || c == '÷') {
                pos++
                val op = when (c) { '×' -> '*'; '÷' -> '/'; else -> c }
                left = Node.Bin(op, left, unary())
            } else return left
        }
    }

    private fun unary(): Node {
        val c = peek()
        if (c == '-' || c == '+' || c == '−') {
            pos++
            return Node.Unary(if (c == '+') '+' else '-', unary())
        }
        return power()
    }

    // Sağdan birleşimli: 2^3^2 = 2^(3^2); -2^2 = -(2^2)
    private fun power(): Node {
        val base = primary()
        if (peek() == '^') {
            pos++
            return Node.Bin('^', base, unary())
        }
        return base
    }

    private fun primary(): Node {
        val c = peek() ?: throw FormulaException("Formül beklenmedik şekilde bitti", pos)
        return when {
            c == '(' -> {
                pos++
                val inner = expression()
                expect(')')
                inner
            }
            c.isDigit() || c == '.' -> number()
            c.isLetter() || c == '_' -> identifier()
            else -> throw FormulaException("Beklenmeyen '$c' (konum ${pos + 1})", pos)
        }
    }

    private fun expect(ch: Char) {
        if (peek() != ch) throw FormulaException("'$ch' bekleniyordu (konum ${pos + 1})", pos)
        pos++
    }

    private fun number(): Node {
        val start = pos
        while (pos < src.length && (src[pos].isDigit() || src[pos] == '.')) pos++
        // üs: 1e3, 2.5E-4
        if (pos < src.length && (src[pos] == 'e' || src[pos] == 'E')) {
            val save = pos
            pos++
            if (pos < src.length && (src[pos] == '+' || src[pos] == '-')) pos++
            if (pos < src.length && src[pos].isDigit()) {
                while (pos < src.length && src[pos].isDigit()) pos++
            } else pos = save
        }
        val text = src.substring(start, pos)
        val v = text.toDoubleOrNull() ?: throw FormulaException("Geçersiz sayı '$text'", start)
        return Node.Num(v)
    }

    private fun identifier(): Node {
        val start = pos
        while (pos < src.length && (src[pos].isLetterOrDigit() || src[pos] == '_')) pos++
        val raw = src.substring(start, pos)
        if (peek() == '(') {
            pos++
            val args = mutableListOf<Node>()
            if (peek() != ')') {
                while (true) {
                    args += expression()
                    val sep = peek()
                    if (sep == ',' || sep == ';') pos++ else break
                }
            }
            expect(')')
            val fn = raw.lowercase(Locale.ROOT)
            if (fn !in Formulas.functionNames) throw FormulaException("Bilinmeyen fonksiyon '$raw'", start)
            return Node.Call(fn, args, start)
        }
        return Node.Var(Formulas.normalizeName(raw), start)
    }
}

/**
 * @param resolve değişkenin güncel (prev=false) ya da önceki kapanış (prev=true) değerini döndürür.
 */
class Evaluator(private val resolve: (name: String, prev: Boolean) -> Double) {

    fun evaluate(node: Node, prev: Boolean = false): Double {
        val v = eval(node, prev)
        if (v.isNaN() || v.isInfinite()) throw FormulaException("Geçersiz sonuç")
        return v
    }

    private fun eval(node: Node, prev: Boolean): Double = when (node) {
        is Node.Num -> node.value
        is Node.Var -> Formulas.constants[node.name] ?: resolve(node.name, prev)
        is Node.Unary -> if (node.op == '-') -eval(node.operand, prev) else eval(node.operand, prev)
        is Node.Bin -> {
            val a = eval(node.left, prev)
            val b = eval(node.right, prev)
            when (node.op) {
                '+' -> a + b
                '-' -> a - b
                '*' -> a * b
                '/' -> if (b == 0.0) throw FormulaException("Sıfıra bölme") else a / b
                '^' -> a.pow(b)
                else -> throw FormulaException("Bilinmeyen operatör ${node.op}")
            }
        }
        is Node.Call -> call(node, prev)
    }

    private fun call(node: Node.Call, prev: Boolean): Double {
        val n = node.args.size
        fun arity(vararg allowed: Int) {
            if (n !in allowed) {
                throw FormulaException("${node.name}() ${allowed.joinToString(" veya ")} argüman alır", node.pos)
            }
        }
        fun arg(i: Int) = eval(node.args[i], prev)
        fun all(): List<Double> {
            if (n == 0) throw FormulaException("${node.name}() en az bir argüman alır", node.pos)
            return node.args.map { eval(it, prev) }
        }
        return when (node.name) {
            "min" -> all().min()
            "max" -> all().max()
            "sum" -> all().sum()
            "avg" -> all().average()
            "abs" -> { arity(1); abs(arg(0)) }
            "sqrt" -> { arity(1); sqrt(arg(0)) }
            "ln" -> { arity(1); ln(arg(0)) }
            "log" -> { arity(1); log10(arg(0)) }
            "exp" -> { arity(1); exp(arg(0)) }
            "pow" -> { arity(2); arg(0).pow(arg(1)) }
            "floor" -> { arity(1); floor(arg(0)) }
            "ceil" -> { arity(1); ceil(arg(0)) }
            "round" -> {
                arity(1, 2)
                val digits = if (n == 2) arg(1).toInt() else 0
                val f = 10.0.pow(digits)
                Math.round(arg(0) * f) / f
            }
            // a'nın b'ye göre yüzde farkı
            "pct" -> {
                arity(2)
                val b = arg(1)
                if (b == 0.0) throw FormulaException("Sıfıra bölme")
                (arg(0) / b - 1.0) * 100.0
            }
            // ifadenin önceki kapanıştaki değeri
            "prev" -> { arity(1); eval(node.args[0], true) }
            // ifadenin günlük yüzde değişimi
            "chg" -> {
                arity(1)
                val now = eval(node.args[0], prev)
                val before = eval(node.args[0], true)
                if (before == 0.0) throw FormulaException("Sıfıra bölme")
                (now / before - 1.0) * 100.0
            }
            else -> throw FormulaException("Bilinmeyen fonksiyon '${node.name}'", node.pos)
        }
    }
}
