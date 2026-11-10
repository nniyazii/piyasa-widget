package com.piyasa.widget.model

import kotlinx.serialization.Serializable

@Serializable
enum class Category(val label: String, val short: String) {
    // Sıra = uygulamadaki ve widget düzenleyicisindeki gruplama sırası (kayıtta ad kullanılır, sıra değil)
    FX("Döviz", "FX"),
    COMMODITY("Emtia", "EMT"),
    TR("Türkiye", "TR"),
    US("Amerika", "ABD"),
    CRYPTO("Kripto", "KRP"),
    ECONOMY("Ekonomi", "EKO"),
    WORLD("Dünya", "DÜN"),
}

@Serializable
enum class Source(val label: String) {
    /**
     * TradingView tarayıcı (scanner) servisi: hisse, endeks, fon, sertifika, döviz, emtia, kripto ve
     * ekonomik göstergeler. Sembol biçimi TradingView ile aynıdır: "BIST:ALTIN", "ECONOMICS:TRHPI".
     */
    TRADINGVIEW("TradingView"),

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
enum class WidgetTheme(val label: String) { SYSTEM("Sistem"), LIGHT("Açık"), DARK("Koyu") }

@Serializable
enum class RowDensity(val label: String, val padding: Int) { COMPACT("Sıkı", 3), NORMAL("Normal", 5), COMFORTABLE("Rahat", 8) }

@Serializable
enum class ChangeStyle(val label: String) { PILL("Rozet"), TEXT("Yazı"), HIDDEN("Gizli") }

@Serializable
data class WidgetConfig(
    val title: String = "Piyasalar",
    /** Gösterge / formül anahtarları ve bölüm başlıkları ("#:Başlık"), sırasıyla. */
    val keys: List<String> = DEFAULT_WIDGET_KEYS,
    val showSpark: Boolean = true,
    val showSubtitle: Boolean = false,
    /** Yazı ölçeği: 0.85 küçük … 1.3 çok büyük. */
    val textScale: Float = 1.0f,
    val density: RowDensity = RowDensity.NORMAL,
    val theme: WidgetTheme = WidgetTheme.SYSTEM,
    /** Arka plan opaklığı 0.2 … 1.0 */
    val opacity: Float = 0.95f,
    val changeStyle: ChangeStyle = ChangeStyle.PILL,
    val showHeader: Boolean = true,
    val showTime: Boolean = true,
    /** Dinamik liste girişlerinde gösterilecek en fazla sonuç sayısı. */
    val screenRows: Int = 5,
) {
    companion object {
        val DEFAULT_WIDGET_KEYS = listOf("GRAM_ALTIN", "ONS", "USDTRY", "EURTRY", "XU100", "SPX")
        const val SECTION_PREFIX = "#:"

        fun isSection(entry: String) = entry.startsWith(SECTION_PREFIX)
        fun sectionTitle(entry: String) = entry.removePrefix(SECTION_PREFIX)
        fun section(title: String) = SECTION_PREFIX + title.trim()

        /** Dinamik liste girişi: widget'ta başlık + ilk N sonuç olarak açılır. */
        const val SCREEN_PREFIX = "@:"
        fun isScreen(entry: String) = entry.startsWith(SCREEN_PREFIX)
        fun screenId(entry: String) = entry.removePrefix(SCREEN_PREFIX)
        fun screenEntry(id: String) = SCREEN_PREFIX + id

        val TEXT_SCALES = listOf(0.85f to "Küçük", 1.0f to "Normal", 1.15f to "Büyük", 1.3f to "Çok büyük")

        /** Ana ekrana tek dokunuşla eklenen dinamik liste widget'ı: başlık = liste adı, ilk 10 sonuç. */
        fun forScreen(screen: Screen) = WidgetConfig(title = screen.name, keys = listOf(screenEntry(screen.id)), screenRows = 10)

        /** Listedeki bir grubun (Döviz, Hesaplamalar …) widget'ı. */
        fun forGroup(title: String, keys: List<String>) = WidgetConfig(title = title, keys = keys)
    }

    /** Bölüm başlıkları ve dinamik listeler hariç gösterge anahtarları. */
    val itemKeys: List<String> get() = keys.filterNot { isSection(it) || isScreen(it) }
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
    /** Durum şeması sürümü; eski kurulumlar açılışta taşınır (bkz. Migrations). */
    val schema: Int = 1,
    /** Dinamik listeler (filtreler) ve son tarama sonuçları. */
    val screens: List<Screen> = ScreenTemplates.defaults,
    val screenResults: Map<String, ScreenResult> = emptyMap(),
    /**
     * Uygulamadan ana ekrana sabitlenmesi istenen widget'ın içeriği. Başlatıcı widget'ı eklediğinde
     * yeni widget'a atanır (bkz. WidgetPins); başlatıcı ayar ekranını açarsa orada başlangıç değeridir.
     */
    val pendingWidget: WidgetConfig? = null,
    val pendingWidgetAt: Long = 0L,
) {
    /** Yakın zamanda (2 dk) istenen sabitleme içeriği; vazgeçilmiş eski istekler sonraki widget'lara sızmasın. */
    fun pendingWidget(now: Long = System.currentTimeMillis()): WidgetConfig? =
        pendingWidget?.takeIf { now - pendingWidgetAt in 0..120_000 }

    fun instrument(key: String): Instrument? = instruments.firstOrNull { it.key == key }
    fun formula(key: String): Formula? = formulas.firstOrNull { it.key == key }
    fun screen(id: String): Screen? = screens.firstOrNull { it.id == id }
    fun widgetConfig(appWidgetId: Int): WidgetConfig = widgets[appWidgetId] ?: WidgetConfig()

    /** Tüm anahtarlar (enstrüman + formül). */
    val allKeys: List<String> get() = instruments.map { it.key } + formulas.map { it.key }

    fun titleOf(key: String): String = instrument(key)?.name ?: formula(key)?.name ?: key
}
