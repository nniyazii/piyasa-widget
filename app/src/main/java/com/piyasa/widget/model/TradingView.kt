package com.piyasa.widget.model

import com.piyasa.widget.formula.FormulaException
import com.piyasa.widget.formula.Formulas
import com.piyasa.widget.formula.Node
import com.piyasa.widget.formula.Parser
import java.net.URLEncoder

/**
 * Enstrüman ve formülleri TradingView sembollerine çevirir.
 * Formüller TradingView'un spread sözdizimine açılır:  GRAM_ALTIN -> OANDA:XAUUSD*FX:USDTRY/31.1034768
 */
object TradingView {

    private val catalogSymbols: Map<String, String> = mapOf(
        "SPX" to "SP:SPX", "NASDAQ" to "NASDAQ:IXIC", "DOW" to "DJ:DJI", "RUSSELL" to "TVC:RUT",
        "VIX" to "TVC:VIX", "US10Y" to "TVC:US10Y",
        "AAPL" to "NASDAQ:AAPL", "MSFT" to "NASDAQ:MSFT", "NVDA" to "NASDAQ:NVDA", "GOOGL" to "NASDAQ:GOOGL",
        "AMZN" to "NASDAQ:AMZN", "META" to "NASDAQ:META", "TSLA" to "NASDAQ:TSLA",
        "ONS" to "OANDA:XAUUSD", "GUMUS" to "TVC:SILVER", "PLATIN" to "TVC:PLATINUM",
        "PALADYUM" to "TVC:PALLADIUM", "BAKIR" to "COMEX:HG1!",
        "BRENT" to "FX:UKOIL", "WTI" to "FX:USOIL", "DOGALGAZ" to "NYMEX:NG1!",
        "USDTRY" to "FX:USDTRY", "EURTRY" to "FX:EURTRY", "GBPTRY" to "FX:GBPTRY", "CHFTRY" to "FX_IDC:CHFTRY",
        "EURUSD" to "FX:EURUSD", "GBPUSD" to "FX:GBPUSD", "USDJPY" to "FX:USDJPY", "DXY" to "TVC:DXY",
        "TCMB_USD" to "FX:USDTRY", "TCMB_EUR" to "FX:EURTRY",
        "BTC" to "BITSTAMP:BTCUSD", "ETH" to "BITSTAMP:ETHUSD", "SOL" to "COINBASE:SOLUSD",
    )

    /** Kullanıcının verdiği sembol > katalog eşlemesi > kaynak sembolünden tahmin. */
    fun symbolOf(ins: Instrument): String? {
        ins.tvSymbol?.takeIf { it.isNotBlank() }?.let { return it.trim() }
        if (ins.source == Source.TRADINGVIEW) return ins.symbol
        catalogSymbols[ins.key]?.let { return it }
        val s = ins.symbol.trim()
        return when (ins.source) {
            Source.YAHOO -> when {
                s.endsWith(".IS", ignoreCase = true) -> "BIST:" + s.dropLast(3).uppercase()
                s.endsWith("=X", ignoreCase = true) -> "FX_IDC:" + s.dropLast(2).uppercase()
                s.endsWith("=F", ignoreCase = true) -> s.dropLast(2).uppercase() + "1!"
                Regex("^[A-Za-z0-9]+-[A-Za-z]+$").matches(s) -> "CRYPTO:" + s.replace("-", "").uppercase()
                s.startsWith("^") -> null
                else -> s.uppercase()
            }
            Source.GOLD_API -> if (s.equals("HG", true)) "COMEX:HG1!" else "OANDA:${s.uppercase()}USD"
            Source.TCMB -> "FX:${s.substringBefore(':').uppercase()}TRY"
            Source.TRADINGVIEW -> s
        }
    }

    /** Anahtar için TradingView sembolü/ifadesi; çevrilemiyorsa ilk enstrümana düşer. */
    fun symbolFor(state: AppState, key: String): String? {
        state.instrument(key)?.let { return symbolOf(it) }
        val formula = state.formula(key) ?: return null
        val node = try {
            Parser.parse(formula.expression)
        } catch (e: FormulaException) {
            return null
        }
        expand(state, node, mutableSetOf(key))?.let { return it.text }
        // pct/chg/prev gibi fonksiyonlar TradingView'da yok: formüldeki ilk enstrümanı aç
        return firstInstrument(state, node, mutableSetOf(key))?.let { symbolOf(it) }
    }

    fun chartUrl(symbol: String): String =
        "https://www.tradingview.com/chart/?symbol=" + URLEncoder.encode(symbol, "UTF-8")

    fun urlFor(state: AppState, key: String): String? = symbolFor(state, key)?.let(::chartUrl)

    // ------------------------------------------------------------ ifade açma

    private class Expr(val text: String, val prec: Int)

    private const val ATOM = 3

    private fun precOf(op: Char) = if (op == '+' || op == '-') 1 else 2

    private fun expand(state: AppState, node: Node, visiting: MutableSet<String>): Expr? = when (node) {
        is Node.Num -> Expr(num(node.value), ATOM)
        is Node.Var -> {
            val c = Formulas.constants[node.name]
            when {
                c != null -> Expr(num(c), ATOM)
                state.instrument(node.name) != null -> symbolOf(state.instrument(node.name)!!)?.let { Expr(it, ATOM) }
                state.formula(node.name) != null && visiting.add(node.name) -> {
                    val inner = runCatching { Parser.parse(state.formula(node.name)!!.expression) }.getOrNull()
                    val r = inner?.let { expand(state, it, visiting) }
                    visiting.remove(node.name)
                    r
                }
                else -> null
            }
        }
        is Node.Unary -> expand(state, node.operand, visiting)?.let { e ->
            if (node.op == '+') e else Expr("-" + wrap(e, ATOM), 2)
        }
        is Node.Bin -> {
            if (node.op == '^') null
            else {
                val l = expand(state, node.left, visiting)
                val r = expand(state, node.right, visiting)
                if (l == null || r == null) null
                else {
                    val p = precOf(node.op)
                    // sağ taraf: a-(b+c), a/(b*c) parantez ister
                    val rightNeed = if (node.op == '-' || node.op == '/') p + 1 else p
                    Expr(wrap(l, p) + node.op + wrap(r, rightNeed), p)
                }
            }
        }
        is Node.Call -> null
    }

    private fun wrap(e: Expr, minPrec: Int) = if (e.prec < minPrec) "(${e.text})" else e.text

    private fun num(v: Double): String =
        if (v == Math.floor(v) && kotlin.math.abs(v) < 1e15) v.toLong().toString() else v.toString()

    private fun firstInstrument(state: AppState, node: Node, visiting: MutableSet<String>): Instrument? {
        for (name in orderedVars(node)) {
            state.instrument(name)?.let { return it }
            val f = state.formula(name) ?: continue
            if (!visiting.add(name)) continue
            val inner = runCatching { Parser.parse(f.expression) }.getOrNull() ?: continue
            firstInstrument(state, inner, visiting)?.let { return it }
        }
        return null
    }

    private fun orderedVars(node: Node): List<String> = when (node) {
        is Node.Num -> emptyList()
        is Node.Var -> listOf(node.name)
        is Node.Unary -> orderedVars(node.operand)
        is Node.Bin -> orderedVars(node.left) + orderedVars(node.right)
        is Node.Call -> node.args.flatMap { orderedVars(it) }
    }
}
