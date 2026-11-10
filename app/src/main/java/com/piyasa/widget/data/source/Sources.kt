package com.piyasa.widget.data.source

import android.util.Xml
import com.piyasa.widget.BuildConfig
import com.piyasa.widget.data.AppJson
import com.piyasa.widget.model.Quote
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import okhttp3.OkHttpClient
import okhttp3.Request
import org.xmlpull.v1.XmlPullParser
import java.io.IOException
import java.io.StringReader
import java.net.URLEncoder
import java.time.Instant
import java.util.concurrent.TimeUnit

object Http {
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .callTimeout(25, TimeUnit.SECONDS)
        .build()

    private val userAgent = "PiyasaWidget/${BuildConfig.VERSION_NAME} (Android)"

    suspend fun get(url: String): String = withContext(Dispatchers.IO) {
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", userAgent)
            .header("Accept", "application/json, text/xml, */*")
            .build()
        client.newCall(request).execute().use { resp ->
            if (!resp.isSuccessful) throw IOException("HTTP ${resp.code}")
            resp.body?.string() ?: throw IOException("Boş yanıt")
        }
    }
}

// ---------------------------------------------------------------- Yahoo Finance

@Serializable
private class YChartResponse(val chart: YChart)

@Serializable
private class YChart(val result: List<YResult>? = null, val error: YError? = null)

@Serializable
private class YError(val code: String? = null, val description: String? = null)

@Serializable
private class YResult(val meta: YMeta, val timestamp: List<Long>? = null, val indicators: YIndicators? = null)

@Serializable
private class YMeta(
    val currency: String? = null,
    val regularMarketPrice: Double? = null,
    val chartPreviousClose: Double? = null,
    val previousClose: Double? = null,
    val regularMarketTime: Long? = null,
)

@Serializable
private class YIndicators(val quote: List<YSeries>? = null)

@Serializable
private class YSeries(val close: List<Double?>? = null)

@Serializable
private class YSearchResponse(val quotes: List<YSearchQuote> = emptyList())

@Serializable
private class YSearchQuote(
    val symbol: String? = null,
    val shortname: String? = null,
    val longname: String? = null,
    val quoteType: String? = null,
    val exchange: String? = null,
    val exchDisp: String? = null,
    val typeDisp: String? = null,
)

/** Yahoo sembol araması sonucu. */
data class SearchHit(
    val symbol: String,
    val name: String,
    val quoteType: String?,
    val exchange: String?,
    val typeLabel: String?,
)

object YahooSource {
    private val hosts = listOf("query1.finance.yahoo.com", "query2.finance.yahoo.com")

    /** Serbest metinle sembol araması (ör. "aselsan", "apple", "gümüş"). */
    suspend fun search(query: String): List<SearchHit> {
        val q = URLEncoder.encode(query.trim(), "UTF-8")
        var last: IOException? = null
        for (host in hosts) {
            try {
                val body = Http.get("https://$host/v1/finance/search?q=$q&quotesCount=12&newsCount=0&listsCount=0&enableFuzzyQuery=true")
                return AppJson.decodeFromString(YSearchResponse.serializer(), body).quotes
                    .filter { !it.symbol.isNullOrBlank() && it.quoteType != "OPTION" }
                    .map {
                        SearchHit(
                            symbol = it.symbol!!,
                            name = it.shortname ?: it.longname ?: it.symbol,
                            quoteType = it.quoteType,
                            exchange = it.exchDisp ?: it.exchange,
                            typeLabel = it.typeDisp,
                        )
                    }
            } catch (e: IOException) {
                last = e
            }
        }
        throw last ?: IOException("Arama yapılamadı")
    }

    suspend fun fetch(symbol: String): Quote {
        val enc = URLEncoder.encode(symbol, "UTF-8")
        var last: IOException? = null
        for (host in hosts) {
            try {
                val body = Http.get("https://$host/v8/finance/chart/$enc?range=1d&interval=15m")
                return parse(body)
            } catch (e: IOException) {
                last = e
            }
        }
        throw last ?: IOException("Yahoo erişilemedi")
    }

    private fun parse(body: String): Quote {
        val resp = AppJson.decodeFromString(YChartResponse.serializer(), body)
        val r = resp.chart.result?.firstOrNull()
            ?: throw IOException(resp.chart.error?.description ?: "Sembol bulunamadı")
        val closes = r.indicators?.quote?.firstOrNull()?.close.orEmpty().filterNotNull()
        val price = r.meta.regularMarketPrice ?: closes.lastOrNull() ?: throw IOException("Fiyat yok")
        val time = (r.meta.regularMarketTime ?: r.timestamp?.lastOrNull())?.times(1000) ?: System.currentTimeMillis()
        return Quote(
            price = price,
            prevClose = r.meta.chartPreviousClose ?: r.meta.previousClose,
            time = time,
            currency = r.meta.currency,
            spark = downsample(closes, 40),
        )
    }

    private fun downsample(values: List<Double>, max: Int): List<Double> {
        if (values.size <= max) return values
        val step = values.size.toDouble() / max
        return List(max) { i -> values[(i * step).toInt()] }.toMutableList().also { it[it.lastIndex] = values.last() }
    }
}

// ---------------------------------------------------------------- gold-api.com (spot metaller)

@Serializable
private class GoldApiPrice(val price: Double, val updatedAt: String? = null)

object GoldApiSource {
    suspend fun fetch(symbol: String): Quote {
        val body = Http.get("https://api.gold-api.com/price/${URLEncoder.encode(symbol, "UTF-8")}")
        val p = AppJson.decodeFromString(GoldApiPrice.serializer(), body)
        val time = p.updatedAt?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
            ?: System.currentTimeMillis()
        // Önceki kapanış sağlanmıyor; Repository günlük referansı kendisi tutar.
        return Quote(price = p.price, prevClose = null, time = time, currency = "USD")
    }
}

// ---------------------------------------------------------------- TCMB gösterge kurları

object TcmbSource {
    private const val URL = "https://www.tcmb.gov.tr/kurlar/today.xml"

    /** Sembol biçimi "USD:ForexSelling" -> kod ve alan. */
    suspend fun fetchAll(symbols: Collection<String>): Map<String, Quote> {
        val xml = Http.get(URL)
        val table = parse(xml)
        val now = System.currentTimeMillis()
        return symbols.mapNotNull { sym ->
            val (code, field) = sym.split(':').let { it[0].uppercase() to (it.getOrNull(1) ?: "ForexSelling") }
            table[code]?.get(field)?.let { sym to Quote(price = it, time = now, currency = "TRY") }
        }.toMap()
    }

    private fun parse(xml: String): Map<String, Map<String, Double>> {
        val out = HashMap<String, MutableMap<String, Double>>()
        val parser = Xml.newPullParser()
        parser.setInput(StringReader(xml))
        var code: String? = null
        var unit = 1.0
        var tag: String? = null
        while (parser.next() != XmlPullParser.END_DOCUMENT) {
            when (parser.eventType) {
                XmlPullParser.START_TAG -> {
                    tag = parser.name
                    if (tag == "Currency") {
                        code = parser.getAttributeValue(null, "CurrencyCode")
                            ?: parser.getAttributeValue(null, "Kod")
                        unit = 1.0
                    }
                }
                XmlPullParser.TEXT -> {
                    val c = code
                    val text = parser.text?.trim().orEmpty()
                    if (c != null && text.isNotEmpty()) {
                        when (tag) {
                            "Unit" -> unit = text.toDoubleOrNull() ?: 1.0
                            "ForexBuying", "ForexSelling", "BanknoteBuying", "BanknoteSelling" ->
                                text.toDoubleOrNull()?.let { out.getOrPut(c) { HashMap() }[tag!!] = it / unit }
                        }
                    }
                }
                XmlPullParser.END_TAG -> {
                    if (parser.name == "Currency") code = null
                    tag = null
                }
            }
        }
        return out
    }
}
