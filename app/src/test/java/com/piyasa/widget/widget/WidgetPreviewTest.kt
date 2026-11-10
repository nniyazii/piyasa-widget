package com.piyasa.widget.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.view.View
import android.widget.FrameLayout
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.appwidget.compose
import org.robolectric.RuntimeEnvironment
import com.piyasa.widget.data.appStore
import com.piyasa.widget.model.Quote
import com.piyasa.widget.model.WidgetConfig
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * Widget'ı farklı boyutlarda PNG olarak çizer (görsel kontrol için).
 * Varsayılan test çalıştırmasında atlanır: ./gradlew testDebugUnitTest -Ppreviews=true
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w411dp-h891dp-xxhdpi")
class WidgetPreviewTest {

    private val context: Context = RuntimeEnvironment.getApplication()

    private fun spark(base: Double, drift: Double) = List(30) { i ->
        base * (1 + drift * i / 30.0 + 0.002 * kotlin.math.sin(i / 2.5))
    }

    private var cfg = WidgetConfig()

    private fun config(c: WidgetConfig) {
        cfg = c
    }

    private fun seed() = runBlocking {
        val now = System.currentTimeMillis()
        fun q(p: Double, prev: Double) = Quote(p, prev, now, spark = spark(prev, (p / prev - 1)))
        context.appStore.updateData {
            it.copy(
                lastRefresh = now,
                quotes = mapOf(
                    "SPX" to q(6912.3, 6897.8),
                    "NASDAQ" to q(23410.5, 23502.1),
                    "DOW" to q(47120.2, 47010.0),
                    "XU100" to q(10812.45, 10852.6),
                    "XU030" to q(11920.1, 11960.3),
                    "ONS" to q(4046.10, 4021.2),
                    "GUMUS" to q(48.512, 48.10),
                    "BRENT" to q(64.21, 64.95),
                    "USDTRY" to q(50.1530, 50.1290),
                    "EURTRY" to q(58.0425, 57.9120),
                    "EURUSD" to q(1.1573, 1.1552),
                ),
            )
        }
    }

    private fun render(name: String, wDp: Int, hDp: Int) = runBlocking {
        val rv = PiyasaWidget(previewConfig = cfg).compose(context, size = DpSize(wDp.dp, hDp.dp))
        val density = context.resources.displayMetrics.density
        val w = (wDp * density).toInt()
        val h = (hDp * density).toInt()
        val pad = (16 * density).toInt()
        val parent = FrameLayout(context)
        val view = rv.apply(context, parent)
        parent.addView(view, FrameLayout.LayoutParams(w, h))
        parent.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY))
        parent.layout(0, 0, w, h)
        org.robolectric.shadows.ShadowLooper.idleMainLooper()
        parent.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY))
        parent.layout(0, 0, w, h)
        if (System.getProperty("previews.debug") == "true") dump(parent, 0)
        val bmp = Bitmap.createBitmap(w + 2 * pad, h + 2 * pad, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        canvas.drawColor(Color.parseColor("#3B4A5C")) // duvar kağıdı
        canvas.translate(pad.toFloat(), pad.toFloat())
        parent.draw(canvas)
        val dir = File(System.getProperty("previews.dir") ?: "build/widget-previews").apply { mkdirs() }
        File(dir, "$name.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    private fun dump(v: View, depth: Int) {
        val extra = if (v is android.widget.AdapterView<*>) " adapter=${v.adapter?.count} children=${v.childCount}" else ""
        println("  ".repeat(depth) + v.javaClass.simpleName + " ${v.width}x${v.height} vis=${v.visibility}" + extra)
        if (v is android.view.ViewGroup) for (i in 0 until v.childCount) dump(v.getChildAt(i), depth + 1)
    }

    private val five = listOf("GRAM_ALTIN", "ONS", "USDTRY", "XU100", "SPX")

    @Test
    fun renderLight() {
        assumeTrue(System.getProperty("previews") == "true")
        seed()
        config(WidgetConfig(keys = five))
        render("light_4x2", 320, 200)
        config(WidgetConfig(keys = five.take(3)))
        render("light_2x2", 150, 190)
        render("light_4x1", 320, 64)
        config(WidgetConfig(title = "Altın & Döviz", keys = five + "BIST_USD", showSubtitle = true))
        render("light_4x3_subtitle", 320, 260)
        config(WidgetConfig(keys = five + listOf("EURTRY", "NASDAQ", "BRENT", "GRAM_GUMUS", "EURUSD")))
        render("light_5x3_two_columns", 400, 230)
    }

    @Test
    @Config(qualifiers = "w411dp-h891dp-night-xxhdpi")
    fun renderDark() {
        assumeTrue(System.getProperty("previews") == "true")
        seed()
        config(WidgetConfig(keys = five))
        render("dark_4x2", 320, 200)
        render("dark_4x1", 320, 64)
        config(WidgetConfig(keys = five + listOf("EURTRY", "NASDAQ", "BRENT", "GRAM_GUMUS", "EURUSD")))
        render("dark_5x3_two_columns", 400, 230)
    }

    private val sectioned = listOf(
        WidgetConfig.section("Altın"), "GRAM_ALTIN", "ONS",
        WidgetConfig.section("Döviz"), "USDTRY", "EURTRY",
        WidgetConfig.section("Borsa"), "XU100", "SPX",
    )

    @Test
    fun renderStyles() {
        assumeTrue(System.getProperty("previews") == "true")
        seed()
        config(WidgetConfig(keys = sectioned, showSpark = true))
        render("style_sections", 320, 300)
        config(WidgetConfig(keys = sectioned + listOf("NASDAQ", "BRENT")))
        render("style_sections_two_columns", 400, 260)
        config(WidgetConfig(keys = five.take(4), textScale = 1.3f, density = com.piyasa.widget.model.RowDensity.COMFORTABLE))
        render("style_large_text", 320, 260)
        config(WidgetConfig(keys = sectioned, textScale = 0.85f, density = com.piyasa.widget.model.RowDensity.COMPACT,
            changeStyle = com.piyasa.widget.model.ChangeStyle.TEXT, showHeader = false, showSpark = false))
        render("style_small_compact_text", 320, 200)
        config(WidgetConfig(keys = sectioned, theme = com.piyasa.widget.model.WidgetTheme.DARK, opacity = 0.55f))
        render("style_dark_transparent", 320, 300)
    }

    /** Widget'ta dinamik liste: başlık + ilk N sonuç. */
    @Test
    fun renderScreens() {
        assumeTrue(System.getProperty("previews") == "true")
        seed()
        runBlocking {
            val s1 = com.piyasa.widget.model.ScreenTemplates.all.first { it.id == "d_bist_5y_usd" }.copy(id = "s1", name = "5Y dibe yakın BIST ($)")
            val s2 = com.piyasa.widget.model.ScreenTemplates.all.first { it.id == "d_my_us_sma200" }.copy(id = "s2", name = "SMA200 civarı ABD")
            context.appStore.updateData {
                it.copy(
                    screens = listOf(s1, s2),
                    screenResults = mapOf(
                        "s1" to com.piyasa.widget.model.ScreenResult(0, listOf(
                            com.piyasa.widget.model.ScreenRow("BIST:ARCLK", "Arçelik", 1.4045, -0.8, "USD", 3),
                            com.piyasa.widget.model.ScreenRow("BIST:KLNMA", "Kalkınma Yatırım", 0.1360, 0.4, "USD", 4),
                            com.piyasa.widget.model.ScreenRow("BIST:SASA", "Sasa Polyester", 0.0317, -1.9, "USD", 4),
                        )),
                        "s2" to com.piyasa.widget.model.ScreenResult(0, listOf(
                            com.piyasa.widget.model.ScreenRow("NASDAQ:META", "Meta", 639.61, -0.36, "USD", 2),
                            com.piyasa.widget.model.ScreenRow("NASDAQ:TSLA", "Tesla", 377.29, -0.48, "USD", 2),
                            com.piyasa.widget.model.ScreenRow("NASDAQ:GOOGL", "Alphabet", 286.66, -0.29, "USD", 2),
                        )),
                    ),
                )
            }
        }
        config(WidgetConfig(title = "Fırsatlar", keys = listOf(WidgetConfig.screenEntry("s1"), WidgetConfig.screenEntry("s2")), screenRows = 3))
        render("screens_4x3", 320, 290)
        config(WidgetConfig(keys = listOf("GRAM_ALTIN", "USDTRY", WidgetConfig.screenEntry("s1")), screenRows = 3))
        render("screens_mixed", 320, 250)
        // Uygulamadan tek dokunuşla sabitlenen liste widget'ı: başlık = liste adı, iç başlık tekrarlanmaz
        val s1 = runBlocking { context.appStore.data.first().screen("s1")!! }
        config(WidgetConfig.forScreen(s1))
        render("screens_pinned", 320, 160)
    }
}
