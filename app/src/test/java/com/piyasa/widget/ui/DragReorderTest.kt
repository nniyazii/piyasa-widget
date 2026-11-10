package com.piyasa.widget.ui

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import com.piyasa.widget.config.WidgetEditor
import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.WidgetConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Sürükle-bırak sıralama, gerçek dokunuşlarla (uzun bas → sürükle → bırak). */
@RunWith(RobolectricTestRunner::class)
@org.robolectric.annotation.GraphicsMode(org.robolectric.annotation.GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w400dp-h900dp-xxhdpi", application = android.app.Application::class)
class DragReorderTest {

    @get:Rule val rule = createComposeRule()

    private val state = AppState()
    private var reordered: Pair<String, List<String>>? = null
    private var openedScreen: String? = null

    private fun showList(state: AppState = this.state) {
        androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().setInTouchMode(true)
        rule.setContent {
            PiyasaTheme {
                WatchList(
                    state, onEdit = {}, onRemove = {},
                    onReorder = { g, keys -> reordered = g to keys },
                    onOpenScreen = { openedScreen = it },
                )
            }
        }
    }

    /** Uzun bas, [rows] satır kadar aşağı (eksi: yukarı) adım adım sürükle, bırak. */
    private fun longPressDrag(text: String, rows: Float) {
        rule.onNodeWithText(text).performTouchInput {
            down(center)
            advanceEventTime(viewConfiguration.longPressTimeoutMillis + 200)
            val rowHeight = height * 1.9f // metin satırın yaklaşık yarısı
            repeat(20) { moveBy(Offset(0f, rows * rowHeight / 20f), delayMillis = 32) }
        }
        rule.waitForIdle()
        rule.onNodeWithText(text).performTouchInput { up() }
        rule.waitForIdle()
    }

    @Test fun dragFormulaDownReordersWithinGroup() {
        showList()
        // Hesaplamalar: Gram Altın, Çeyrek Altın, Gram Gümüş, Sertifika Primi …
        longPressDrag("Gram Altın", 2.2f)
        val (group, keys) = reordered ?: throw AssertionError("sıra kaydedilmedi")
        assertEquals(ListGroup.FORMULAS, group)
        assertEquals(state.formulas.size, keys.size)
        assertTrue("Gram Altın aşağı inmeli: $keys", keys.indexOf("GRAM_ALTIN") >= 2)
        assertEquals(state.formulas.map { it.key }.toSet(), keys.toSet())
    }

    @Test fun longPressWithoutDragOpensMenuInsteadOfReordering() {
        showList()
        rule.onNodeWithText("Gram Altın").performTouchInput {
            down(center)
            advanceEventTime(viewConfiguration.longPressTimeoutMillis + 300)
            up()
        }
        rule.waitForIdle()
        assertNull(reordered)
        rule.onNodeWithText("Düzenle").assertExists()
        rule.onNodeWithText("Sil").assertExists()
    }

    @Test fun tapStillOpensAndHeaderOffersWidget() {
        // Kısa liste: dinamik listeler ekranda görünsün
        showList(state.copy(instruments = state.instruments.take(2), formulas = state.formulas.take(2)))
        val first = state.screens.first()
        rule.onNodeWithText(first.name).performClick()
        rule.waitForIdle()
        assertEquals(first.id, openedScreen)
        // Grup başlığının ⋮ menüsü: grubu widget olarak ekle
        rule.onAllNodesWithContentDescription("Hesaplamalar seçenekleri")[0].performClick()
        rule.waitForIdle()
        rule.onNodeWithText("Ana ekrana widget olarak ekle").assertExists()
    }

    @Test fun widgetEditorEntriesReorderByDragHandle() {
        androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().setInTouchMode(true)
        var saved: WidgetConfig? = null
        val cfg = WidgetConfig(keys = listOf("GRAM_ALTIN", "USDTRY", "EURTRY", "XU100"))
        rule.setContent {
            PiyasaTheme { WidgetEditor(state, cfg, DpSize(320.dp, 200.dp), onSave = { saved = it }, onCancel = {}, livePreview = false) }
        }
        // İlk girişin ≡ tutamacını iki satır aşağı sürükle (tutamaç uzun basma beklemez)
        rule.onAllNodesWithContentDescription("Sürükle")[0].performTouchInput {
            down(center)
            repeat(20) { moveBy(Offset(0f, height * 2.3f * 2 / 20f), delayMillis = 32) }
        }
        rule.waitForIdle()
        rule.onAllNodesWithContentDescription("Sürükle")[0].performTouchInput { up() }
        rule.waitForIdle()
        rule.onAllNodesWithText("Kaydet")[0].performClick()
        rule.waitForIdle()
        val keys = saved?.keys ?: throw AssertionError("kaydedilmedi")
        assertEquals(cfg.keys.toSet(), keys.toSet())
        assertTrue("Gram Altın aşağı inmeli: $keys", keys.indexOf("GRAM_ALTIN") >= 1)
    }
}

private fun androidx.compose.ui.test.junit4.ComposeContentTestRule.onAllNodesWithText(text: String) =
    onAllNodes(androidx.compose.ui.test.hasText(text))
