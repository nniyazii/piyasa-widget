package com.piyasa.widget.model

import java.time.Instant
import java.time.YearMonth
import java.time.ZoneOffset
import kotlin.math.abs
import kotlin.math.log10

/**
 * Dinamik liste hesaplaması (saf Kotlin, ağdan bağımsız; birim testli).
 * Ağ tarafı (TradingView taraması, Yahoo geçmişi) data/ScreenerSource'tadır.
 */
object ScreenEngine {

    /** Taramadan gelen bir sembol. [values] TradingView sütunlarının değerleri (yerel para birimi). */
    data class Row(
        val symbol: String,
        val name: String,
        val currency: String?,
        val pricescale: Double?,
        val values: Map<Field, Double?>,
        /** Yıllık seyreltilmiş EPS, en yeni önce (5 yıllık ortalama F/K için). */
        val epsFy: List<Double?> = emptyList(),
        /** Son mali yıl sonu (epoch saniye). */
        val fyEnd: Long? = null,
    ) {
        val close: Double? get() = values[Field.PRICE]
        val change: Double? get() = values[Field.CHANGE]
        val marketCap: Double? get() = values[Field.MCAP]
    }

    /** 5 yıllık en düşük / en yüksek (istenen para biriminde) ve 5 yıllık ortalama F/K. */
    data class HistoryStats(val low: Double?, val high: Double?, val peAvg: Double? = null)

    /** Aylık çubuk (zaman: epoch saniye). */
    data class Bar(val time: Long, val low: Double?, val high: Double?, val close: Double?)

    /**
     * Aylık çubuklardan 5 yıllık en düşük/en yüksek. [fx] verilirse her ay o ayın kur kapanışına
     * bölünerek USD'ye çevrilir (ör. THYAO ₺ / USDTRY → THYAO $). Kur bulunamayan ay atlanır.
     */
    fun historyStats(bars: List<Bar>, fx: List<Bar>? = null, since: Long? = null): HistoryStats {
        if (bars.isEmpty()) return HistoryStats(null, null)
        val fxByMonth: Map<YearMonth, Double>? = fx?.mapNotNull { b -> b.close?.takeIf { it > 0 }?.let { month(b.time) to it } }?.toMap()
        var low: Double? = null
        var high: Double? = null
        for (b in bars) {
            if (since != null && b.time < since) continue
            val div = if (fxByMonth == null) 1.0 else (fxByMonth[month(b.time)] ?: continue)
            b.low?.takeIf { it > 0 }?.let { v -> val x = v / div; if (low == null || x < low!!) low = x }
            b.high?.takeIf { it > 0 }?.let { v -> val x = v / div; if (high == null || x > high!!) high = x }
        }
        return HistoryStats(low, high)
    }

    /**
     * 5 yıllık ortalama F/K: her mali yıl için (yıl sonu ayının kapanış fiyatı ÷ o yılın EPS'i).
     * Zararlı (EPS ≤ 0), kârı sıfıra yakın olduğu için F/K'sı anlamsız (> [maxPe]) ya da fiyatı
     * bulunamayan yıllar atlanır (tek bir yıl ortalamayı şişirmesin); en az [minYears] yıl gerekir.
     * F/K birimsizdir: fiyat ve EPS aynı (yerel) para biriminde olmalı, kur çevrimi yapılmaz.
     */
    fun peAverage(bars: List<Bar>, epsFy: List<Double?>, fyEnd: Long?, years: Int = 5, minYears: Int = 3, maxPe: Double = 100.0): Double? {
        if (fyEnd == null || epsFy.isEmpty()) return null
        val closeByMonth = bars.mapNotNull { b -> b.close?.takeIf { it > 0 }?.let { month(b.time) to it } }.toMap()
        val end = month(fyEnd)
        val pes = (0 until years).mapNotNull { k ->
            val eps = epsFy.getOrNull(k)?.takeIf { it > 0 } ?: return@mapNotNull null
            val price = closeByMonth[end.minusYears(k.toLong())] ?: return@mapNotNull null
            (price / eps).takeIf { it <= maxPe }
        }
        return if (pes.size >= minYears) pes.average() else null
    }

    /**
     * TradingView'un yıllık dizilerinden türetilen alanlar (diziler en yeni önce).
     * Büyüme oranları yalnızca taban yıl kârlı/pozitifse anlamlıdır; değilse alan boş kalır.
     */
    fun derived(close: Double?, epsFy: List<Double?>, revenueFy: List<Double?>, epsForecast: Double?): Map<Field, Double?> {
        fun growth(now: Double?, base: Double?) = if (now != null && base != null && base > 0) (now / base - 1) * 100 else null
        val e0 = epsFy.getOrNull(0)
        val e5 = epsFy.getOrNull(5)
        return mapOf(
            Field.EPS_GROWTH_1Y to growth(e0, epsFy.getOrNull(1)),
            Field.EPS_CAGR_5Y to if (e0 != null && e5 != null && e0 > 0 && e5 > 0) (Math.pow(e0 / e5, 1.0 / 5) - 1) * 100 else null,
            Field.REV_GROWTH_1Y to growth(revenueFy.getOrNull(0), revenueFy.getOrNull(1)),
            Field.FWD_PE to if (close != null && epsForecast != null && epsForecast > 0) close / epsForecast else null,
        )
    }

    private fun month(epochSeconds: Long): YearMonth =
        YearMonth.from(Instant.ofEpochSecond(epochSeconds).atZone(ZoneOffset.UTC))

    /** Para birimine çevrilmiş değer. Fiyat cinsinden TradingView alanları, TRY ise kura bölünür. */
    fun valueOf(
        row: Row,
        field: Field,
        screen: Screen,
        usdTry: Double?,
        history: Map<String, HistoryStats>,
    ): Double? {
        val raw = when (field) {
            Field.LOW_5Y -> history[row.symbol]?.low
            Field.HIGH_5Y -> history[row.symbol]?.high
            Field.PE_5Y_AVG -> history[row.symbol]?.peAvg
            else -> row.values[field]
        } ?: return null
        // Geçmiş alanları zaten istenen para biriminde hesaplanır (ortalama F/K birimsiz)
        if (field.needsHistory) return raw
        if (screen.currency == ScreenCurrency.USD && field.kind == FieldKind.PRICE && row.currency == "TRY") {
            return if (usdTry != null && usdTry > 0) raw / usdTry else null
        }
        return raw
    }

    /** Koşulun sağ tarafı: alan × (1 + %/100) ya da sabit sayı. */
    fun rightOf(c: Condition, row: Row, screen: Screen, usdTry: Double?, history: Map<String, HistoryStats>): Double? =
        if (c.right != null) valueOf(row, c.right, screen, usdTry, history)?.let { it * (1 + c.value / 100.0) } else c.value

    fun test(c: Condition, row: Row, screen: Screen, usdTry: Double?, history: Map<String, HistoryStats>): Boolean {
        val l = valueOf(row, c.left, screen, usdTry, history) ?: return false
        val r = rightOf(c, row, screen, usdTry, history) ?: return false
        return c.op.test(l, r)
    }

    fun matches(row: Row, screen: Screen, usdTry: Double?, history: Map<String, HistoryStats>): Boolean {
        if (screen.conditions.isEmpty()) return true
        val results = screen.conditions.map { test(it, row, screen, usdTry, history) }
        return if (screen.matchAll) results.all { it } else results.any { it }
    }

    /** Geçmiş verisi gerektirmeyen koşullarla ön eleme (geçmişi yalnızca adaylar için çekmek üzere). */
    fun preFilter(row: Row, screen: Screen, usdTry: Double?): Boolean {
        if (!screen.matchAll) return true
        return screen.conditions.filterNot { c -> c.fields.any { it.needsHistory } }
            .all { test(it, row, screen, usdTry, emptyMap()) }
    }

    /**
     * Yakınlık ölçüsü (ilk koşula göre):
     * - alan ile karşılaştırmada sol / referans alan (ofsetsiz): 1'e yakın = referansa yakın
     *   (Fiyat / 5Y dip = 1,03 → dibin %3 üstünde)
     * - sayı ile karşılaştırmada sol değerin kendisi (RSI = 24)
     */
    fun score(row: Row, screen: Screen, usdTry: Double?, history: Map<String, HistoryStats>): Double? {
        val c = screen.conditions.firstOrNull() ?: return null
        val l = valueOf(row, c.left, screen, usdTry, history) ?: return null
        if (c.right == null) return l
        val base = valueOf(row, c.right, screen, usdTry, history) ?: return null
        if (base == 0.0) return null
        return l / base
    }

    fun evaluate(
        rows: List<Row>,
        screen: Screen,
        usdTry: Double?,
        history: Map<String, HistoryStats>,
        now: Long = System.currentTimeMillis(),
        note: String? = null,
    ): ScreenResult {
        val matched = rows.filter { matches(it, screen, usdTry, history) }
            .map { it to score(it, screen, usdTry, history) }
        val first = screen.conditions.firstOrNull()
        val sorted = when (screen.sort) {
            ScreenSort.CLOSEST -> when {
                first == null -> matched
                // Referans alana en yakın önce (dibe/ortalamaya/zirveye en yakın)
                first.right != null -> matched.sortedBy { it.second?.let { s -> abs(s - 1.0) } ?: Double.MAX_VALUE }
                // Sayıyla karşılaştırmada en uç değer önce (RSI < 30 → en düşük RSI)
                first.op == Op.GT || first.op == Op.GTE -> matched.sortedByDescending { it.second ?: -Double.MAX_VALUE }
                else -> matched.sortedBy { it.second ?: Double.MAX_VALUE }
            }
            // En uç önce: "<" koşulunda en küçük oran/değer (F/K ortalamasının en çok altında olan), ">" koşulunda en büyük
            ScreenSort.EXTREME -> when {
                first == null -> matched
                first.op == Op.GT || first.op == Op.GTE -> matched.sortedByDescending { it.second ?: -Double.MAX_VALUE }
                else -> matched.sortedBy { it.second ?: Double.MAX_VALUE }
            }
            ScreenSort.CHANGE_DESC -> matched.sortedByDescending { it.first.change ?: -1e9 }
            ScreenSort.CHANGE_ASC -> matched.sortedBy { it.first.change ?: 1e9 }
            ScreenSort.MCAP_DESC -> matched.sortedByDescending { it.first.marketCap ?: 0.0 }
            ScreenSort.NAME -> matched.sortedBy { it.first.name.lowercase() }
        }
        val out = sorted.take(screen.limit.coerceIn(1, 200)).map { (row, s) ->
            val usd = screen.currency == ScreenCurrency.USD
            val price = valueOf(row, Field.PRICE, screen, usdTry, history)
            ScreenRow(
                symbol = row.symbol,
                name = row.name,
                price = price,
                change = row.change,
                currency = if (usd) "USD" else row.currency,
                decimals = decimalsFor(price, row.pricescale, converted = usd && row.currency == "TRY"),
                score = s,
            )
        }
        return ScreenResult(time = now, rows = out, scanned = rows.size, note = note)
    }

    private fun decimalsFor(price: Double?, pricescale: Double?, converted: Boolean): Int {
        if (converted || pricescale == null || pricescale < 1) {
            val p = abs(price ?: return 2)
            return when { p >= 1000 -> 0; p >= 10 -> 2; p >= 1 -> 3; else -> 4 }
        }
        return log10(pricescale).toInt().coerceIn(0, 4)
    }

    /** Ön ek / son ek: "$12,34" · "71,34 ₺". */
    fun units(currency: String?): Pair<String, String> = when (currency) {
        "USD", "USDT", "USDC" -> "$" to ""
        "TRY" -> "" to "₺"
        "EUR" -> "€" to ""
        null -> "" to ""
        else -> "" to currency
    }

    /** "Fiyat ≤ 5 yıl en düşük +%10" · "Piyasa değeri > 5 mlr" · "Günlük değişim % ≥ 4" */
    fun describe(c: Condition): String {
        val right = if (c.right != null) {
            val off = when {
                c.value > 0 -> " +%" + Fmt.number(c.value, if (c.value % 1.0 == 0.0) 0 else 1)
                c.value < 0 -> " −%" + Fmt.number(-c.value, if (c.value % 1.0 == 0.0) 0 else 1)
                else -> ""
            }
            c.right.label + off
        } else if (c.left.kind == FieldKind.MONEY) {
            money(c.value)
        } else Fmt.number(c.value, if (c.value % 1.0 == 0.0) 0 else 2)
        return "${c.left.label} ${c.op.symbol} $right"
    }

    /** Büyük tutarlar kısa: 5 mlr · 1,2 trn · 800 mn. (Birim evrene göre: BIST ₺, ABD $.) */
    fun money(v: Double): String {
        val a = abs(v)
        fun n(x: Double) = Fmt.number(x, if (x % 1.0 == 0.0 || x >= 100) 0 else 1)
        return when {
            a >= 1e12 -> n(v / 1e12) + " trn"
            a >= 1e9 -> n(v / 1e9) + " mlr"
            a >= 1e6 -> n(v / 1e6) + " mn"
            else -> n(v)
        }
    }
}
