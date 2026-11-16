package com.piyasa.widget.widget

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.piyasa.widget.data.AdvantageData
import com.piyasa.widget.data.Remote
import com.piyasa.widget.model.Advices
import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.Metal
import com.piyasa.widget.model.Premiums
import com.piyasa.widget.model.ScreenListSort
import com.piyasa.widget.ui.AdvantageContent
import com.piyasa.widget.ui.Glossary
import com.piyasa.widget.ui.GlossaryContent
import com.piyasa.widget.ui.PiyasaTheme
import com.piyasa.widget.ui.WatchList
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import org.robolectric.shadows.ShadowLooper
import java.io.File
import java.net.URL
import java.time.Instant

/**
 * Avantajlı fiyatlar, sözlük ve ana listeyi yayındaki gerçek veriyle PNG olarak çizer:
 *   ./gradlew testDebugUnitTest -Ppreviews=true --tests '*AdvantagePreviewTest*'
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w400dp-h1900dp-xxhdpi")
class AdvantagePreviewTest {
    private fun render(name: String, content: @androidx.compose.runtime.Composable () -> Unit) {
        val activity = Robolectric.buildActivity(ComponentActivity::class.java).setup().get()
        activity.setContent { PiyasaTheme { content() } }
        repeat(4) { Thread.sleep(100); ShadowLooper.idleMainLooper(100, java.util.concurrent.TimeUnit.MILLISECONDS) }
        val root = activity.window.decorView
        val w = root.width.takeIf { it > 0 } ?: 1200
        val h = root.height.takeIf { it > 0 } ?: 5700
        root.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY))
        root.layout(0, 0, w, h)
        ShadowLooper.idleMainLooper()
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        root.draw(Canvas(bmp))
        val dir = File(System.getProperty("previews.dir") ?: "build/widget-previews").apply { mkdirs() }
        File(dir, "$name.png").outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    private fun published(path: String) = URL("${Remote.BASE}/$path").readText()

    /** 11 Kas 2026 fiyatlarıyla (BIST açıkken) yayındaki dosyalardan ekran verisi. */
    private fun data(): AdvantageData {
        val price = mapOf("BIST:ALTIN" to 71.34, "BIST:GLDTR" to 545.75, "BIST:ZGOLD" to 661.0, "BIST:ISGLK" to 660.0, "BIST:GMSTR" to 515.75,
            Metal.GOLD.symbol to 4057.965, Metal.SILVER.symbol to 52.8072, Premiums.USDTRY to 50.22866)
        val d = Remote.parseDaily(published("daily/misc.json"), Premiums.symbols)
        val fx = price[Premiums.USDTRY]
        val rows = Premiums.pairs.map { p ->
            Premiums.row(p, price[p.symbol], price[p.metal.symbol], fx, if (p.grams == null) Premiums.typicalGrams(d[p.symbol], d[p.metal.symbol], d[Premiums.USDTRY]) else null)
        }
        val adv = Advices.all(Remote.parseRatios(published("ratios.json")), price[Metal.GOLD.symbol], price[Metal.SILVER.symbol], fx, Instant.parse("2026-11-11T09:00:00Z"))
        val ratios = File("../web/research/out/ratios.json").takeIf { it.exists() }?.readText() ?: published("ratios.json")
        val money = Advices.money(Remote.parseRatios(ratios), price[Metal.GOLD.symbol], fx, 11842.82, Instant.parse("2026-11-11T09:00:00Z"))
        return AdvantageData(rows, adv, money, Remote.parseBanks(published("banks.json")), open = true, time = 1794380000000)
    }

    @Test fun advantageScreen() {
        assumeTrue(System.getProperty("previews") == "true")
        val d = data()
        listOf("ozet", "urunler", "maliyet", "birikim", "para-arzi").forEachIndexed { i, n -> render("analiz-$n") { AdvantageContent(d, {}, {}, {}, initialTab = i + 1) } }
        val outlook = com.piyasa.widget.data.Remote.parseOutlook(java.io.File("../web/public/data/outlook.json").readText())
        render("analiz-gorunum") { AdvantageContent(d, {}, {}, {}, initialTab = 0, outlook = outlook) }
    }

    @Test fun glossaryScreen() {
        assumeTrue(System.getProperty("previews") == "true")
        val g = Glossary.parse(File("src/main/assets/glossary.json").readText())
        render("glossary") { GlossaryContent(g, "rsi", {}) }
    }

    @Test fun mainListWithScoresAndCard() {
        assumeTrue(System.getProperty("previews") == "true")
        val scores = Remote.parseScores(published("scores.json"))
        val state = AppState(instruments = emptyList(), formulas = emptyList(), screenSort = ScreenListSort.SCORE)
        val d = data()
        render("main-list") { WatchList(state, {}, {}, scores = scores, advantage = d) }
    }
}
