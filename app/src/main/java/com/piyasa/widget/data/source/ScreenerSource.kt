package com.piyasa.widget.data.source

import com.piyasa.widget.data.AppJson
import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.Field
import com.piyasa.widget.model.FieldKind
import com.piyasa.widget.model.Op
import com.piyasa.widget.model.Screen
import com.piyasa.widget.model.ScreenCurrency
import com.piyasa.widget.model.ScreenEngine
import com.piyasa.widget.model.ScreenResult
import com.piyasa.widget.model.Source
import com.piyasa.widget.model.Universe
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import java.io.IOException
import java.time.LocalDate
import java.util.concurrent.ConcurrentHashMap

/**
 * Dinamik listeleri çalıştırır: TradingView taraması (evren + ön filtre) → gerekiyorsa Yahoo
 * aylık geçmişi (5 yıllık dip/zirve, yalnızca adaylar için, günlük önbellekli) → ScreenEngine.
 */
object ScreenerSource {
    private const val BASE = "https://scanner.tradingview.com"
    private val baseColumns = listOf("name", "description", "currency", "pricescale", "type")
    private val stockTypes = setOf("stock", "dr")
    private const val HISTORY_CANDIDATES = 60

    suspend fun run(screen: Screen, state: AppState): ScreenResult {
        val fields = (screen.conditions.flatMap { it.fields } + listOf(Field.PRICE, Field.CHANGE, Field.MCAP))
            .filterNot { it.needsHistory }.distinct()
        val rows = fetchRows(screen, state, fields)
        val usdTry = if (screen.currency == ScreenCurrency.USD && rows.any { it.currency == "TRY" }) usdTry(state) else null
        if (screen.currency == ScreenCurrency.USD && rows.any { it.currency == "TRY" } && usdTry == null) {
            return ScreenResult(System.currentTimeMillis(), scanned = rows.size, error = "Dolar/TL kuru alınamadı")
        }

        var note: String? = null
        val history = HashMap<String, ScreenEngine.HistoryStats>()
        if (screen.usesHistory) {
            val candidates = rows.filter { ScreenEngine.preFilter(it, screen, usdTry) }
                .sortedByDescending { it.marketCap ?: 0.0 }
                .take(HISTORY_CANDIDATES)
            val fx = if (screen.currency == ScreenCurrency.USD && candidates.any { it.currency == "TRY" }) {
                runCatching { HistoryCache.bars("USDTRY=X") }.getOrNull()
            } else null
            if (screen.currency == ScreenCurrency.USD && fx == null && candidates.any { it.currency == "TRY" }) {
                return ScreenResult(System.currentTimeMillis(), scanned = rows.size, error = "Dolar/TL geçmişi alınamadı (Yahoo)")
            }
            val failedCount = java.util.concurrent.atomic.AtomicInteger(0)
            coroutineScope {
                val limit = Semaphore(6)
                candidates.map { row ->
                    async {
                        limit.withPermit {
                            val y = YahooSource.fromTradingView(row.symbol)
                            val bars = y?.let { runCatching { HistoryCache.bars(it) }.getOrNull() }
                            if (bars == null) {
                                failedCount.incrementAndGet()
                                null
                            } else {
                                // USD modunda yalnızca TRY fiyatlı semboller kura bölünür
                                row.symbol to ScreenEngine.historyStats(bars, if (row.currency == "TRY") fx else null)
                            }
                        }
                    }
                }.awaitAll().filterNotNull().forEach { (s, h) -> history[s] = h }
            }
            val failed = failedCount.get()
            if (candidates.isNotEmpty() && failed == candidates.size) {
                return ScreenResult(System.currentTimeMillis(), scanned = rows.size, error = "5 yıllık geçmiş alınamadı (Yahoo)")
            }
            note = buildString {
                append("5 yıllık veri: Yahoo Finance, ön elemeden geçen ilk ${candidates.size} sembol")
                if (failed > 0) append(" (${failed} sembol alınamadı)")
            }
        }
        return ScreenEngine.evaluate(rows, screen, usdTry, history, note = note)
    }

    private suspend fun usdTry(state: AppState): Double? =
        state.instruments.firstOrNull { it.symbol.equals("FX:USDTRY", true) }?.let { state.quotes[it.key]?.price }
            ?: runCatching { TradingViewSource.quotes(listOf("FX:USDTRY"))["FX:USDTRY"]?.price }.getOrNull()

    // ------------------------------------------------------------------ TradingView taraması

    private suspend fun fetchRows(screen: Screen, state: AppState, fields: List<Field>): List<ScreenEngine.Row> {
        val columns = baseColumns + fields.mapNotNull { it.column }
        val (market, body) = when (screen.universe) {
            Universe.MY_LIST -> {
                val tickers = state.instruments
                    .filter { it.source == Source.TRADINGVIEW && (screen.category == null || it.category == screen.category) }
                    .map { it.symbol }
                if (tickers.isEmpty()) return emptyList()
                "global" to buildJsonObject {
                    putJsonObject("symbols") { putJsonArray("tickers") { tickers.forEach { add(it) } } }
                    putJsonArray("columns") { columns.forEach { add(it) } }
                }
            }
            Universe.BIST -> "turkey" to marketBody(screen, columns, 800, listOf(filter("type", "equal", JsonPrimitive("stock"))))
            Universe.US -> "america" to marketBody(
                screen, columns, 1500,
                listOf(
                    filter("type", "equal", JsonPrimitive("stock")),
                    filter("is_primary", "equal", JsonPrimitive(true)),
                    filter("market_cap_basic", "egreater", JsonPrimitive(2e9)),
                ),
            )
        }
        val text = Http.postJson("$BASE/$market/scan", body.toString())
        val data = AppJson.parseToJsonElement(text).jsonObject["data"] as? JsonArray ?: throw IOException("TradingView: beklenmeyen yanıt")
        return data.mapNotNull { el ->
            val o = el.jsonObject
            val s = (o["s"] as? JsonPrimitive)?.content ?: return@mapNotNull null
            val d = o["d"]?.jsonArray ?: return@mapNotNull null
            fun str(i: Int) = d.getOrNull(i)?.takeIf { it !is JsonNull }?.jsonPrimitive?.content
            fun num(i: Int) = d.getOrNull(i)?.takeIf { it !is JsonNull }?.jsonPrimitive?.doubleOrNull
            if (screen.onlyStocks && str(4) !in stockTypes) return@mapNotNull null
            val values = HashMap<Field, Double?>()
            fields.forEach { f -> values[f] = num(columns.indexOf(f.column)) }
            val ticker = str(0) ?: s.substringAfter(':')
            ScreenEngine.Row(
                symbol = s,
                name = com.piyasa.widget.model.Catalog.all.firstOrNull { it.symbol.equals(s, true) }?.name
                    ?: state.instruments.firstOrNull { it.symbol.equals(s, true) }?.name
                    ?: com.piyasa.widget.model.Catalog.prettyName(str(1), ticker),
                currency = str(2),
                pricescale = num(3),
                values = values,
            )
        }
    }

    private fun filter(left: String, op: String, right: kotlinx.serialization.json.JsonElement) = buildJsonObject {
        put("left", left); put("operation", op); put("right", right)
    }

    /**
     * Sunucuda ön eleme: alan–sayı karşılaştırmaları (USD'ye çevrilmesi gerekmeyenler) ve
     * alan–alan (+%0) karşılaştırmaları TradingView filtresine çevrilir. Gerisi uygulamada değerlendirilir.
     */
    internal fun serverFilters(screen: Screen): List<JsonObject> {
        if (!screen.matchAll) return emptyList()
        return screen.conditions.mapNotNull { c ->
            val left = c.left.column ?: return@mapNotNull null
            val op = when (c.op) { Op.LT -> "less"; Op.LTE -> "eless"; Op.GT -> "greater"; Op.GTE -> "egreater" }
            when {
                c.right == null && !(screen.currency == ScreenCurrency.USD && c.left.kind == FieldKind.PRICE) ->
                    filter(left, op, JsonPrimitive(c.value))
                c.right != null && c.right.column != null && c.value == 0.0 -> filter(left, op, JsonPrimitive(c.right.column))
                else -> null
            }
        }
    }

    private fun marketBody(screen: Screen, columns: List<String>, range: Int, universe: List<JsonObject>) = buildJsonObject {
        putJsonArray("filter") {
            universe.forEach { add(it) }
            serverFilters(screen).forEach { add(it) }
        }
        putJsonArray("columns") { columns.forEach { add(it) } }
        putJsonArray("range") { add(0); add(range) }
        putJsonObject("sort") { put("sortBy", "market_cap_basic"); put("sortOrder", "desc") }
    }

    /** Aylık geçmiş, gün boyunca bellekte tutulur (her yenilemede yeniden çekilmez). */
    private object HistoryCache {
        private val cache = ConcurrentHashMap<String, Pair<LocalDate, List<ScreenEngine.Bar>>>()

        suspend fun bars(yahooSymbol: String): List<ScreenEngine.Bar> {
            val today = LocalDate.now()
            cache[yahooSymbol]?.let { (d, b) -> if (d == today) return b }
            val bars = YahooSource.monthlyHistory(yahooSymbol)
            if (bars.isEmpty()) throw IOException("Geçmiş yok")
            cache[yahooSymbol] = today to bars
            return bars
        }
    }
}
