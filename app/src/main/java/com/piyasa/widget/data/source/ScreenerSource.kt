package com.piyasa.widget.data.source

import com.piyasa.widget.data.AppJson
import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.Field
import com.piyasa.widget.model.FieldKind
import com.piyasa.widget.model.FieldSource
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

    // Yıllık diziler (en yeni önce) ve tahmin: türetilen alanlar ve 5 yıllık ortalama F/K için
    private const val COL_EPS_FY = "earnings_per_share_diluted_fy_h"
    private const val COL_REV_FY = "total_revenue_fy_h"
    private const val COL_EPS_FWD = "earnings_per_share_forecast_next_fy"
    private const val COL_FY_END = "fiscal_period_end_fy"
    private const val COL_FUND_CCY = "fundamental_currency_code"

    suspend fun run(screen: Screen, state: AppState): ScreenResult {
        val all = screen.conditions.flatMap { it.fields }
        val fields = (all + listOf(Field.PRICE, Field.CHANGE, Field.MCAP))
            .filterNot { it.needsHistory }.distinct()
        val fundamentals = all.any { it.source == FieldSource.DERIVED || it == Field.PE_5Y_AVG }
        val rows = fetchRows(screen, state, fields, fundamentals)
        val usdTry = if (screen.currency == ScreenCurrency.USD && rows.any { it.currency == "TRY" }) usdTry(state) else null
        if (screen.currency == ScreenCurrency.USD && rows.any { it.currency == "TRY" } && usdTry == null) {
            return ScreenResult(System.currentTimeMillis(), scanned = rows.size, error = "Dolar/TL kuru alınamadı")
        }

        var note: String? = null
        val history = HashMap<String, ScreenEngine.HistoryStats>()
        if (screen.usesHistory) {
            val needsPe = all.contains(Field.PE_5Y_AVG)
            val candidates = rows.filter { ScreenEngine.preFilter(it, screen, usdTry) }
                // Ortalama F/K için yıllık EPS'i olmayanlara geçmiş çekmenin anlamı yok
                .filter { !needsPe || (it.fyEnd != null && it.epsFy.count { e -> e != null && e > 0 } >= 3) }
                .sortedByDescending { it.marketCap ?: 0.0 }
                .take(HISTORY_CANDIDATES)
            val fx = if (screen.currency == ScreenCurrency.USD && candidates.any { it.currency == "TRY" }) {
                runCatching { HistoryCache.bars("USDTRY=X") }.getOrNull()
            } else null
            if (screen.currency == ScreenCurrency.USD && fx == null && candidates.any { it.currency == "TRY" }) {
                return ScreenResult(System.currentTimeMillis(), scanned = rows.size, error = "Dolar/TL geçmişi alınamadı (Yahoo)")
            }
            val failedCount = java.util.concurrent.atomic.AtomicInteger(0)
            val since = java.time.ZonedDateTime.now(java.time.ZoneOffset.UTC).minusYears(5).toEpochSecond()
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
                                // USD modunda yalnızca TRY fiyatlı semboller kura bölünür; F/K birimsiz, ham fiyattan
                                row.symbol to ScreenEngine.historyStats(bars, if (row.currency == "TRY") fx else null, since)
                                    .copy(peAvg = if (needsPe) ScreenEngine.peAverage(bars, row.epsFy, row.fyEnd) else null)
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
                append("Geçmiş fiyatlar: Yahoo Finance, ön elemeden geçen ilk ${candidates.size} sembol")
                if (failed > 0) append(" (${failed} sembol alınamadı)")
            }
        }
        return ScreenEngine.evaluate(rows, screen, usdTry, history, note = note)
    }

    private suspend fun usdTry(state: AppState): Double? =
        state.instruments.firstOrNull { it.symbol.equals("FX:USDTRY", true) }?.let { state.quotes[it.key]?.price }
            ?: runCatching { TradingViewSource.quotes(listOf("FX:USDTRY"))["FX:USDTRY"]?.price }.getOrNull()

    // ------------------------------------------------------------------ TradingView taraması

    private suspend fun fetchRows(screen: Screen, state: AppState, fields: List<Field>, fundamentals: Boolean): List<ScreenEngine.Row> {
        val extra = if (fundamentals) listOf(COL_EPS_FY, COL_REV_FY, COL_EPS_FWD, COL_FY_END, COL_FUND_CCY) else emptyList()
        val columns = baseColumns + fields.mapNotNull { it.column } + extra
        return when (screen.universe) {
            Universe.MY_LIST -> {
                val tickers = state.instruments
                    .filter { it.source == Source.TRADINGVIEW && (screen.category == null || it.category == screen.category) }
                    .map { it.symbol }
                if (tickers.isEmpty()) return emptyList()
                // BIST sembolleri "turkey" ucundan: "global" uç piyasa değerini ve tahminleri USD'ye çeviriyor,
                // "turkey" ise BIST/ABD evreniyle aynı (₺) değerleri veriyor.
                val (bist, other) = tickers.partition { it.startsWith("BIST:", ignoreCase = true) }
                val rows = listOf("turkey" to bist, "global" to other).filter { it.second.isNotEmpty() }.flatMap { (market, list) ->
                    scan(market, buildJsonObject {
                        putJsonObject("symbols") { putJsonArray("tickers") { list.forEach { add(it) } } }
                        putJsonArray("columns") { columns.forEach { add(it) } }
                    }, screen, state, fields, columns)
                }
                val order = tickers.withIndex().associate { (i, t) -> t.uppercase() to i }
                rows.sortedBy { order[it.symbol.uppercase()] ?: Int.MAX_VALUE }
            }
            Universe.BIST -> scan(
                "turkey", marketBody(screen, columns, 800, listOf(filter("type", "equal", JsonPrimitive("stock")))),
                screen, state, fields, columns,
            )
            Universe.US -> scan(
                "america",
                marketBody(
                    screen, columns, 1500,
                    listOf(
                        filter("type", "equal", JsonPrimitive("stock")),
                        filter("is_primary", "equal", JsonPrimitive(true)),
                        filter("market_cap_basic", "egreater", JsonPrimitive(2e9)),
                    ),
                ),
                screen, state, fields, columns,
            )
        }
    }

    private suspend fun scan(
        market: String,
        body: JsonObject,
        screen: Screen,
        state: AppState,
        fields: List<Field>,
        columns: List<String>,
    ): List<ScreenEngine.Row> {
        val text = Http.postJson("$BASE/$market/scan", body.toString())
        val data = AppJson.parseToJsonElement(text).jsonObject["data"] as? JsonArray ?: throw IOException("TradingView: beklenmeyen yanıt")
        return data.mapNotNull { el -> parseRow(el.jsonObject, screen, state, fields, columns) }
    }

    internal fun parseRow(o: JsonObject, screen: Screen, state: AppState, fields: List<Field>, columns: List<String>): ScreenEngine.Row? {
        val s = (o["s"] as? JsonPrimitive)?.content ?: return null
        val d = o["d"]?.jsonArray ?: return null
        fun at(col: String) = columns.indexOf(col).takeIf { it >= 0 }?.let { d.getOrNull(it) }?.takeIf { it !is JsonNull }
        fun str(col: String) = (at(col) as? JsonPrimitive)?.content
        fun num(col: String) = (at(col) as? JsonPrimitive)?.doubleOrNull
        fun arr(col: String) = (at(col) as? JsonArray)?.map { (it as? JsonPrimitive)?.doubleOrNull } ?: emptyList()
        if (screen.onlyStocks && str("type") !in stockTypes) return null
        val values = HashMap<Field, Double?>()
        fields.forEach { f -> f.column?.let { values[f] = num(it) } }
        val epsFy = arr(COL_EPS_FY)
        if (COL_EPS_FY in columns) {
            val currency = str("currency")
            val fundCcy = str(COL_FUND_CCY)
            // Tahmin farklı para biriminde raporlanıyorsa beklenen F/K hesaplanmaz (yanlış çıkmasın)
            val forecast = num(COL_EPS_FWD)?.takeIf { fundCcy == null || currency == null || fundCcy == currency }
            val derived = ScreenEngine.derived(values[Field.PRICE], epsFy, arr(COL_REV_FY), forecast)
            fields.filter { it.source == FieldSource.DERIVED }.forEach { values[it] = derived[it] }
        }
        val ticker = str("name") ?: s.substringAfter(':')
        return ScreenEngine.Row(
            symbol = s,
            name = com.piyasa.widget.model.Catalog.all.firstOrNull { it.symbol.equals(s, true) }?.name
                ?: state.instruments.firstOrNull { it.symbol.equals(s, true) }?.name
                ?: com.piyasa.widget.model.Catalog.prettyName(str("description"), ticker),
            currency = str("currency"),
            pricescale = num("pricescale"),
            values = values,
            epsFy = epsFy,
            fyEnd = num(COL_FY_END)?.toLong(),
        )
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
