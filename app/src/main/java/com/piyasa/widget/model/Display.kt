package com.piyasa.widget.model

import com.piyasa.widget.formula.Evaluator
import com.piyasa.widget.formula.FormulaException
import com.piyasa.widget.formula.NoDataException
import com.piyasa.widget.formula.Node
import com.piyasa.widget.formula.Parser
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale
import kotlin.math.abs

data class EvalResult(val value: Double?, val prev: Double?, val error: String?) {
    val change: Double?
        get() = if (value != null && prev != null && prev != 0.0) (value / prev - 1.0) * 100.0 else null
}

/** Formülleri mevcut fiyatlarla hesaplar. Formüller birbirine ve enstrümanlara referans verebilir. */
class FormulaEngine(
    instruments: List<Instrument>,
    formulas: List<Formula>,
    private val quotes: Map<String, Quote>,
) {
    constructor(state: AppState) : this(state.instruments, state.formulas, state.quotes)

    private val instrumentKeys = instruments.map { it.key }.toSet()
    private val formulaByKey = formulas.associateBy { it.key }
    private val parsed = HashMap<String, Node>()
    private val stack = ArrayDeque<String>()

    private val evaluator = Evaluator { name, prev -> resolve(name, prev) }

    private fun parsedFormula(key: String): Node =
        parsed.getOrPut(key) { Parser.parse(formulaByKey.getValue(key).expression) }

    private fun resolve(name: String, prev: Boolean): Double {
        if (name in instrumentKeys) {
            val q = quotes[name] ?: throw NoDataException(name)
            return if (prev) q.prevClose ?: throw NoDataException(name) else q.price
        }
        if (name in formulaByKey) {
            if (name in stack) throw FormulaException("Döngüsel referans: ${stack.joinToString(" → ")} → $name")
            stack.addLast(name)
            try {
                return evaluator.evaluate(parsedFormula(name), prev)
            } finally {
                stack.removeLast()
            }
        }
        throw FormulaException("Bilinmeyen değişken: $name")
    }

    fun evaluateKey(key: String): EvalResult = run(key) { prev -> resolve(key, prev) }

    fun evaluateExpression(expression: String, selfKey: String? = null): EvalResult {
        val node = try {
            Parser.parse(expression)
        } catch (e: FormulaException) {
            return EvalResult(null, null, e.message)
        }
        return run(selfKey) { prev ->
            if (selfKey != null) stack.addLast(selfKey)
            try {
                evaluator.evaluate(node, prev)
            } finally {
                if (selfKey != null) stack.removeLast()
            }
        }
    }

    private fun run(key: String?, block: (prev: Boolean) -> Double): EvalResult {
        stack.clear()
        val value = try {
            block(false)
        } catch (e: FormulaException) {
            return EvalResult(null, null, e.message)
        }
        stack.clear()
        val prev = try {
            block(true)
        } catch (e: FormulaException) {
            null
        }
        return EvalResult(value, prev, null)
    }
}

data class DisplayItem(
    val key: String,
    val title: String,
    val subtitle: String,
    val value: Double?,
    val change: Double?,
    val valueText: String,
    val changeText: String,
    val spark: List<Double>,
    val error: String?,
    val isFormula: Boolean,
    /** Dokununca açılacak TradingView grafiği. */
    val tvUrl: String? = null,
) {
    val direction: Int get() = when {
        change == null -> 0
        change > 0.005 -> 1
        change < -0.005 -> -1
        else -> 0
    }
}

object Display {

    fun build(state: AppState, keys: List<String>): List<DisplayItem> {
        val engine = FormulaEngine(state)
        return keys.mapNotNull { key -> item(state, engine, key) }
    }

    fun item(state: AppState, engine: FormulaEngine, key: String): DisplayItem? {
        state.instrument(key)?.let { ins ->
            val q = state.quotes[key]
            val change = q?.prevClose?.takeIf { it != 0.0 }?.let { (q.price / it - 1.0) * 100.0 }
            return DisplayItem(
                key = key,
                title = ins.name,
                subtitle = ins.note ?: ins.symbol,
                value = q?.price,
                change = change,
                valueText = q?.let { Fmt.value(it.price, ins.decimals, ins.prefix, ins.suffix) } ?: "—",
                changeText = Fmt.change(change),
                spark = q?.spark.orEmpty(),
                error = if (q == null) "Veri yok" else null,
                isFormula = false,
                tvUrl = TradingView.urlFor(state, key),
            )
        }
        state.formula(key)?.let { f ->
            val r = engine.evaluateKey(key)
            return DisplayItem(
                key = key,
                title = f.name,
                subtitle = f.expression,
                value = r.value,
                change = r.change,
                valueText = r.value?.let { Fmt.value(it, f.decimals, f.prefix, f.suffix) } ?: "—",
                changeText = Fmt.change(r.change),
                spark = emptyList(),
                error = r.error,
                isFormula = true,
                tvUrl = TradingView.urlFor(state, key),
            )
        }
        return null
    }
}

object Fmt {
    private val symbols = DecimalFormatSymbols(Locale.forLanguageTag("tr-TR"))
    private val cache = HashMap<Int, DecimalFormat>()

    private fun format(decimals: Int): DecimalFormat = synchronized(cache) {
        cache.getOrPut(decimals) {
            val pattern = if (decimals <= 0) "#,##0" else "#,##0." + "0".repeat(decimals)
            DecimalFormat(pattern, symbols)
        }
    }

    fun number(v: Double, decimals: Int): String = format(decimals.coerceIn(0, 8)).format(v)

    fun value(v: Double, decimals: Int, prefix: String = "", suffix: String = ""): String {
        val body = number(v, decimals)
        return buildString {
            append(prefix)
            append(body)
            if (suffix.isNotEmpty()) {
                if (suffix != "%") append(' ')
                append(suffix)
            }
        }
    }

    /** "+%1,23" / "−%0,45" (Türkçe yazım: yüzde işareti başta). */
    fun change(pct: Double?): String {
        if (pct == null) return "—"
        val sign = when {
            pct > 0.005 -> "+"
            pct < -0.005 -> "−"
            else -> ""
        }
        return "$sign%${number(abs(pct), 2)}"
    }
}
