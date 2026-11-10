package com.piyasa.widget.widget

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.Quote
import com.piyasa.widget.ui.FormulaBuilderScreen
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

    @Test
    fun editGramGold() {
        assumeTrue(System.getProperty("previews") == "true")
        render("builder_edit") {
            FormulaBuilderScreen(state, state.formula("GRAM_ALTIN"), {}, {}, {})
        }
    }

    @Test
    fun newWithTemplate() {
        assumeTrue(System.getProperty("previews") == "true")
        render("builder_template") {
            FormulaBuilderScreen(state, null, {}, {}, {}, initialTemplate = 2)
        }
    }
}
