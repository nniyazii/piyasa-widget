package com.piyasa.widget.widget

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.ui.unit.dp
import com.piyasa.widget.data.appStore
import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.Quote
import com.piyasa.widget.ui.ComposerScreen
import com.piyasa.widget.ui.PiyasaTheme
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.robolectric.shadows.ShadowLooper
import java.io.File

/** Formül kurucusu ekranını PNG olarak çizer: ./gradlew testDebugUnitTest -Ppreviews=true */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w400dp-h1500dp-xxhdpi")
class BuilderPreviewTest {

    private val state = AppState().let { s ->
        val now = System.currentTimeMillis()
        s.copy(quotes = mapOf(
            "ONS" to Quote(4046.10, 4021.2, now), "GUMUS" to Quote(48.512, 48.10, now),
            "USDTRY" to Quote(50.1530, 50.1290, now), "EURTRY" to Quote(58.0425, 57.9120, now),
            "EURUSD" to Quote(1.1573, 1.1552, now), "XU100" to Quote(10812.45, 10852.6, now),
            "SPX" to Quote(6912.3, 6897.8, now), "BRENT" to Quote(64.21, 64.95, now),
        ))
    }

    private fun render(name: String, content: @androidx.compose.runtime.Composable () -> Unit) {
        val activity = Robolectric.buildActivity(ComponentActivity::class.java).setup().get()
        activity.setContent { PiyasaTheme { content() } }
        ShadowLooper.idleMainLooper()
        // Arama gecikmesi (delay) gerçek saatle çalışır: gerçekten bekle, sonra ana döngüyü işlet.
        repeat(8) { Thread.sleep(100); ShadowLooper.idleMainLooper(100, java.util.concurrent.TimeUnit.MILLISECONDS) }
        val root = activity.window.decorView
        val w = root.width.takeIf { it > 0 } ?: 1200
        val h = root.height.takeIf { it > 0 } ?: 4500
        root.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY))
        root.layout(0, 0, w, h)
        ShadowLooper.idleMainLooper()
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        root.draw(Canvas(bmp))
        val dir = File(System.getProperty("previews.dir") ?: "build/widget-previews").apply { mkdirs() }
        File(dir, "$name.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    private val tvHits = listOf(
        com.piyasa.widget.data.source.SearchHit("BIST:ALTIN", "DARPHANE ALTIN SERTIFIKASI", "stock", "BIST", "Hisse", "ALTIN", 71.34, -1.36, 100.0, "TRY"),
        com.piyasa.widget.data.source.SearchHit("OANDA:XAUUSD", "Gold", "commodity", "OANDA", "Emtia", "XAUUSD", 4021.85, -2.87, 1000.0, "USD"),
        com.piyasa.widget.data.source.SearchHit("BIST:GLDTR", "GOLDIST - Istanbul Gold ETF", "fund", "BIST", "Fon", "GLDTR", 545.75, -1.62, 100.0, "TRY"),
        com.piyasa.widget.data.source.SearchHit("BIST:TRALT", "Turk Altin Isletmeleri A.S.", "stock", "BIST", "Hisse", "TRALT", 41.2, 2.1, 100.0, "TRY"),
        com.piyasa.widget.data.source.SearchHit("TVC:GOLDSILVER", "Gold/Silver Ratio", "index", "TVC", "Endeks", "GOLDSILVER", 78.4, 1.1, 100.0, null),
        com.piyasa.widget.data.source.SearchHit("ECONOMICS:TRHPI", "Turkey House Price Index", "economic", "ECONOMICS", "Ekonomik gösterge", "TRHPI", 239.38, 1.22, null, null),
    )

    // ---- Birleşik "Ekle" ekranı (sembol + formül), telefon boyutunda
    private fun composer(
        name: String,
        tokens: List<String>? = null,
        query: String = "",
        editing: com.piyasa.widget.model.Formula? = null,
    ) = render(name) {
        ComposerScreen(
            state, editing, {}, {}, {}, { _, _, _ -> }, {},
            searcher = { tvHits }, initialTokens = tokens, initialQuery = query, autoFocus = false,
        )
    }

    @Test
    @Config(qualifiers = "w400dp-h760dp-xxhdpi")
    fun composerEmpty() {
        assumeTrue(System.getProperty("previews") == "true")
        composer("composer_empty")
    }

    @Test
    @Config(qualifiers = "w400dp-h760dp-xxhdpi")
    fun composerSymbolSearch() {
        assumeTrue(System.getProperty("previews") == "true")
        composer("composer_search", query = "altın")
    }

    @Test
    @Config(qualifiers = "w400dp-h760dp-xxhdpi")
    fun composerFormula() {
        assumeTrue(System.getProperty("previews") == "true")
        composer("composer_formula", tokens = listOf("ONS", "*", "USDTRY", "/", "OZ"))
    }

    @Test
    @Config(qualifiers = "w400dp-h760dp-xxhdpi")
    fun composerFormulaTyping() {
        assumeTrue(System.getProperty("previews") == "true")
        composer("composer_formula_typing", tokens = listOf("ONS", "*"), query = "dolar")
    }

    private val editorConfig = com.piyasa.widget.model.WidgetConfig(
        keys = listOf(
            com.piyasa.widget.model.WidgetConfig.section("Altın"), "GRAM_ALTIN", "ONS",
            com.piyasa.widget.model.WidgetConfig.section("Döviz"), "USDTRY", "EURTRY",
        ),
        textScale = 1.15f,
    )

    private fun seedStore() = kotlinx.coroutines.runBlocking {
        val app = org.robolectric.RuntimeEnvironment.getApplication()
        app.appStore.updateData { state.copy(lastRefresh = System.currentTimeMillis()) }
    }

    @Test
    fun widgetEditorContent() {
        assumeTrue(System.getProperty("previews") == "true")
        seedStore()
        render("editor_content") {
            com.piyasa.widget.config.WidgetEditor(state, editorConfig, androidx.compose.ui.unit.DpSize(320.dp, 230.dp), {}, {})
        }
    }

    @Test
    fun widgetEditorAppearance() {
        assumeTrue(System.getProperty("previews") == "true")
        seedStore()
        render("editor_appearance") {
            com.piyasa.widget.config.WidgetEditor(state, editorConfig, androidx.compose.ui.unit.DpSize(320.dp, 230.dp), {}, {}, initialTab = 1)
        }
    }

    // ---- Dinamik listeler (canlı testteki sonuçlara benzer örnek veriler)
    private val bist5y = com.piyasa.widget.model.ScreenTemplates.all.first { it.id == "d_bist_5y_usd" }.copy(id = "s1")
    private val usSma = com.piyasa.widget.model.ScreenTemplates.all.first { it.id == "d_my_us_sma200" }.copy(id = "s2")
    private val screenState = state.copy(
        screens = listOf(bist5y, usSma),
        screenResults = mapOf(
            "s1" to com.piyasa.widget.model.ScreenResult(System.currentTimeMillis(), listOf(
                com.piyasa.widget.model.ScreenRow("BIST:ARCLK", "Arçelik", 1.4045, -0.8, "USD", 3, 1.042),
                com.piyasa.widget.model.ScreenRow("BIST:KLNMA", "Kalkınma Yatırım Bankası", 0.1360, 0.4, "USD", 4, 1.046),
                com.piyasa.widget.model.ScreenRow("BIST:SASA", "Sasa Polyester", 0.0317, -1.9, "USD", 4, 1.090),
            ), scanned = 625, note = "5 yıllık veri: Yahoo Finance, ön elemeden geçen ilk 60 sembol (1 sembol alınamadı)"),
            "s2" to com.piyasa.widget.model.ScreenResult(System.currentTimeMillis(), listOf(
                com.piyasa.widget.model.ScreenRow("NASDAQ:META", "Meta", 639.61, -0.36, "USD", 2, 1.0125),
                com.piyasa.widget.model.ScreenRow("NASDAQ:TSLA", "Tesla", 377.29, -0.48, "USD", 2, 0.9845),
                com.piyasa.widget.model.ScreenRow("NASDAQ:GOOGL", "Alphabet", 286.66, -0.29, "USD", 2, 0.8454),
                com.piyasa.widget.model.ScreenRow("NASDAQ:NVDA", "Nvidia", 168.30, -6.32, "USD", 2, 0.8228),
            ), scanned = 7),
        ),
    )

    @Test
    @Config(qualifiers = "w400dp-h1500dp-xxhdpi")
    fun screenEditor() {
        assumeTrue(System.getProperty("previews") == "true")
        render("screen_editor") {
            com.piyasa.widget.ui.ScreenEditor(screenState, null, {}, {}, null, runner = { screenState.screenResults.getValue("s1") })
        }
    }

    @Test
    @Config(qualifiers = "w400dp-h900dp-xxhdpi")
    fun screenEditorTemplate() {
        assumeTrue(System.getProperty("previews") == "true")
        render("screen_editor_us") {
            com.piyasa.widget.ui.ScreenEditor(screenState, usSma, {}, {}, {}, runner = { screenState.screenResults.getValue("s2") })
        }
    }

    @Test
    @Config(qualifiers = "w400dp-h760dp-xxhdpi")
    fun screenResults() {
        assumeTrue(System.getProperty("previews") == "true")
        render("screen_results") {
            com.piyasa.widget.ui.ScreenResultsView(screenState, bist5y, {}, {}, {}, {})
        }
    }

    @Test
    @Config(qualifiers = "w400dp-h900dp-xxhdpi")
    fun watchListWithScreens() {
        assumeTrue(System.getProperty("previews") == "true")
        render("list_with_screens") {
            androidx.compose.material3.Surface { com.piyasa.widget.ui.WatchList(screenState, onEdit = {}, onRemove = {}) }
        }
    }

    /** Varsayılan liste (yeni kurulum), 10 Kasım 2026'ya yakın örnek fiyatlarla. */
    @Test
    @Config(qualifiers = "w400dp-h2200dp-xxhdpi")
    fun defaultWatchList() {
        assumeTrue(System.getProperty("previews") == "true")
        val q = mapOf(
            "USDTRY" to (50.2302 to 50.141), "EURTRY" to (56.075 to 56.33), "EURUSD" to (1.1164 to 1.1225), "DXY" to (102.25 to 101.67),
            "ONS" to (4028.82 to 4140.68), "GUMUS" to (51.294 to 53.41), "BRENT" to (91.44 to 92.18),
            "XU100" to (11661.86 to 11712.2), "XU030" to (14607.56 to 14610.4), "ALTIN" to (71.34 to 72.32),
            "SPX" to (7492.83 to 7550.2), "NASDAQ" to (24921.85 to 25250.8), "DOW" to (52106.41 to 52390.1), "US10Y" to (4.998 to 4.884),
            "BTC" to (73377.0 to 75270.0), "TR_ENF" to (29.77 to 29.73), "TR_FAIZ" to (36.0 to 37.0),
        )
        val s = AppState().copy(quotes = q.mapValues { (_, v) -> Quote(v.first, v.second, 0) })
        render("default_list") {
            androidx.compose.material3.Surface {
                com.piyasa.widget.ui.WatchList(s, onEdit = {}, onRemove = {})
            }
        }
    }
}
