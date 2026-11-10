package com.piyasa.widget.ui

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onLast
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.piyasa.widget.data.Actions
import com.piyasa.widget.data.appStore
import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.Formula
import com.piyasa.widget.model.Instrument
import com.piyasa.widget.model.Quote
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/**
 * Formül kaydetme akışı, gerçek tıklamalarla:
 * ifade → sağ üstte "Kaydet" → ad/birim penceresi → "Kaydet" → formül kaydedilir ve ekran kapanır.
 */
@RunWith(RobolectricTestRunner::class)
@org.robolectric.annotation.GraphicsMode(org.robolectric.annotation.GraphicsMode.Mode.NATIVE) // metin alanı yerleşimi için
// Düz Application: PiyasaApp açılışta WorkManager zamanlar, testte gerek yok
@Config(sdk = [35], qualifiers = "w400dp-h760dp-xxhdpi", application = android.app.Application::class)
class ComposerFlowTest {

    @get:Rule val rule = createComposeRule()

    private val state = AppState().let { s ->
        val now = System.currentTimeMillis()
        s.copy(quotes = mapOf("ONS" to Quote(4046.10, 4021.2, now), "USDTRY" to Quote(50.153, 50.129, now)))
    }

    private var saved: Triple<Formula, String?, List<Instrument>>? = null
    private var closed = false

    private fun open(tokens: List<String>?, editing: Formula? = null) {
        // Telefondaki gibi dokunmatik mod: pencere açılınca metin alanına kendiliğinden odak verilmez
        // (aksi halde yanıp sönen imleç test aracında "hiç boşta olmama" olarak görülür).
        androidx.test.platform.app.InstrumentationRegistry.getInstrumentation().setInTouchMode(true)
        rule.mainClock.autoAdvance = false
        rule.setContent {
            PiyasaTheme {
                ComposerScreen(
                    baseState = state,
                    editing = editing,
                    onClose = { closed = true },
                    onAddInstrument = {},
                    onUndoInstrument = {},
                    onSaveFormula = { f, original, needed -> saved = Triple(f, original, needed) },
                    onDeleteFormula = {},
                    searcher = { emptyList() },
                    initialTokens = tokens,
                    autoFocus = false,
                )
            }
        }
    }

    /** Elle ilerleyen saati bir miktar ileri al: pencere/uyarı çizilsin. */
    private fun tick() {
        repeat(5) { rule.mainClock.advanceTimeBy(200) }
    }

    /** Dokunuş koordinatı yerine erişilebilirlik "tıkla" eylemi (ekran dışına düşen dokunuşlardan bağımsız). */
    private fun SemanticsNodeInteraction.click() {
        performSemanticsAction(SemanticsActions.OnClick)
        tick()
    }

    /** Kaydetme penceresindeki "Kaydet" (sağ üstteki değil): en son eklenen tıklanabilir "Kaydet". */
    private fun dialogSave() = rule.onAllNodes(hasText("Kaydet") and hasClickAction()).onLast()

    @Test fun topRightSaveButtonSavesFormulaAndCloses() {
        open(listOf("ONS", "*", "USDTRY", "/", "OZ"))
        // Formül yazılırken sağ üstte "Bitti" değil "Kaydet" var
        rule.onAllNodesWithText("Bitti").assertCountEquals(0)
        rule.onNodeWithText("Kaydet").click()
        // Kaydetme penceresi açıldı (başlığı yalnızca pencerede var) ve ad önerildi
        rule.onNodeWithText("Formülü kaydet").assertExists()
        rule.onAllNodesWithText("Gram Altın").assertCountEquals(2) // listede + pencerede önerilen ad
        rule.onNode(hasSetTextAction() and hasText("Gram Altın")).assertDoesNotExist() // klavye açılmaz
        dialogSave().click()
        val s = saved
        assertNotNull("Formül kaydedilmedi", s)
        assertEquals("ONS * USDTRY / OZ", s!!.first.expression)
        assertEquals("Gram Altın", s.first.name)
        assertEquals("₺", s.first.suffix)
        assertTrue("Kaydettikten sonra ekran kapanmalı", closed)
    }

    @Test fun equalsKeySavesToo() {
        open(listOf("XU100", "/", "USDTRY"))
        rule.onNodeWithText("=").click()
        rule.onNodeWithText("Formülü kaydet").assertExists()
        dialogSave().click()
        assertEquals("BIST 100 ($)", saved?.first?.name)
        assertTrue(closed)
    }

    @Test fun incompleteFormulaDoesNotOpenSaveDialog() {
        open(listOf("ONS", "*"))
        rule.onNodeWithText("Kaydet").click()
        rule.onNodeWithText("Formülü kaydet").assertDoesNotExist()
        rule.onNode(hasText("Formül tamamlanmadı", substring = true)).assertExists()
        assertEquals(null, saved)
        assertTrue(!closed)
    }

    @Test fun withoutFormulaTopButtonIsBittiAndCloses() {
        open(null)
        rule.onNodeWithText("Bitti").click()
        assertTrue(closed)
        assertEquals(null, saved)
    }

    @Test fun savedFormulaLandsInStore() = runBlocking {
        val ctx = RuntimeEnvironment.getApplication()
        ctx.appStore.updateData { AppState() }
        Actions.upsertFormula(ctx, Formula("TEST_F", "Test", "ONS * 2"), null)
        val s = ctx.appStore.data.first()
        assertNotNull(s.formula("TEST_F"))
        assertEquals("Test", s.formula("TEST_F")!!.name)
    }
}

private fun androidx.compose.ui.test.SemanticsNodeInteractionCollection.assertCountEquals(n: Int) =
    assertEquals(n, fetchSemanticsNodes().size)
