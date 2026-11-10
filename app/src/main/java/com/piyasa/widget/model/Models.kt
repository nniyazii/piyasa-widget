package com.piyasa.widget.model

import kotlinx.serialization.Serializable

@Serializable
enum class Category(val label: String, val short: String) {
    US("Amerika", "ABD"),
    TR("Türkiye", "TR"),
    COMMODITY("Emtia", "EMT"),
    FX("Döviz", "FX"),
}

@Serializable
enum class Source(val label: String) {
    /** Yahoo Finance chart API (anahtar gerektirmez, TR hisseleri ~15 dk gecikmeli). */
    YAHOO("Yahoo Finance"),

    /** gold-api.com spot metal fiyatları (XAU, XAG, XPT, XPD, HG). */
    GOLD_API("gold-api.com (spot)"),

    /** TCMB gösterge kurları. Sembol biçimi: "USD:ForexSelling". */
    TCMB("TCMB"),
}

@Serializable
data class Instrument(
    /** Formüllerde kullanılan benzersiz anahtar (ör. USDTRY, ONS). */
    val key: String,
    val name: String,
    /** Kaynağa özgü sembol (^GSPC, XU100.IS, XAU, USD:ForexSelling ...). */
    val symbol: String,
    val source: Source,
    val category: Category,
    val decimals: Int = 2,
    val prefix: String = "",
    val suffix: String = "",
    /** Kısa açıklama: "Spot", "Vadeli", "TCMB satış" ... */
    val note: String? = null,
    /** TradingView sembolü (ör. BIST:ASELS). Boşsa katalogdan / sembolden türetilir. */
    val tvSymbol: String? = null,
)

@Serializable
data class Formula(
    val key: String,
    val name: String,
    val expression: String,
    val decimals: Int = 2,
    val prefix: String = "",
    val suffix: String = "",
)

@Serializable
data class Quote(
    val price: Double,
    /** Önceki kapanış (günlük değişim referansı). */
    val prevClose: Double? = null,
    /** Fiyatın zamanı, epoch millis. */
    val time: Long,
    val currency: String? = null,
    /** Gün içi mini grafik noktaları. */
    val spark: List<Double> = emptyList(),
)

@Serializable
data class WidgetConfig(
    val title: String = "Piyasalar",
    val keys: List<String> = DEFAULT_WIDGET_KEYS,
    val showSpark: Boolean = true,
    val showSubtitle: Boolean = false,
) {
    companion object {
        val DEFAULT_WIDGET_KEYS = listOf("GRAM_ALTIN", "ONS", "USDTRY", "EURTRY", "XU100", "SPX")
    }
}

@Serializable
data class AppState(
    val instruments: List<Instrument> = Catalog.defaultInstruments,
    val formulas: List<Formula> = Catalog.defaultFormulas,
    val quotes: Map<String, Quote> = emptyMap(),
    val widgets: Map<Int, WidgetConfig> = emptyMap(),
    val refreshMinutes: Int = 30,
    val lastRefresh: Long = 0L,
    val refreshing: Boolean = false,
    val lastError: String? = null,
) {
    fun instrument(key: String): Instrument? = instruments.firstOrNull { it.key == key }
    fun formula(key: String): Formula? = formulas.firstOrNull { it.key == key }
    fun widgetConfig(appWidgetId: Int): WidgetConfig = widgets[appWidgetId] ?: WidgetConfig()

    /** Tüm anahtarlar (enstrüman + formül). */
    val allKeys: List<String> get() = instruments.map { it.key } + formulas.map { it.key }

    fun titleOf(key: String): String = instrument(key)?.name ?: formula(key)?.name ?: key
}
