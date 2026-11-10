package com.piyasa.widget.formula

import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.Catalog
import com.piyasa.widget.model.Category
import com.piyasa.widget.model.Display
import com.piyasa.widget.model.Fmt
import com.piyasa.widget.model.Formula
import com.piyasa.widget.model.FormulaEngine
import com.piyasa.widget.model.Instrument
import com.piyasa.widget.model.Migrations
import com.piyasa.widget.model.Quote
import com.piyasa.widget.model.Source
import com.piyasa.widget.model.WidgetConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Varsayılan liste: derli toplu, doğru formüller, doğru adlar. */
class DefaultsTest {

    // 10 Kasım 2026 piyasa değerlerine yakın örnek fiyatlar (önceki kapanışlarla)
    private val q = mapOf(
        "USDTRY" to (50.2302 to 50.141), "EURTRY" to (56.075 to 56.33), "EURUSD" to (1.1164 to 1.1225), "DXY" to (102.25 to 101.67),
        "ONS" to (4028.82 to 4140.68), "GUMUS" to (51.294 to 53.41), "BRENT" to (91.44 to 92.18),
        "XU100" to (11661.86 to 11712.2), "XU030" to (14607.56 to 14610.4), "ALTIN" to (71.34 to 72.32),
        "SPX" to (7492.83 to 7550.2), "NASDAQ" to (24921.85 to 25250.8), "DOW" to (52106.41 to 52390.1), "US10Y" to (4.998 to 4.884),
        "BTC" to (73377.0 to 75270.0), "TR_ENF" to (29.77 to 29.73), "TR_FAIZ" to (36.0 to 37.0),
    )
    private val state = AppState().let { s ->
        s.copy(quotes = q.mapValues { (_, v) -> Quote(v.first, v.second, 0) })
    }

    @Test fun everyDefaultFormulaEvaluates() {
        val engine = FormulaEngine(state)
        for (f in Catalog.defaultFormulas) {
            val r = engine.evaluateKey(f.key)
            assertNull("${f.name}: ${r.error}", r.error)
            assertTrue("${f.name} değersiz", r.value != null && r.value!!.isFinite())
            assertTrue("${f.name} günlük değişim yok", r.change != null)
        }
    }

    @Test fun defaultFormulasOnlyUseDefaultItems() {
        val known = state.allKeys.toSet() + Formulas.constants.keys
        for (f in Catalog.defaultFormulas) {
            val vars = Formulas.variables(Parser.parse(f.expression))
            assertTrue("${f.name}: ${vars - known}", known.containsAll(vars))
        }
        assertTrue(state.allKeys.containsAll(WidgetConfig.DEFAULT_WIDGET_KEYS))
    }

    @Test fun certificatePremiumUsesHundredthOfAGram() {
        // 1 sertifika = 0,01 gr → 71,34 ₺ × 100 = 7.134 ₺/gr; gram altın ≈ 6.506 ₺ → prim ≈ +%9,6
        val gram = 4028.82 * 50.2302 / Formulas.TROY_OUNCE_GRAMS
        val prim = FormulaEngine(state).evaluateKey("SERTIFIKA_PRIM").value!!
        assertEquals((71.34 * 100 / gram - 1) * 100, prim, 1e-9)
        assertTrue(prim in 5.0..15.0)
    }

    @Test fun realRateIsPolicyRateMinusInflation() {
        val item = Display.build(state, listOf("REEL_FAIZ")).single()
        assertEquals(36.0 - 29.77, item.value!!, 1e-9)
        assertEquals("%6,23", item.valueText)
        // Oranlarda değişim puan farkıdır: (36 − 29,77) − (37 − 29,73) = −1,04 puan
        assertEquals("−1,04 p", item.changeText)
        assertEquals(-1, item.direction)
    }

    @Test fun ratesShowPointChangeAndTurkishPercent() {
        val enf = Display.build(state, listOf("TR_ENF")).single()
        assertEquals("%29,77", enf.valueText)
        assertEquals("+0,04 p", enf.changeText)
        val y = Display.build(state, listOf("US10Y")).single()
        assertEquals("%5,00", y.valueText)
        assertEquals("+0,11 p", y.changeText)
        // Fiyatlarda yüzde değişim
        val usd = Display.build(state, listOf("USDTRY")).single()
        assertEquals("+%0,18", usd.changeText)
        assertEquals("−%2,50", Fmt.value(-2.5, 2, suffix = "%"))
    }

    @Test fun subtitlesAreConsistent() {
        val items = Display.build(state, state.instruments.map { it.key })
        for (i in items) assertTrue("${i.title}: ${i.subtitle}", i.subtitle.contains(':'))
        assertEquals("OANDA:XAUUSD · Spot", items.first { it.key == "ONS" }.subtitle)
        assertEquals("BIST:ALTIN · ALTIN.S1 · 0,01 gr", items.first { it.key == "ALTIN" }.subtitle)
    }

    @Test fun defaultsAreGroupedSensibly() {
        // Uygulamadaki grup sırası: Döviz, Emtia, Türkiye, Amerika, Kripto, Ekonomi
        assertEquals(listOf(Category.FX, Category.COMMODITY, Category.TR, Category.US, Category.CRYPTO, Category.ECONOMY),
            state.instruments.map { it.category }.distinct())
        assertEquals(8, Catalog.defaultFormulas.size)
        assertEquals(Catalog.defaultFormulas.size, Catalog.defaultFormulas.map { it.key }.toSet().size)
    }

    @Test fun migrationRefreshesCatalogItemsButKeepsUserItems() {
        val old = AppState(
            schema = 2,
            instruments = listOf(
                Instrument("US10Y", "ABD 10Y Faiz", "TVC:US10Y", Source.TRADINGVIEW, Category.US, 3, suffix = "%"),
                Instrument("GLDTR", "Altın Fonu (GoldIST)", "BIST:GLDTR", Source.TRADINGVIEW, Category.TR, note = "BYF"),
                Instrument("SNDK", "Sandisk", "NASDAQ:SNDK", Source.TRADINGVIEW, Category.US, prefix = "$"),
            ),
            formulas = listOf(
                Formula("ALTIN_GUMUS", "Altın/Gümüş", "ONS / GUMUS", 2),
                Formula("CEYREK", "Çeyrek (has)", "GRAM_ALTIN * 1.6067", 0, suffix = "₺"),
                Formula("BENIM", "Benim formülüm", "ONS * 2"),
                Formula("SEPET", "Sepetim", "USDTRY * 0.6 + EURTRY * 0.4", 4), // kullanıcı değiştirmiş
            ),
        )
        val s = Migrations.apply(old)
        assertEquals(Migrations.CURRENT, s.schema)
        assertEquals("ABD 10 Yıllık Tahvil", s.instrument("US10Y")!!.name)
        assertEquals(2, s.instrument("US10Y")!!.decimals)
        assertEquals("Altın Fonu", s.instrument("GLDTR")!!.name)
        assertEquals("Sandisk", s.instrument("SNDK")!!.name) // kullanıcının
        assertEquals("Altın/Gümüş Rasyosu", s.formula("ALTIN_GUMUS")!!.name)
        assertEquals("Çeyrek Altın (has)", s.formula("CEYREK")!!.name)
        assertEquals("Benim formülüm", s.formula("BENIM")!!.name) // kullanıcının
        assertEquals("USDTRY * 0.6 + EURTRY * 0.4", s.formula("SEPET")!!.expression) // değiştirilmiş: korunur
        assertEquals("Sepetim", s.formula("SEPET")!!.name)
    }

    @Test fun resetKeepsWidgetsAndDropsMissingKeys() {
        val custom = state.copy(
            instruments = state.instruments + Instrument("SNDK", "Sandisk", "NASDAQ:SNDK", Source.TRADINGVIEW, Category.US),
            formulas = listOf(Formula("BENIM", "Benim", "ONS * 2")),
            widgets = mapOf(7 to WidgetConfig(title = "Benim", keys = listOf(WidgetConfig.section("Altın"), "GRAM_ALTIN", "SNDK", "BENIM"), textScale = 1.3f)),
        )
        val r = Migrations.resetToDefaults(custom)
        assertEquals(Catalog.defaultInstruments, r.instruments)
        assertEquals(Catalog.defaultFormulas, r.formulas)
        val w = r.widgets.getValue(7)
        assertEquals("Benim", w.title)
        assertEquals(1.3f, w.textScale)
        assertEquals(listOf(WidgetConfig.section("Altın"), "GRAM_ALTIN"), w.keys)
        assertTrue("fiyatlar korunur", r.quotes.containsKey("USDTRY"))
        assertTrue(!r.quotes.containsKey("SNDK"))
    }
}
