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
/** Görünüm: birleştirilmiş görüşler (web'deki Analiz › Görünüm ile aynı hesap) */
data class OutlookLayer(val label: String, val vote: Int, val counts: Boolean, val text: String, val hit: Double?, val base: Double?, val n: Int?)
data class OutlookItem(val id: String, val label: String, val short: String, val price: Double?, val stance: String, val conviction: String, val why: String, val flips: List<String>, val layers: List<OutlookLayer>) {
    /** +1 olumlu, −1 olumsuz, 0 nötr */
    val tone: Int get() = when (stance) { "Olumlu", "Hafif olumlu" -> 1; "Olumsuz", "Hafif olumsuz" -> -1; else -> 0 }
    /** Başlıkta anılacak kadar belirgin mi */
    val clear: Boolean get() = tone != 0 && (conviction != "düşük" || layers.filter { it.counts }.sumOf { it.vote }.let { kotlin.math.abs(it) >= 2 })
}
/** Bir vadede yön olasılığı: geçmiş örneklerde yukarıda olma oranı ve tüm ayların olağanı */
data class EventOdds(val months: Int, val n: Int, val up: Double?, val base: Double, val median: Double?) {
    /** +1 belirgin yüksek, −1 belirgin düşük */
    val tone: Int get() = if (up == null || n < 8) 0 else if (up - base >= 0.12) 1 else if (up - base <= -0.12) -1 else 0
}
/** Son dönemde olmuş bir olay ve bugünden sonrası için geçmişe dayalı yön olasılıkları */
data class OutlookEvent(val month: String, val elapsed: Int, val asset: String, val macro: Boolean, val text: String, val times: Int, val odds: List<EventOdds>)
data class OutlookData(val generated: Long, val month: String, val regimeTitle: String, val regimeLines: List<String>, val analogs: List<String>, val list: List<OutlookItem>, val events: List<OutlookEvent> = emptyList())

data class AdvantageData(
    val rows: List<Premiums.Row> = emptyList(),
    val advices: List<Advices.Advice> = emptyList(),
    /** Para arzına göre değerlemeler */
    val money: List<Advices.Advice> = emptyList(),
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
    private const val XU100 = "BIST:XU100"
    const val BASE = "https://nniyazii.github.io/piyasa-widget/data"

    private val _advantage = MutableStateFlow(AdvantageData())
    val advantage: StateFlow<AdvantageData> = _advantage
    private val _outlook = MutableStateFlow<OutlookData?>(null)
    /** Görünüm: her varlık için birleştirilmiş görüş (sunucuda hesaplanır) */
    val outlook: StateFlow<OutlookData?> = _outlook
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
                val quotes = async { TradingViewSource.quotes(Premiums.symbols + XU100) }
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
                val money = ratios.await()?.let { Advices.money(it, price(Metal.GOLD.symbol), fx, price(XU100)) }.orEmpty()
                _advantage.value = AdvantageData(rows, adv, money, banks.await() ?: _advantage.value.banks, Premiums.bistOpen(), System.currentTimeMillis(),
                    error = if (fx == null) "Fiyatlar alınamadı" else null)
            }
        } catch (e: Exception) {
            _advantage.value = _advantage.value.copy(loading = false, error = "Fiyatlar alınamadı; bağlantıyı denetleyin")
        }
    }

    suspend fun refreshOutlook(context: Context) {
        val text = file(context, "outlook.json", 3 * 3600_000L) ?: return
        runCatching { parseOutlook(text) }.getOrNull()?.let { _outlook.value = it }
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
        fun m(k: String): Monthly = (s[k] as? JsonArray).orEmpty().mapNotNull { p ->
            val a = p.jsonArray; val ym = a[0].jsonPrimitive.intOrNull; val c = a[1].num()
            if (ym != null && c != null) ym to c else null
        }
        return RatioData(o["generated"]?.jsonPrimitive?.longOrNull ?: 0L, m("HPI"), m("GOLD"), m("SILVER"), m("USDTRY"), m("USM2"), m("TRM2"), m("XU100"))
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

    fun parseOutlook(json: String): OutlookData {
        val o = AppJson.parseToJsonElement(json).jsonObject
        fun strs(e: JsonElement?) = (e as? JsonArray).orEmpty().mapNotNull { (it as? kotlinx.serialization.json.JsonPrimitive)?.content }
        val regime = o["regime"]?.jsonObject
        return OutlookData(
            generated = o["generated"]?.jsonPrimitive?.content?.toLongOrNull() ?: 0L,
            month = o["month"]?.jsonPrimitive?.content ?: "",
            regimeTitle = regime?.get("title")?.jsonPrimitive?.content ?: "",
            regimeLines = strs(regime?.get("lines")),
            analogs = strs(o["analogs"]),
            events = (o["events"] as? JsonArray).orEmpty().mapNotNull { e ->
                val x = e as? JsonObject ?: return@mapNotNull null
                OutlookEvent(x["month"]?.jsonPrimitive?.content ?: "", x["elapsed"]?.jsonPrimitive?.intOrNull ?: 0, x["asset"]?.jsonPrimitive?.content ?: "", x["macro"]?.jsonPrimitive?.content == "true",
                    x["text"]?.jsonPrimitive?.content ?: return@mapNotNull null, x["times"]?.jsonPrimitive?.intOrNull ?: 0,
                    (x["odds"] as? JsonArray).orEmpty().mapNotNull { oe -> val q = oe as? JsonObject ?: return@mapNotNull null; EventOdds(q["months"]?.jsonPrimitive?.intOrNull ?: 0, q["n"]?.jsonPrimitive?.intOrNull ?: 0, q["up"].num(), q["base"].num() ?: 0.5, q["median"].num()) })
            },
            list = (o["list"] as? JsonArray).orEmpty().mapNotNull { e ->
                val x = e as? JsonObject ?: return@mapNotNull null
                OutlookItem(
                    id = x["id"]?.jsonPrimitive?.content ?: return@mapNotNull null,
                    label = x["label"]?.jsonPrimitive?.content ?: "", short = x["short"]?.jsonPrimitive?.content ?: "",
                    price = x["price"].num(), stance = x["stance"]?.jsonPrimitive?.content ?: "Nötr", conviction = x["conviction"]?.jsonPrimitive?.content ?: "düşük",
                    why = x["why"]?.jsonPrimitive?.content ?: "", flips = strs(x["flips"]),
                    layers = (x["layers"] as? JsonArray).orEmpty().mapNotNull { le ->
                        val l = le as? JsonObject ?: return@mapNotNull null
                        val r = l["record"] as? JsonObject
                        OutlookLayer(l["label"]?.jsonPrimitive?.content ?: "", l["vote"]?.jsonPrimitive?.intOrNull ?: 0, l["counts"]?.jsonPrimitive?.content == "true", l["text"]?.jsonPrimitive?.content ?: "",
                            r?.get("hit").num(), r?.get("base").num(), r?.get("n")?.jsonPrimitive?.intOrNull)
                    },
                )
            },
        )
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
