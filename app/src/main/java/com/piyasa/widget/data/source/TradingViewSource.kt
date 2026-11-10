package com.piyasa.widget.data.source

import com.piyasa.widget.data.AppJson
import com.piyasa.widget.model.Quote
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
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
import java.text.Normalizer
import java.util.Locale

/**
 * TradingView tarayıcı (scanner) servisi. Anahtar gerektirmez; resmi olmayan bir uç noktadır.
 * - Fiyatlar: tüm semboller tek istekte ("BIST:ALTIN", "ECONOMICS:TRHPI", "OANDA:XAUUSD" ...)
 * - Arama: kod, ad veya Türkçe kelimeyle tüm pazarlarda
 */
object TradingViewSource {
    private const val BASE = "https://scanner.tradingview.com"
    private val columns = listOf("name", "description", "type", "exchange", "close", "change", "pricescale", "currency")

    // ------------------------------------------------------------------ fiyatlar

    suspend fun quotes(symbols: Collection<String>): Map<String, Quote> {
        if (symbols.isEmpty()) return emptyMap()
        val now = System.currentTimeMillis()
        val out = HashMap<String, Quote>()
        for (chunk in symbols.distinct().chunked(200)) {
            for (row in scan("global", tickersBody(chunk))) {
                val price = row.close ?: continue
                val prev = row.change?.let { ch -> if (ch <= -100.0) null else price / (1 + ch / 100.0) }
                out[row.symbol] = Quote(price = price, prevClose = prev, time = now, currency = row.currency)
            }
        }
        return out
    }

    // ------------------------------------------------------------------ arama

    /**
     * "altın", "ALTIN.S1", "gmstr.f", "trhpi", "BIST:THYAO", "apple", "bitcoin" ...
     * Önce kesin kod eşleşmeleri, sonra pazar pazar ad araması; sonuçlar fiyatlarıyla gelir.
     */
    suspend fun search(query: String, alsoTickers: List<String> = emptyList()): List<SearchHit> = coroutineScope {
        val q = query.trim()
        if (q.length < 2) return@coroutineScope emptyList()
        val code = normalizeCode(q)
        val pattern = textPattern(q)

        val exact = async {
            val direct: List<String> = when {
                q.contains(':') -> listOf(q.uppercase(Locale.ROOT).replace(" ", ""))
                code != null -> EXCHANGES.map { "$it:$code" }
                else -> emptyList()
            }
            val tickers = (direct + alsoTickers).distinct()
            if (tickers.isEmpty()) emptyList()
            else runCatching { scan("global", tickersBody(tickers)) }.getOrDefault(emptyList())
                .sortedBy { EXCHANGES.indexOf(it.exchange).let { i -> if (i < 0) 99 else i } }
        }
        val markets = if (pattern == null) emptyList() else MARKETS.map { m ->
            async { runCatching { scan(m.market, filterBody(pattern, m)) }.getOrDefault(emptyList()) }
        }
        val rows = exact.await() + markets.awaitAll().flatten()
        rows.distinctBy { it.symbol }
            .filterNot { it.symbol.endsWith(".P") } // sürekli vadeli (perpetual) kontratlar
            .take(30)
            .map { it.toHit() }
    }

    /** Kullanıcının yazdığı BIST/Yahoo/TradingView tarzı kodu sade tickere çevirir. */
    fun normalizeCode(input: String): String? {
        var s = input.trim().uppercase(Locale.ROOT).replace(Regex("\\s*:\\s*"), ":")
        if (s.any { it.isWhitespace() }) return null // çok kelimeli yazı kod değil, ad araması
        s = s.substringAfter(':')
        // BIST yazımları: ALTIN.S1 (sertifika), GMSTR.F (fon), THYAO.E (hisse), THYAO.IS (Yahoo)
        s = s.replace(Regex("\\.(S\\d*|F|E|IS|R|V)$"), "")
        if (s.endsWith("=X")) s = s.dropLast(2)
        if (Regex("^[A-Z0-9]{1,6}-(USD|USDT|TRY|EUR)$").matches(s)) s = s.replace("-", "")
        return s.takeIf { Regex("^[A-Z0-9_!.]{1,20}$").matches(it) }
    }

    /** Ad araması için desen: Türkçe karakterler sadeleşir, yaygın kelimelerin İngilizcesi eklenir. */
    fun textPattern(input: String): String? {
        val folded = fold(input).replace(Regex("[^a-z0-9 ]"), " ").trim().replace(Regex("\\s+"), " ")
        if (folded.length < 2) return null
        val terms = linkedSetOf(folded)
        val code = normalizeCode(input)?.lowercase(Locale.ROOT)
        if (code != null && code != folded.replace(" ", "")) terms += code
        for ((tr, en) in SYNONYMS) if (folded.contains(tr)) terms += en
        return terms.joinToString("|")
    }

    private fun fold(s: String): String {
        val lower = s.lowercase(Locale.forLanguageTag("tr-TR"))
            .replace('ı', 'i').replace('ş', 's').replace('ğ', 'g').replace('ç', 'c').replace('ö', 'o').replace('ü', 'u')
        return Normalizer.normalize(lower, Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "")
    }

    private val SYNONYMS = listOf(
        "altin" to "gold", "gumus" to "silver", "petrol" to "oil", "dogalgaz" to "natural gas", "bakir" to "copper",
        "platin" to "platinum", "paladyum" to "palladium", "dolar" to "usd", "avro" to "eur", "sterlin" to "gbp",
        "konut" to "house price", "enflasyon" to "inflation", "faiz" to "interest rate", "issizlik" to "unemployment",
        "buyume" to "gdp", "turkiye" to "turkey", "abd" to "united states", "amerika" to "united states",
        "kripto" to "bitcoin", "fon" to "fund", "sertifika" to "sertifikasi",
    )

    /** Kesin kod eşleşmesinde denenecek borsalar (öncelik sırasıyla). */
    private val EXCHANGES = listOf(
        "BIST", "NASDAQ", "NYSE", "AMEX", "FX", "OANDA", "TVC", "SP", "DJ", "CBOE", "ECONOMICS",
        "FX_IDC", "COMEX", "NYMEX", "BITSTAMP", "BINANCE", "COINBASE", "XETR", "LSE",
    )

    private class Market(
        val market: String,
        val range: Int,
        val sort: String? = null,
        val extra: List<JsonObject> = emptyList(),
    )

    private fun filter(left: String, op: String, right: JsonElement) = buildJsonObject {
        put("left", left); put("operation", op); put("right", right)
    }

    private fun strings(vararg v: String) = JsonArray(v.map { JsonPrimitive(it) })

    private val MARKETS = listOf(
        Market("turkey", 8, "volume", listOf(filter("type", "in_range", strings("stock", "fund", "dr", "index", "structured")))),
        Market("cfd", 5, null, listOf(filter("exchange", "in_range", strings("OANDA", "TVC", "FX", "CAPITALCOM")))),
        Market("forex", 4, null, listOf(filter("exchange", "in_range", strings("FX", "FX_IDC", "OANDA")))),
        Market("america", 6, "market_cap_basic", listOf(filter("is_primary", "equal", JsonPrimitive(true)))),
        Market("economics2", 5),
        Market("crypto", 4, "24h_vol|5", listOf(
            filter("type", "equal", JsonPrimitive("spot")),
            filter("exchange", "in_range", strings("BINANCE", "COINBASE", "BITSTAMP", "KRAKEN", "BTCTURK")),
        )),
    )

    private fun tickersBody(tickers: List<String>) = buildJsonObject {
        putJsonObject("symbols") { putJsonArray("tickers") { tickers.forEach { add(it) } } }
        putJsonArray("columns") { columns.forEach { add(it) } }
    }

    private fun filterBody(pattern: String, m: Market) = buildJsonObject {
        putJsonArray("filter") {
            addJsonObject { put("left", "name,description"); put("operation", "match"); put("right", pattern) }
            m.extra.forEach { add(it) }
        }
        putJsonArray("columns") { columns.forEach { add(it) } }
        putJsonArray("range") { add(0); add(m.range) }
        if (m.sort != null) putJsonObject("sort") { put("sortBy", m.sort); put("sortOrder", "desc") }
    }

    private class Row(
        val symbol: String, val name: String, val description: String?, val type: String?, val exchange: String?,
        val close: Double?, val change: Double?, val pricescale: Double?, val currency: String?,
    ) {
        fun toHit() = SearchHit(
            symbol = symbol, name = description ?: name, quoteType = type, exchange = exchange, typeLabel = typeLabel(type),
            ticker = name, price = close, changePct = change, pricescale = pricescale, currency = currency,
        )
    }

    private suspend fun scan(market: String, body: JsonObject): List<Row> = withContext(Dispatchers.IO) {
        val text = Http.postJson("$BASE/$market/scan", body.toString())
        val root = AppJson.parseToJsonElement(text).jsonObject
        val data = root["data"] as? JsonArray ?: throw IOException("TradingView: beklenmeyen yanıt")
        data.mapNotNull { el ->
            val o = el.jsonObject
            val s = (o["s"] as? JsonPrimitive)?.content ?: return@mapNotNull null
            val d = o["d"]?.jsonArray ?: return@mapNotNull null
            fun str(i: Int) = d.getOrNull(i)?.takeIf { it !is JsonNull }?.jsonPrimitive?.content
            fun num(i: Int) = d.getOrNull(i)?.takeIf { it !is JsonNull }?.jsonPrimitive?.doubleOrNull
            Row(s, str(0) ?: s.substringAfter(':'), str(1), str(2), str(3), num(4), num(5), num(6), str(7))
        }
    }

    private fun typeLabel(type: String?) = when (type) {
        "stock" -> "Hisse"
        "fund" -> "Fon"
        "dr" -> "Sertifika"
        "structured" -> "Yapılandırılmış"
        "index" -> "Endeks"
        "forex" -> "Döviz"
        "commodity", "cfd" -> "Emtia"
        "futures" -> "Vadeli"
        "spot", "crypto" -> "Kripto"
        "economic" -> "Ekonomik gösterge"
        "bond" -> "Tahvil"
        else -> type
    }
}
