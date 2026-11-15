package com.piyasa.widget.data

import android.content.Context
import com.piyasa.widget.data.source.Http
import com.piyasa.widget.data.source.TradingViewSource
import com.piyasa.widget.model.Advices
import com.piyasa.widget.model.BankEntry
import com.piyasa.widget.model.BankQuote
import com.piyasa.widget.model.BanksData
import com.piyasa.widget.model.DailySeries
import com.piyasa.widget.model.Metal
import com.piyasa.widget.model.Monthly
import com.piyasa.widget.model.Premiums
import com.piyasa.widget.model.RatioData
import com.piyasa.widget.model.Screen
import com.piyasa.widget.model.ScreenTemplates
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import java.io.File

/** Hazır listenin güvenilirlik skoru (web sürümünün her gün hesapladığı son 3 yıllık test). */
data class ReliabilityScore(val score: Int?, val label: String, val years: Int, val months: Int, val episodes: Int)

/** Avantajlı fiyatlar ekranının verisi. */
data class AdvantageData(
    val rows: List<Premiums.Row> = emptyList(),
    val advices: List<Advices.Advice> = emptyList(),
    val banks: BanksData? = null,
    val open: Boolean = Premiums.bistOpen(),
    val time: Long = 0L,
    val loading: Boolean = false,
    val error: String? = null,
) {
    val buys: List<Premiums.Row> get() = if (open) rows.filter { it.signal == Premiums.Signal.BUY } else emptyList()
}

/**
 * Web sürümünün yayımladığı veri dosyaları (GitHub Pages): banka fiyatları (yarım saatte bir), uzun dönem
 * oranlar, günlük kapanışlar ve hazır liste skorları (günlük). Dosyalar önbelleğe yazılır; ağ yokken son
 * kopya kullanılır.
 */
object Remote {
    const val BASE = "https://nniyazii.github.io/piyasa-widget/data"

    private val _advantage = MutableStateFlow(AdvantageData())
    val advantage: StateFlow<AdvantageData> = _advantage
    private val _scores = MutableStateFlow<Map<String, ReliabilityScore>>(emptyMap())
    /** Hazır liste kimliği → skor */
    val scores: StateFlow<Map<String, ReliabilityScore>> = _scores

    private class Cached(val time: Long, val text: String)
    private val memory = HashMap<String, Cached>()

    /** [maxAgeMs] içinde alınmışsa bellekteki; değilse ağdan; ağ yoksa diskteki son kopya. */
    private suspend fun file(context: Context, path: String, maxAgeMs: Long): String? = withContext(Dispatchers.IO) {
        val now = System.currentTimeMillis()
        synchronized(memory) { memory[path] }?.takeIf { now - it.time < maxAgeMs }?.let { return@withContext it.text }
        val disk = File(context.cacheDir, "remote_" + path.replace('/', '_'))
        val text = runCatching { Http.get("$BASE/$path") }.getOrNull()
            ?.also { t -> runCatching { disk.writeText(t) } }
            ?: runCatching { disk.takeIf { it.exists() }?.readText() }.getOrNull()
        if (text != null) synchronized(memory) { memory[path] = Cached(now, text) }
        text
    }

    /** Fiyatları ve yayımlanan dosyaları alıp ekran verisini günceller. */
    suspend fun refreshAdvantage(context: Context) {
        if (_advantage.value.loading) return
        _advantage.value = _advantage.value.copy(loading = true)
        try {
            coroutineScope {
                val quotes = async { TradingViewSource.quotes(Premiums.symbols) }
                val daily = async { file(context, "daily/misc.json", 6 * 3600_000L)?.let { runCatching { parseDaily(it, Premiums.symbols) }.getOrNull() }.orEmpty() }
                val ratios = async { file(context, "ratios.json", 6 * 3600_000L)?.let { runCatching { parseRatios(it) }.getOrNull() } }
                val banks = async { file(context, "banks.json", 10 * 60_000L)?.let { runCatching { parseBanks(it) }.getOrNull() } }
                val q = quotes.await().mapKeys { it.key.uppercase() }
                val price = { s: String -> q[s.uppercase()]?.price }
                val fx = price(Premiums.USDTRY)
                val d = daily.await()
                val rows = Premiums.pairs.map { p ->
                    val typical = if (p.grams == null) Premiums.typicalGrams(d[p.symbol], d[p.metal.symbol], d[Premiums.USDTRY]) else null
                    Premiums.row(p, price(p.symbol), price(p.metal.symbol), fx, typical)
                }
                val adv = ratios.await()?.let { Advices.all(it, price(Metal.GOLD.symbol), price(Metal.SILVER.symbol), fx) }.orEmpty()
                _advantage.value = AdvantageData(rows, adv, banks.await() ?: _advantage.value.banks, Premiums.bistOpen(), System.currentTimeMillis(),
                    error = if (fx == null) "Fiyatlar alınamadı" else null)
            }
        } catch (e: Exception) {
            _advantage.value = _advantage.value.copy(loading = false, error = "Fiyatlar alınamadı; bağlantıyı denetleyin")
        }
    }

    suspend fun refreshScores(context: Context) {
        val text = file(context, "scores.json", 6 * 3600_000L) ?: return
        runCatching { parseScores(text) }.getOrNull()?.let { _scores.value = it }
    }

    /**
     * Skor yalnızca liste hâlâ hazır listeyle aynıysa geçerlidir (koşullar, evren, para birimi):
     * kullanıcı koşulları değiştirdiyse skor o listeye ait değildir.
     */
    fun scoreFor(screen: Screen, scores: Map<String, ReliabilityScore>): ReliabilityScore? {
        val s = scores[screen.id] ?: return null
        val t = ScreenTemplates.all.firstOrNull { it.id == screen.id } ?: return null
        val same = t.conditions == screen.conditions && t.universe == screen.universe && t.currency == screen.currency &&
            t.category == screen.category && t.matchAll == screen.matchAll && t.onlyStocks == screen.onlyStocks
        return s.takeIf { same }
    }

    // ------------------------------------------------------------------ ayrıştırma (saf işlevler)

    private fun JsonElement?.num(): Double? = (this as? kotlinx.serialization.json.JsonPrimitive)?.doubleOrNull

    private fun quote(e: JsonElement?): BankQuote? {
        val o = e as? JsonObject ?: return null
        val bid = o["bid"].num() ?: return null; val ask = o["ask"].num() ?: return null
        return BankQuote(bid, ask)
    }
    private fun entries(e: JsonElement?): List<BankEntry> = (e as? JsonArray).orEmpty().mapNotNull { x ->
        val o = x as? JsonObject ?: return@mapNotNull null
        BankEntry(o["id"]!!.jsonPrimitive.content, o["name"]!!.jsonPrimitive.content, quote(o["gold"]), quote(o["silver"]))
    }

    fun parseBanks(json: String): BanksData {
        val o = AppJson.parseToJsonElement(json).jsonObject
        val generated = o["generated"]?.jsonPrimitive?.longOrNull ?: 0L
        // Mesai dışında okunmuşsa karşılaştırma mesai içindeki son fiyatlarla yapılır (varsa)
        val session = (o["session"] as? kotlinx.serialization.json.JsonPrimitive)?.content?.toBooleanStrictOrNull() ?: com.piyasa.widget.model.Costs.bankSession(generated)
        val day = o["daytime"] as? JsonObject
        val dayBanks = entries(day?.get("banks"))
        return when {
            session -> BanksData(generated, entries(o["banks"]), entries(o["physical"]))
            dayBanks.isNotEmpty() -> BanksData(day!!["generated"]?.jsonPrimitive?.longOrNull ?: 0L, dayBanks, entries(day["physical"]), offHoursAt = generated)
            else -> BanksData(generated, entries(o["banks"]), entries(o["physical"]), session = false)
        }
    }

    fun parseRatios(json: String): RatioData {
        val o = AppJson.parseToJsonElement(json).jsonObject
        val s = o["series"]!!.jsonObject
        fun m(k: String): Monthly = s[k]!!.jsonArray.mapNotNull { p ->
            val a = p.jsonArray; val ym = a[0].jsonPrimitive.intOrNull; val c = a[1].num()
            if (ym != null && c != null) ym to c else null
        }
        return RatioData(o["generated"]?.jsonPrimitive?.longOrNull ?: 0L, m("HPI"), m("GOLD"), m("SILVER"), m("USDTRY"))
    }

    /** Paketli günlük kapanışlar: [ilk gün, gün farkları[], kapanışlar[]] (boş kapanış = önceki). */
    fun parseDaily(json: String, symbols: Collection<String>): Map<String, DailySeries> {
        val bars = AppJson.parseToJsonElement(json).jsonObject["bars"]!!.jsonObject
        val out = HashMap<String, DailySeries>()
        for (sym in symbols) {
            val p = bars[sym] as? JsonArray ?: continue
            val closes = p[2].jsonArray
            if (closes.isEmpty()) continue
            val deltas = p[1].jsonArray
            val days = IntArray(closes.size); val close = DoubleArray(closes.size)
            var d = p[0].jsonPrimitive.intOrNull ?: continue
            var last = Double.NaN
            for (i in closes.indices) {
                if (i > 0) d += deltas[i - 1].jsonPrimitive.intOrNull ?: 0
                days[i] = d
                val c = if (closes[i] is JsonNull) null else closes[i].num()
                close[i] = c ?: last
                if (c != null) last = c
            }
            out[sym] = DailySeries(days, close)
        }
        return out
    }

    fun parseScores(json: String): Map<String, ReliabilityScore> {
        val o = AppJson.parseToJsonElement(json).jsonObject
        val years = o["years"]?.jsonPrimitive?.intOrNull ?: 3
        return o["scores"]!!.jsonObject.values.mapNotNull { v ->
            val x = v as? JsonObject ?: return@mapNotNull null
            val id = x["id"]?.jsonPrimitive?.content ?: return@mapNotNull null
            val rel = x["rel"]?.jsonObject ?: return@mapNotNull null
            id to ReliabilityScore(
                rel["score"]?.jsonPrimitive?.intOrNull, rel["label"]?.jsonPrimitive?.content ?: "", years,
                rel["months"]?.jsonPrimitive?.intOrNull ?: 0, rel["episodes"]?.jsonPrimitive?.intOrNull ?: 0,
            )
        }.toMap()
    }
}
