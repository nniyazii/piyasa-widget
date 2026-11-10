package com.piyasa.widget.formula

import java.util.Locale

/**
 * Görsel formül kurucusu için ifadeyi parçalara (token) ayırır ve geri birleştirir.
 * Fonksiyonlar açılış paranteziyle tek parça tutulur: "pct(", "chg(" ...
 */
object Tokens {

    fun tokenize(expr: String): List<String> {
        val out = mutableListOf<String>()
        var i = 0
        while (i < expr.length) {
            val c = expr[i]
            when {
                c.isWhitespace() -> i++
                c.isDigit() || c == '.' -> {
                    val start = i
                    while (i < expr.length && (expr[i].isDigit() || expr[i] == '.')) i++
                    if (i < expr.length && (expr[i] == 'e' || expr[i] == 'E')) {
                        val save = i
                        i++
                        if (i < expr.length && (expr[i] == '+' || expr[i] == '-')) i++
                        if (i < expr.length && expr[i].isDigit()) {
                            while (i < expr.length && expr[i].isDigit()) i++
                        } else i = save
                    }
                    out += expr.substring(start, i)
                }
                c.isLetter() || c == '_' -> {
                    val start = i
                    while (i < expr.length && (expr[i].isLetterOrDigit() || expr[i] == '_')) i++
                    val name = expr.substring(start, i)
                    var j = i
                    while (j < expr.length && expr[j].isWhitespace()) j++
                    if (j < expr.length && expr[j] == '(') {
                        out += name.lowercase(Locale.ROOT) + "("
                        i = j + 1
                    } else {
                        out += Formulas.normalizeName(name)
                    }
                }
                else -> {
                    out += when (c) {
                        '×' -> "*"
                        '÷' -> "/"
                        '−' -> "-"
                        ',' -> ";"
                        else -> c.toString()
                    }
                    i++
                }
            }
        }
        return out
    }

    fun render(tokens: List<String>): String = buildString {
        tokens.forEachIndexed { i, t ->
            val prev = tokens.getOrNull(i - 1)
            if (prev != null && !prev.endsWith("(") && t != ")" && t != ";") append(' ')
            append(t)
        }
    }

    fun isFunction(t: String) = t.endsWith("(") && t.length > 1
    fun isNumber(t: String) = t.firstOrNull()?.let { it.isDigit() || it == '.' } == true
    fun isOperator(t: String) = t in setOf("+", "-", "*", "/", "^")
    fun isVariable(t: String) = !isFunction(t) && !isNumber(t) && t.firstOrNull()?.let { it.isLetter() || it == '_' } == true

    /** Kullanıcı girişi: "31,1" -> "31.1". Geçersizse null. */
    fun parseNumber(input: String): String? {
        val s = input.trim().replace(',', '.')
        val v = s.toDoubleOrNull() ?: return null
        if (v < 0) return null
        return s.trimStart('+')
    }
}
