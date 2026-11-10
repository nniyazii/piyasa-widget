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

/** Alanın verisi nereden gelir. */
enum class FieldSource {
    /** TradingView sütunu, doğrudan. */
    DIRECT,
    /** TradingView'un yıllık dizilerinden uygulamada hesaplanır (EPS/gelir büyümesi, beklenen F/K). */
    DERIVED,
    /** Yahoo aylık fiyat geçmişi gerekir (5 yıl dip/zirve, 5 yıllık ortalama F/K). */
    HISTORY,
}

@Serializable
enum class Field(
    val label: String,
    val kind: FieldKind,
    /** TradingView tarayıcı sütunu (yalnızca [FieldSource.DIRECT]). */
    val column: String?,
    val source: FieldSource = if (column != null) FieldSource.DIRECT else FieldSource.HISTORY,
    /** Seçicide gruplama. */
    val group: String = "Fiyat",
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
    MCAP("Piyasa değeri", FieldKind.MONEY, "market_cap_basic", group = "Değerleme"),

    // --- Değerleme
    PE("F/K", FieldKind.NUMBER, "price_earnings_ttm", group = "Değerleme"),
    /** Son 5 mali yılın (yıl sonu fiyatı ÷ o yılın EPS'i) ortalaması; zararlı yıllar hariç, en az 3 yıl. */
    PE_5Y_AVG("5 yıllık ortalama F/K", FieldKind.NUMBER, null, FieldSource.HISTORY, "Değerleme"),
    /** Fiyat ÷ gelecek mali yıl EPS tahmini. */
    FWD_PE("Beklenen F/K", FieldKind.NUMBER, null, FieldSource.DERIVED, "Değerleme"),
    PEG("PEG", FieldKind.NUMBER, "price_earnings_growth_ttm", group = "Değerleme"),
    PB("PD/DD", FieldKind.NUMBER, "price_book_fq", group = "Değerleme"),
    PS("Fiyat/Satış", FieldKind.NUMBER, "price_sales_current", group = "Değerleme"),
    EV_EBITDA("FD/FAVÖK", FieldKind.NUMBER, "enterprise_value_ebitda_ttm", group = "Değerleme"),
    DIV_YIELD("Temettü verimi %", FieldKind.PERCENT, "dividends_yield_current", group = "Değerleme"),

    // --- Kârlılık ve büyüme
    ROE("Özsermaye kârlılığı %", FieldKind.PERCENT, "return_on_equity_fq", group = "Kârlılık"),
    NET_MARGIN("Net kâr marjı %", FieldKind.PERCENT, "net_margin_ttm", group = "Kârlılık"),
    DEBT_EQ("Borç/Özsermaye", FieldKind.NUMBER, "debt_to_equity_fq", group = "Kârlılık"),
    EPS_GROWTH_1Y("EPS büyümesi (1 yıl) %", FieldKind.PERCENT, null, FieldSource.DERIVED, "Kârlılık"),
    EPS_CAGR_5Y("EPS büyümesi (5 yıl, yıllık) %", FieldKind.PERCENT, null, FieldSource.DERIVED, "Kârlılık"),
    REV_GROWTH_1Y("Gelir büyümesi (1 yıl) %", FieldKind.PERCENT, null, FieldSource.DERIVED, "Kârlılık"),
    ;

    val needsHistory: Boolean get() = source == FieldSource.HISTORY
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
    EXTREME("En uç değer"),
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

        // --- Temel analiz (bilanço): 0.7.0
        Screen(
            // Kullanıcının örneği: bugünkü F/K, son 5 mali yılın ortalama F/K'sının en az %50 altında
            "d_my_pe_half", "F/K'sı 5 yıllık ortalamasının yarısına inenler (listem)", Universe.MY_LIST, null, ScreenCurrency.LOCAL,
            listOf(Condition(Field.PE, Op.LTE, Field.PE_5Y_AVG, -50.0), Condition(Field.PE, Op.GT, null, 0.0)),
            sort = ScreenSort.EXTREME, onlyStocks = true,
        ),
        Screen(
            "d_bist_pe_hist_cheap", "Tarihine göre ucuzlamış BIST devleri", Universe.BIST, null, ScreenCurrency.LOCAL,
            listOf(
                Condition(Field.PE, Op.LTE, Field.PE_5Y_AVG, -40.0),
                Condition(Field.PE, Op.GT, null, 0.0),
                Condition(Field.MCAP, Op.GT, null, 50 * MLR),
            ),
            sort = ScreenSort.EXTREME, limit = 20,
        ),
        Screen(
            "d_us_pe_hist_cheap", "Tarihine göre ucuzlamış ABD devleri", Universe.US, null, ScreenCurrency.LOCAL,
            listOf(
                Condition(Field.PE, Op.LTE, Field.PE_5Y_AVG, -25.0),
                Condition(Field.PE, Op.GT, null, 0.0),
                Condition(Field.MCAP, Op.GT, null, 100 * MLR),
            ),
            sort = ScreenSort.EXTREME, limit = 20,
        ),
        Screen(
            // Analist tahmini: gelecek yılın kârıyla F/K bugünkünün en az %30 altına iniyor
            "d_bist_fwd_growth", "Kârı artması beklenen ucuz BIST", Universe.BIST, null, ScreenCurrency.LOCAL,
            listOf(
                Condition(Field.FWD_PE, Op.LTE, Field.PE, -30.0),
                Condition(Field.FWD_PE, Op.GT, null, 0.0),
                Condition(Field.PE, Op.GT, null, 0.0),
                Condition(Field.PE, Op.LT, null, 15.0),
                Condition(Field.MCAP, Op.GT, null, 20 * MLR),
            ),
            sort = ScreenSort.EXTREME, limit = 20,
        ),
        Screen(
            "d_bist_below_book", "Defter değerinin altında, kârlı BIST", Universe.BIST, null, ScreenCurrency.LOCAL,
            listOf(
                Condition(Field.PB, Op.LT, null, 1.0),
                Condition(Field.PB, Op.GT, null, 0.0),
                Condition(Field.ROE, Op.GT, null, 10.0),
                Condition(Field.MCAP, Op.GT, null, 10 * MLR),
            ),
            limit = 20,
        ),
        Screen(
            "d_bist_dividend", "Yüksek temettü verimli BIST", Universe.BIST, null, ScreenCurrency.LOCAL,
            listOf(Condition(Field.DIV_YIELD, Op.GTE, null, 6.0), Condition(Field.MCAP, Op.GT, null, 20 * MLR)),
            limit = 20,
        ),
        Screen(
            "d_us_quality", "Kaliteli ve makul fiyatlı ABD devleri", Universe.US, null, ScreenCurrency.LOCAL,
            listOf(
                Condition(Field.ROE, Op.GT, null, 20.0),
                Condition(Field.NET_MARGIN, Op.GT, null, 15.0),
                Condition(Field.DEBT_EQ, Op.LT, null, 1.0),
                Condition(Field.PE, Op.GT, null, 0.0),
                Condition(Field.PE, Op.LT, null, 25.0),
                Condition(Field.MCAP, Op.GT, null, 100 * MLR),
            ),
            sort = ScreenSort.MCAP_DESC, limit = 20,
        ),
        Screen(
            "d_us_growth_dip", "Büyüyen ama geri çekilen ABD devleri", Universe.US, null, ScreenCurrency.LOCAL,
            listOf(
                Condition(Field.PRICE, Op.LT, Field.SMA200, 0.0),
                Condition(Field.EPS_CAGR_5Y, Op.GT, null, 15.0),
                Condition(Field.MCAP, Op.GT, null, 50 * MLR),
            ),
            limit = 20,
        ),
    )

    /** Uygulamaya varsayılan olarak gelenler (şu an hepsi). */
    val defaults: List<Screen> get() = all

    /** 0.7.0 (şema 5) ile gelen hazır listeler: güncelleyen kullanıcılara da eklenir. */
    val addedInV5: Set<String> = setOf(
        "d_my_pe_half", "d_bist_pe_hist_cheap", "d_us_pe_hist_cheap", "d_bist_fwd_growth",
        "d_bist_below_book", "d_bist_dividend", "d_us_quality", "d_us_growth_dip",
    )
}
