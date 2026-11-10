package com.piyasa.widget.formula

import com.piyasa.widget.model.Catalog
import com.piyasa.widget.model.Fmt
import com.piyasa.widget.model.Formula
import com.piyasa.widget.model.FormulaEngine
import com.piyasa.widget.model.Quote
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FormulaTest {

    private fun eval(src: String, vars: Map<String, Double> = emptyMap()): Double =
        Evaluator { name, _ -> vars[name] ?: throw NoDataException(name) }.evaluate(Parser.parse(src))

    @Test fun arithmeticAndPrecedence() {
        assertEquals(7.0, eval("1 + 2 * 3"), 1e-12)
        assertEquals(9.0, eval("(1 + 2) * 3"), 1e-12)
        assertEquals(-4.0, eval("-2^2"), 1e-12)
        assertEquals(512.0, eval("2^3^2"), 1e-12)
        assertEquals(2.5, eval("10 / 4"), 1e-12)
        assertEquals(1500.0, eval("1.5e3"), 1e-12)
        assertEquals(6.0, eval("--6"), 1e-12)
    }

    @Test fun variablesAreCaseInsensitive() {
        assertEquals(10.0, eval("usdtry * 2", mapOf("USDTRY" to 5.0)), 1e-12)
    }

    @Test fun functions() {
        assertEquals(3.0, eval("max(1, 3, 2)"), 1e-12)
        assertEquals(1.0, eval("min(1; 3; 2)"), 1e-12)
        assertEquals(2.0, eval("avg(1, 3)"), 1e-12)
        assertEquals(3.14, eval("round(PI, 2)"), 1e-12)
        assertEquals(10.0, eval("pct(110, 100)"), 1e-9)
        assertEquals(31.1034768, eval("OZ"), 1e-12)
    }

    @Test fun errors() {
        assertThrows("Sıfıra") { eval("1 / 0") }
        assertThrows("bekleniyordu") { eval("(1 + 2") }
        assertThrows("Bilinmeyen fonksiyon") { eval("foo(1)") }
        assertThrows("Beklenmeyen") { eval("1 + * 2") }
        assertThrows("boş") { eval("  ") }
    }

    @Test fun gramGoldFromOunceAndUsdTry() {
        val q = mapOf(
            "ONS" to Quote(price = 4046.10, prevClose = 4000.0, time = 0),
            "USDTRY" to Quote(price = 50.15, prevClose = 50.0, time = 0),
        )
        val engine = FormulaEngine(Catalog.defaultInstruments, Catalog.defaultFormulas, q)
        val r = engine.evaluateKey("GRAM_ALTIN")
        assertNull(r.error)
        assertEquals(4046.10 * 50.15 / 31.1034768, r.value!!, 1e-9)
        val prev = 4000.0 * 50.0 / 31.1034768
        assertEquals(prev, r.prev!!, 1e-9)
        assertEquals((r.value!! / prev - 1) * 100, r.change!!, 1e-9)

        // formül içinde formül
        val c = engine.evaluateKey("CEYREK")
        assertEquals(r.value!! * 1.6067, c.value!!, 1e-9)
    }

    @Test fun missingPrevCloseKeepsValueButNoChange() {
        val q = mapOf(
            "ONS" to Quote(price = 4000.0, prevClose = null, time = 0),
            "USDTRY" to Quote(price = 50.0, prevClose = 49.0, time = 0),
        )
        val r = FormulaEngine(Catalog.defaultInstruments, Catalog.defaultFormulas, q).evaluateKey("GRAM_ALTIN")
        assertNotNull(r.value)
        assertNull(r.change)
    }

    @Test fun chgAndPrev() {
        val q = mapOf("USDTRY" to Quote(price = 51.0, prevClose = 50.0, time = 0))
        val f = listOf(Formula("D", "D", "chg(USDTRY)"), Formula("P", "P", "prev(USDTRY)"))
        val e = FormulaEngine(Catalog.defaultInstruments, f, q)
        assertEquals(2.0, e.evaluateKey("D").value!!, 1e-9)
        assertEquals(50.0, e.evaluateKey("P").value!!, 1e-12)
    }

    @Test fun cycleIsDetected() {
        val f = listOf(Formula("A", "A", "B + 1"), Formula("B", "B", "A * 2"))
        val r = FormulaEngine(emptyList(), f, emptyMap()).evaluateKey("A")
        assertNull(r.value)
        assertTrue(r.error!!, r.error!!.startsWith("Döngüsel"))
    }

    @Test fun unknownVariable() {
        val r = FormulaEngine(emptyList(), emptyList(), emptyMap()).evaluateExpression("XYZ * 2")
        assertTrue(r.error!!.contains("XYZ"))
    }

    @Test fun keyHelpers() {
        assertEquals("GRAM_ALTIN", Formulas.suggestKey("Gram Altın"))
        assertEquals("CEYREK_ALTIN", Formulas.suggestKey("Çeyrek altın"))
        assertTrue(Formulas.isValidKey("USDTRY"))
        assertTrue(!Formulas.isValidKey("OZ"))
        assertTrue(!Formulas.isValidKey("1ABC"))
    }

    @Test fun turkishFormatting() {
        assertEquals("6.523,10 ₺", Fmt.value(6523.1, 2, suffix = "₺"))
        assertEquals("$4.046,10", Fmt.value(4046.1, 2, prefix = "$"))
        assertEquals("+%1,23", Fmt.change(1.234))
        assertEquals("−%0,45", Fmt.change(-0.45))
        assertEquals("%0,00", Fmt.change(0.001))
    }

    private fun assertThrows(fragment: String, block: () -> Unit) {
        try {
            block()
        } catch (e: FormulaException) {
            assertTrue("'${e.message}' içinde '$fragment' yok", e.message!!.contains(fragment))
            return
        }
        throw AssertionError("FormulaException bekleniyordu ($fragment)")
    }
}
