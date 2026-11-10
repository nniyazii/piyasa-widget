package com.piyasa.widget.model

import kotlinx.serialization.Serializable

/*
 * Dinamik listeler (tarama / screener).
 *
 *   "USD cinsinden 5 yıllık dibine yakın BIST hisseleri"
 *       Evren: BIST hisseleri · Para: USD · Fiyat ≤ 5 yıl en düşük +%10
 *
 *   "Listemdeki, 200 günlük ortalamasının altında ya da en fazla %5 üstündeki ABD hisseleri"
 *       Evren: Listem · ABD · Fiyat < 200 günlük ortalama +%5
 */

@Serializable
enum class Universe(val label: String, val hint: String) {
    MY_LIST("Listem", "Listendeki göstergeler"),
    BIST("BIST hisseleri", "Borsa İstanbul'daki tüm hisseler"),
    US("ABD hisseleri", "Piyasa değeri 2 milyar $ üstü ABD hisseleri"),
}

@Serializable
enum class ScreenCurrency(val label: String) { LOCAL("Yerel"), USD("USD") }

/** Alan türü: fiyat cinsinden mi (para birimine çevrilir), yüzde mi, sayı mı. */
enum class FieldKind { PRICE, PERCENT, NUMBER, MONEY }

@Serializable
enum class Field(
    val label: String,
    val kind: FieldKind,
    /** TradingView tarayıcı sütunu; null ise uygulamada hesaplanır (geçmiş veriden). */
    val column: String?,
) {
    PRICE("Fiyat", FieldKind.PRICE, "close"),
    CHANGE("Günlük değişim %", FieldKind.PERCENT, "change"),
    SMA20("20 günlük ortalama", FieldKind.PRICE, "SMA20"),
    SMA50("50 günlük ortalama", FieldKind.PRICE, "SMA50"),
    SMA100("100 günlük ortalama", FieldKind.PRICE, "SMA100"),
    SMA200("200 günlük ortalama", FieldKind.PRICE, "SMA200"),
    EMA200("200 günlük üssel ort.", FieldKind.PRICE, "EMA200"),
    LOW_52W("52 hafta en düşük", FieldKind.PRICE, "price_52_week_low"),
    HIGH_52W("52 hafta en yüksek", FieldKind.PRICE, "price_52_week_high"),
    LOW_5Y("5 yıl en düşük", FieldKind.PRICE, null),
    HIGH_5Y("5 yıl en yüksek", FieldKind.PRICE, null),
    ATL("Tüm zamanların en düşüğü", FieldKind.PRICE, "Low.All"),
    ATH("Tüm zamanların en yükseği", FieldKind.PRICE, "High.All"),
    RSI("RSI (14)", FieldKind.NUMBER, "RSI"),
    PERF_1M("1 ay getiri %", FieldKind.PERCENT, "Perf.1M"),
    PERF_3M("3 ay getiri %", FieldKind.PERCENT, "Perf.3M"),
    PERF_YTD("Yılbaşından beri %", FieldKind.PERCENT, "Perf.YTD"),
    PERF_1Y("1 yıl getiri %", FieldKind.PERCENT, "Perf.Y"),
    PERF_5Y("5 yıl getiri %", FieldKind.PERCENT, "Perf.5Y"),
    MCAP("Piyasa değeri", FieldKind.MONEY, "market_cap_basic"),
    PE("F/K", FieldKind.NUMBER, "price_earnings_ttm"),
    ;

    val needsHistory: Boolean get() = column == null
}

@Serializable
enum class Op(val symbol: String) {
    LT("<"), LTE("≤"), GT(">"), GTE("≥");

    fun test(a: Double, b: Double) = when (this) { LT -> a < b; LTE -> a <= b; GT -> a > b; GTE -> a >= b }
}

/**
 * Tek koşul: [left] [op] ([right] × (1 + [value]/100))  ya da  [left] [op] [value].
 * Örnek: Fiyat ≤ 5 yıl en düşük +%10  →  left=PRICE, op=LTE, right=LOW_5Y, value=10
 */
@Serializable
data class Condition(
    val left: Field,
    val op: Op,
    val right: Field? = null,
    val value: Double = 0.0,
) {
    val fields: List<Field> get() = listOfNotNull(left, right)
}

@Serializable
enum class ScreenSort(val label: String) {
    CLOSEST("Koşula en yakın"),
    CHANGE_DESC("En çok yükselen"),
    CHANGE_ASC("En çok düşen"),
    MCAP_DESC("Piyasa değeri"),
    NAME("Ada göre"),
}

@Serializable
data class Screen(
    val id: String,
    val name: String,
    val universe: Universe = Universe.MY_LIST,
    /** Yalnızca [Universe.MY_LIST] için: listeyi bir kategoriyle daralt (null = tümü). */
    val category: Category? = null,
    val currency: ScreenCurrency = ScreenCurrency.LOCAL,
    val conditions: List<Condition> = emptyList(),
    /** true: tüm koşullar; false: herhangi biri. */
    val matchAll: Boolean = true,
    val sort: ScreenSort = ScreenSort.CLOSEST,
    val limit: Int = 30,
    /** Yalnızca hisseler (listemdeki endeks, döviz, emtia vb. hariç). BIST/ABD evreninde zaten hisseler. */
    val onlyStocks: Boolean = false,
) {
    val usesHistory: Boolean get() = conditions.any { c -> c.fields.any { it.needsHistory } }

    /** Kısa özet: "BIST hisseleri · USD · 1 koşul". */
    fun summary(): String = listOfNotNull(
        if (universe == Universe.MY_LIST && category != null) "Listem · ${category.label}" else universe.label,
        if (currency == ScreenCurrency.USD) "USD" else null,
        "${conditions.size} koşul",
    ).joinToString(" · ")
}

@Serializable
data class ScreenRow(
    val symbol: String,
    val name: String,
    val price: Double?,
    val change: Double?,
    /** Gösterilen para birimi (USD modunda USD). */
    val currency: String? = null,
    val decimals: Int = 2,
    /** Sıralama/yakınlık ölçüsü: ilk koşulun sol/sağ oranı. */
    val score: Double? = null,
)

@Serializable
data class ScreenResult(
    val time: Long,
    val rows: List<ScreenRow> = emptyList(),
    /** Taranan toplam sembol sayısı. */
    val scanned: Int = 0,
    val error: String? = null,
    val note: String? = null,
)

/**
 * Uygulamaya hazır gelen dinamik listeler (aynı zamanda yeni liste için şablonlar).
 * İlk ikisi kullanıcının örnekleri; diğerleri sık kullanılan "kısa yol" taramalar.
 * Büyüklük eşikleri küçük/sığ hisseleri eler (BIST piyasa değeri ₺, ABD $).
 */
object ScreenTemplates {
    private const val MLR = 1e9

    val all: List<Screen> = listOf(
        // --- Kullanıcının örnekleri
        Screen(
            "d_bist_5y_usd", "5 yıllık dibe yakın BIST ($)", Universe.BIST, null, ScreenCurrency.USD,
            listOf(Condition(Field.PRICE, Op.LTE, Field.LOW_5Y, 10.0)),
        ),
        Screen(
            "d_my_us_sma200", "200 günlük ortalama civarı (listemdeki ABD)", Universe.MY_LIST, Category.US, ScreenCurrency.LOCAL,
            listOf(Condition(Field.PRICE, Op.LT, Field.SMA200, 5.0)),
        ),
        // --- Kısa yollar
        Screen(
            "d_bist_movers", "Günün yıldızları (BIST)", Universe.BIST, null, ScreenCurrency.LOCAL,
            listOf(Condition(Field.CHANGE, Op.GTE, null, 4.0), Condition(Field.MCAP, Op.GT, null, 5 * MLR)),
            sort = ScreenSort.CHANGE_DESC, limit = 10,
        ),
        Screen(
            "d_bist_oversold_big", "Aşırı satılmış BIST devleri", Universe.BIST, null, ScreenCurrency.LOCAL,
            listOf(Condition(Field.RSI, Op.LT, null, 35.0), Condition(Field.MCAP, Op.GT, null, 50 * MLR)),
            limit = 20,
        ),
        Screen(
            "d_bist_trend_cheap", "Trendde ve ucuz (BIST)", Universe.BIST, null, ScreenCurrency.LOCAL,
            listOf(
                Condition(Field.PE, Op.LT, null, 10.0),
                Condition(Field.PE, Op.GT, null, 0.0),
                Condition(Field.PRICE, Op.GT, Field.SMA200, 0.0),
                Condition(Field.SMA50, Op.GT, Field.SMA200, 0.0),
                Condition(Field.MCAP, Op.GT, null, 10 * MLR),
            ),
            sort = ScreenSort.MCAP_DESC, limit = 20,
        ),
        Screen(
            // Tüm zamanların zirvesi çok katı (çoğu hisse uzak); yaygın "yeni zirve" taraması 52 haftalık zirveye bakar
            "d_bist_52w_high", "Zirveye yakın BIST hisseleri", Universe.BIST, null, ScreenCurrency.LOCAL,
            listOf(Condition(Field.PRICE, Op.GTE, Field.HIGH_52W, -5.0), Condition(Field.MCAP, Op.GT, null, 20 * MLR)),
            limit = 20,
        ),
        Screen(
            "d_us_megacap_dip", "Düşüşteki ABD devleri", Universe.US, null, ScreenCurrency.LOCAL,
            listOf(Condition(Field.PRICE, Op.LTE, Field.LOW_52W, 15.0), Condition(Field.MCAP, Op.GT, null, 100 * MLR)),
            limit = 20,
        ),
    )

    /** Uygulamaya varsayılan olarak gelenler (şu an hepsi). */
    val defaults: List<Screen> get() = all
}
