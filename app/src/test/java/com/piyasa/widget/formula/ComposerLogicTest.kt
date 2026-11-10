package com.piyasa.widget.formula

import com.piyasa.widget.data.source.SearchHit
import com.piyasa.widget.model.AppState
import com.piyasa.widget.ui.SearchState
import com.piyasa.widget.ui.composerResults
import com.piyasa.widget.ui.suggestName
import com.piyasa.widget.ui.suggestUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ComposerLogicTest {
    private val state = AppState()

    @Test fun namesFamiliarFormulas() {
        assertEquals("Gram Altın", suggestName(state, listOf("ONS", "*", "USDTRY", "/", "OZ")))
        assertEquals("Gram Gümüş", suggestName(state, listOf("GUMUS", "*", "USDTRY", "/", "OZ")))
        assertEquals("BIST 100 ($)", suggestName(state, listOf("XU100", "/", "USDTRY")))
        assertEquals("Ons Altın / Ons Gümüş", suggestName(state, listOf("ONS", "/", "GUMUS")))
        assertEquals("Ons Altın × 2", suggestName(state, listOf("ONS", "*", "2")))
    }

    @Test fun suggestsUnits() {
        assertEquals("" to "₺", suggestUnit(listOf("ONS", "*", "USDTRY", "/", "OZ")))
        assertEquals("$" to "", suggestUnit(listOf("XU100", "/", "USDTRY")))
        assertEquals("" to "%", suggestUnit(listOf("pct(", "EURUSD", ";", "1.1", ")")))
        assertEquals("" to "", suggestUnit(listOf("ONS", "/", "GUMUS")))
    }

    @Test fun resultsPutYourOwnItemsFirst() {
        // "dolar" → listendeki Dolar/TL önce gelir (formülde ilk eşleşme olarak kullanılır)
        val r = composerResults(state, "dolar", SearchState.Idle)
        assertEquals("USDTRY", r.first().instrument.key)
        // formüller de bulunur
        assertTrue(composerResults(state, "gram", SearchState.Idle).any { it.instrument.key == "GRAM_ALTIN" })
        // OZ sabiti
        assertTrue(composerResults(state, "oz", SearchState.Idle).any { it.instrument.key == "OZ" })
    }

    @Test fun exactCodeWinsOverNameMatches() {
        val hits = listOf(
            SearchHit("BIST:TRALT", "Turk Altin Isletmeleri", "stock", "BIST", null, "TRALT", 1.0, 0.0, 100.0, "TRY"),
            SearchHit("BIST:ALTIN", "DARPHANE ALTIN SERTIFIKASI", "stock", "BIST", null, "ALTIN", 1.0, 0.0, 100.0, "TRY"),
        )
        val r = composerResults(state, "ALTIN.S1", SearchState.Done(hits))
        assertEquals("BIST:ALTIN", r.first().instrument.symbol)
    }

    @Test fun typedExpressionTokenizesLikeCalculator() {
        assertEquals(listOf("ONS", "*", "USDTRY", "/", "OZ"), Tokens.tokenize("ons×usdtry÷oz"))
        Parser.parse(Tokens.render(listOf("ONS", "*", "USDTRY", "/", "OZ")))
    }
}
