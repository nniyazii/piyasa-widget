package com.piyasa.widget.formula

import com.piyasa.widget.model.Catalog
import com.piyasa.widget.model.Category
import com.piyasa.widget.model.Source
import com.piyasa.widget.model.TradingView
import org.junit.Assert.assertEquals
import org.junit.Test

class SymbolFactoryTest {
    private fun y(sym: String, type: String? = null, keys: List<String> = emptyList()) =
        Catalog.fromSymbol(sym, Source.YAHOO, null, keys, type)

    @Test fun guessesCategoryAndUnits() {
        y("asels.is", "EQUITY").let {
            assertEquals(Category.TR, it.category); assertEquals("ASELS", it.key); assertEquals("₺", it.suffix); assertEquals("", it.prefix)
        }
        y("NVDA", "EQUITY").let { assertEquals(Category.US, it.category); assertEquals("$", it.prefix) }
        y("GBPTRY=X").let { assertEquals(Category.FX, it.category); assertEquals(4, it.decimals); assertEquals("", it.prefix) }
        y("SI=F").let { assertEquals(Category.COMMODITY, it.category); assertEquals("Vadeli", it.note) }
        y("XU100.IS", "INDEX").let { assertEquals(Category.TR, it.category); assertEquals("", it.suffix) }
        y("^FTSE", "INDEX").let { assertEquals("FTSE", it.key); assertEquals("", it.prefix) }
        y("DOGE-USD", "CRYPTOCURRENCY").let { assertEquals(Category.CRYPTO, it.category); assertEquals("CRYPTO:DOGEUSD", TradingView.symbolOf(it)) }
    }

    @Test fun keyCollisionGetsSuffix() {
        assertEquals("ASELS_2", y("ASELS.IS", keys = listOf("ASELS")).key)
        assertEquals("ASELS_3", y("ASELS.IS", keys = listOf("ASELS", "ASELS_2")).key)
    }

    @Test fun otherSources() {
        Catalog.fromSymbol("XAG", Source.GOLD_API, "Gümüş", emptyList()).let {
            assertEquals(Category.COMMODITY, it.category); assertEquals("Spot", it.note); assertEquals("Gümüş", it.name)
        }
        Catalog.fromSymbol("GBP:ForexSelling", Source.TCMB, null, emptyList()).let {
            assertEquals(Category.FX, it.category); assertEquals("TCMB_GBP", it.key)
        }
    }
}
