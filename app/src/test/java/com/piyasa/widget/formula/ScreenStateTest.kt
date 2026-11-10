package com.piyasa.widget.formula

import com.piyasa.widget.data.AppJson
import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.Display
import com.piyasa.widget.model.Migrations
import com.piyasa.widget.model.ScreenResult
import com.piyasa.widget.model.ScreenRow
import com.piyasa.widget.model.ScreenTemplates
import com.piyasa.widget.model.WidgetConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Dinamik listeler: kayıt/okuma, widget girişleri, sıfırlama ve widget satırı. */
class ScreenStateTest {
    private val screen = ScreenTemplates.all.first()
    private val state = AppState(
        screens = listOf(screen),
        screenResults = mapOf(screen.id to ScreenResult(1L, listOf(ScreenRow("BIST:ARCLK", "Arçelik", 1.4045, -0.8, "USD", 3, 1.042)))),
        widgets = mapOf(3 to WidgetConfig(keys = listOf("GRAM_ALTIN", WidgetConfig.screenEntry(screen.id)))),
    )

    @Test fun roundTripsThroughJson() {
        val json = AppJson.encodeToString(AppState.serializer(), state)
        val back = AppJson.decodeFromString(AppState.serializer(), json)
        assertEquals(state.screens, back.screens)
        assertEquals(state.screenResults, back.screenResults)
        // Eski kayıt (screens alanı yok) sorunsuz okunur ve hazır listelerle açılır
        val old = AppJson.decodeFromString(AppState.serializer(), """{"refreshMinutes":30}""")
        assertEquals(ScreenTemplates.defaults, old.screens)
    }

    @Test fun newInstallHasDefaultScreens() {
        val s = Migrations.apply(AppState())
        assertEquals(ScreenTemplates.defaults.map { it.id }, s.screens.map { it.id })
        // Kullanıcının iki örneği ilk sırada
        assertEquals(listOf("d_bist_5y_usd", "d_my_us_sma200"), s.screens.take(2).map { it.id })
    }

    @Test fun upgradeAddsDefaultScreensAndKeepsOwn() {
        val mine = ScreenTemplates.defaults.first().copy(id = "benim", name = "Benim listem")
        val v3 = AppState(schema = 3, screens = listOf(mine, ScreenTemplates.defaults[2]))
        val s = Migrations.apply(v3)
        assertEquals("benim", s.screens.first().id)                 // kullanıcınınki önce, korunur
        assertEquals(1 + ScreenTemplates.defaults.size, s.screens.size) // eksik hazırlar eklendi, tekrar yok
        assertEquals(s.screens.size, s.screens.map { it.id }.toSet().size)
        // v4'te kullanıcı bir hazır listeyi silerse geri gelmez
        val deleted = s.copy(screens = s.screens.filterNot { it.id == "d_bist_movers" })
        assertTrue(Migrations.apply(deleted).screens.none { it.id == "d_bist_movers" })
    }

    @Test fun widgetEntriesAreNotItems() {
        val cfg = state.widgetConfig(3)
        assertEquals(listOf("GRAM_ALTIN"), cfg.itemKeys)
        assertTrue(WidgetConfig.isScreen(cfg.keys[1]))
        assertEquals(screen.id, WidgetConfig.screenId(cfg.keys[1]))
    }

    @Test fun resetToDefaultsKeepsScreensAndTheirWidgetEntries() {
        val r = Migrations.resetToDefaults(state)
        assertTrue(r.screens.containsAll(state.screens))
        assertEquals(ScreenTemplates.defaults.map { it.id }.toSet(), r.screens.map { it.id }.toSet()) // silinen hazırlar geri gelir
        assertTrue(WidgetConfig.screenEntry(screen.id) in r.widgetConfig(3).keys)
    }

    @Test fun screenRowBecomesWidgetLine() {
        val item = Display.screenRowItem(state.screenResults.getValue(screen.id).rows.single())
        assertEquals("Arçelik", item.title)
        assertEquals("$1,405", item.valueText)
        assertEquals("−%0,80", item.changeText)
        assertEquals(-1, item.direction)
        assertTrue(item.tvUrl!!.contains("BIST%3AARCLK"))
    }
}
