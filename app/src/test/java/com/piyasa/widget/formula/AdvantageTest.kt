package com.piyasa.widget.formula

import com.piyasa.widget.model.Advices
import com.piyasa.widget.model.BankEntry
import com.piyasa.widget.model.BankQuote
import com.piyasa.widget.model.BanksData
import com.piyasa.widget.model.Costs
import com.piyasa.widget.model.DailySeries
import com.piyasa.widget.model.Metal
import com.piyasa.widget.model.OZ
import com.piyasa.widget.model.Premiums
import com.piyasa.widget.model.RatioData
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant
import kotlin.math.pow

/** Web sürümündeki premium/advice/costs testleriyle aynı örnekler: iki uygulama aynı sonucu vermeli. */
class AdvantageTest {
    private fun ser(closes: List<Double>, start: Int = 20000) = DailySeries(IntArray(closes.size) { start + it }, closes.toDoubleArray())
    private fun pair(code: String) = Premiums.pairs.first { it.code == code }

    @Test fun certificatePremiumAgainstGramGold() {
        val r = Premiums.row(pair("ALTIN.S1"), 71.34, 4057.965, 50.22866)
        assertEquals(4057.965 * 50.22866 / OZ, r.gram!!, 1e-9)
        assertEquals(65.532, r.fair!!, 0.01)
        assertEquals(71.34 / 65.532 - 1, r.premium!!, 1e-3)
        assertEquals(Premiums.Signal.NORMAL, r.signal)
        assertEquals(Premiums.Signal.BUY, Premiums.row(pair("ALTIN.S1"), 65.0, 4057.965, 50.22866).signal)
    }

    @Test fun fundTypicalGramsAndSignals() {
        val metal = ser(List(30) { 50.0 }); val fx = ser(List(30) { OZ }) // gram = 50 ₺
        val fund = ser(List(29) { 300.0 } + 900.0) // 6 gr; uç değer ortancayı bozmaz
        val g = Premiums.typicalGrams(fund, metal, fx)!!
        assertEquals(6.0, g, 1e-9)
        assertEquals(Premiums.Signal.NORMAL, Premiums.row(pair("GMSTR.F"), 300.0, 50.0, OZ, g).signal)
        assertEquals(Premiums.Signal.BUY, Premiums.row(pair("GMSTR.F"), 293.0, 50.0, OZ, g).signal)
        assertEquals(Premiums.Signal.HIGH, Premiums.row(pair("GMSTR.F"), 307.0, 50.0, OZ, g).signal)
        assertEquals(Premiums.Signal.UNKNOWN, Premiums.row(pair("GMSTR.F"), 300.0, 50.0, OZ, null).signal)
        assertNull(Premiums.typicalGrams(ser(listOf(300.0, 300.0)), metal, fx))
    }

    @Test fun bistSession() {
        assertTrue(Premiums.bistOpen(Instant.parse("2026-11-11T08:00:00Z"))) // Çarşamba 11:00
        assertFalse(Premiums.bistOpen(Instant.parse("2026-11-11T06:30:00Z")))
        assertFalse(Premiums.bistOpen(Instant.parse("2026-11-11T16:00:00Z")))
        assertFalse(Premiums.bistOpen(Instant.parse("2026-11-14T09:00:00Z"))) // Cumartesi
    }

    @Test fun hpiCarriedForward() {
        val hpi = listOf(100 to 100.0, 101 to 110.0, 102 to 121.0, 103 to 133.1)
        val h = Advices.hpiNow(hpi, 105)!!
        assertEquals(133.1 * 1.21, h.value, 1e-6); assertEquals(103, h.month); assertEquals(2, h.gap)
        assertEquals(4, Advices.hpiNow(hpi, 120)!!.gap)
    }

    @Test fun advicesFollowMedian() {
        fun months(f: (Int) -> Double) = List(100) { (24000 + it) to f(it) }
        val gold = months { (1000 + 10.0 * it) * OZ / (20 - 0.1 * it) }
        val d = RatioData(0, months { 100.0 }, gold, months { i -> gold[i].second / (60 + 0.3 * i) }, months { 20 - 0.1 * it })
        val now = Instant.parse("2008-04-15T00:00:00Z") // 24099. ay
        assertEquals(24099, Advices.monthOf(now))
        val (hg, hu, gs) = Advices.all(d, now = now)
        assertEquals("Altın boz, ev al", hg.action); assertTrue(hg.strong)
        assertEquals(100.0 / 1990, hg.value, 1e-6); assertEquals(0.0, hg.percentile, 0.0)
        assertEquals("Dolar biriktir", hu.action); assertTrue(hu.strong)
        assertEquals("Altın sat, gümüş al", gs.action); assertEquals(89.7, gs.value, 0.05)
        assertEquals("Gümüş sat, altın al", Advices.all(d, silver = gold[99].second / 62, now = now)[2].action)
    }

    @Test fun moneySupplyValuation() {
        fun months(n: Int = 100, f: (Int) -> Double) = List(n) { (24000 + it) to f(it) }
        fun g(r: Double) = { i: Int -> 100 * (1 + r).pow(i) }
        // TR M2 ayda %2, ABD M2 sabit; Dolar/TL ayda %3 (arzdan hızlı), BIST sabit (arzdan yavaş); para arzı 2 ay gecikmeli
        val d = RatioData(0, months(f = g(0.02)), months { 2000.0 }, months { 25.0 }, months(f = g(0.03)),
            usM2 = months(98) { 1000.0 }, trM2 = months(98, g(0.02)), xu100 = months { 5000.0 })
        val now = Instant.parse("2008-04-15T00:00:00Z")
        val a = Advices.money(d, now = now).associateBy { it.id }
        assertEquals("Dolar/TL pahalı", a.getValue(Advices.Id.M2_USDTRY).action); assertTrue(a.getValue(Advices.Id.M2_USDTRY).strong)
        assertEquals(100 * 1.03.pow(99) / (100 * 1.02.pow(97) / 1000), a.getValue(Advices.Id.M2_USDTRY).value, 1e-6)
        assertEquals(24097, a.getValue(Advices.Id.M2_USDTRY).m2Month)
        assertEquals("BIST 100 ucuz", a.getValue(Advices.Id.M2_BIST).action)
        assertEquals("Gram altın pahalı", a.getValue(Advices.Id.M2_GOLD_TRY).action)
        assertEquals(0.0, a.getValue(Advices.Id.M2_GOLD_USD).vsMedian, 1e-9)
        assertTrue(kotlin.math.abs(a.getValue(Advices.Id.M2_HOME).vsMedian) < 0.1)
        assertEquals("BIST 100 pahalı", Advices.money(d, xu100 = 500_000.0, now = now).first { it.id == Advices.Id.M2_BIST }.action)
        assertTrue(Advices.money(RatioData(0, d.hpi, d.gold, d.silver, d.usdTry), now = now).isEmpty()) // eski veri dosyası
        assertEquals(listOf(5.0, 6.0, 6.0, null, null), listOf(10, 11, 14, 15, 9).map(Advices.carried(listOf(10 to 5.0, 11 to 6.0))))
    }

    private val s = Costs.Scenario(100_000.0, 1.0, 0.3, 0.001)

    @Test fun bankSpreadAndBsmv() {
        val r = Costs.evaluate(Costs.bank("b", "Banka", BankQuote(98.0, 102.0)), s)
        val net = 100_000 / 1.02 / 1.002 * 1.3 * 0.98
        assertEquals(net, r.net, 1e-6); assertEquals(130_000.0, r.ideal, 1e-9)
        assertEquals(0.0, r.gainTax, 0.0); assertEquals(0.0, r.commission, 0.0)
        assertEquals(130_000 - net, r.spread + r.buyTax, 1e-6)
    }

    @Test fun physicalOnlySpread() {
        val r = Costs.evaluate(Costs.physical("p", "Fiziki", BankQuote(98.0, 102.0)), s)
        assertEquals(100_000 / 1.02 * 1.3 * 0.98, r.net, 1e-6); assertEquals(0.0, r.buyTax, 0.0)
    }

    @Test fun fundCommissionFeeAndWithholding() {
        val r = Costs.evaluate(Costs.fund("f", "Fon"), s)
        val c = 0.001 * 1.05
        val gross = 100_000 / 1.001 / (1 + c) * 1.3 * (1 - 0.0047) * 0.999 * (1 - c)
        assertEquals(0.175 * (gross - 100_000), r.gainTax, 1e-6)
        assertEquals(gross - 0.175 * (gross - 100_000), r.net, 1e-6)
        assertEquals(r.cost, r.spread + r.buyTax + r.commission + r.fee + r.gainTax, 1e-6)
        assertEquals(0.0, Costs.evaluate(Costs.fund("f", "Fon"), s.copy(annualGrowth = -0.1)).gainTax, 0.0)
        assertEquals(0.0, Costs.evaluate(Costs.cert("c", "Sertifika"), s).gainTax, 0.0)
    }

    @Test fun breakEvenFundBelowBankAbove() {
        val bank = Costs.bank("b", "Banka", BankQuote(98.7, 101.3)); val fund = Costs.fund("f", "Fon")
        val g = Costs.breakEven(fund, bank, s)!!
        assertTrue(g > 0.05 && g < 0.3)
        assertTrue(Costs.evaluate(fund, s.copy(annualGrowth = g - 0.02)).net > Costs.evaluate(bank, s.copy(annualGrowth = g - 0.02)).net)
        assertTrue(Costs.evaluate(fund, s.copy(annualGrowth = g + 0.02)).net < Costs.evaluate(bank, s.copy(annualGrowth = g + 0.02)).net)
    }

    @Test fun routesPerMetal() {
        val data = BanksData(0, listOf(BankEntry("z", "Ziraat", BankQuote(6486.0, 6617.0), BankQuote(84.7, 87.0))),
            listOf(BankEntry("fg", "Fiziki gram altın (Altınkaynak)", BankQuote(6500.0, 6619.0), BankQuote(79.8, 92.9)), BankEntry("fk", "Fiziki külçe altın (Altınkaynak)", BankQuote(6494.0, 6550.0))))
        val gold = Costs.routes(Metal.GOLD, data).map { it.name }
        assertEquals(listOf("Ziraat", "Fiziki gram altın (Altınkaynak)", "Fiziki külçe altın (Altınkaynak)", "Altın fonu (GLDTR, ZGOLD, ISGLK)", "Altın sertifikası (ALTIN.S1)"), gold)
        val silver = Costs.routes(Metal.SILVER, data)
        assertEquals(listOf("Ziraat", "Fiziki gümüş (Altınkaynak)", "Gümüş fonu (GMSTR)"), silver.map { it.name })
        assertEquals(0.0, silver[1].buyTax, 0.0) // fiziki: BSMV yok
        assertEquals("Banka (tipik makas)", Costs.routes(Metal.GOLD, null).first().name)
        assertEquals("Kendi bankam", Costs.routes(Metal.GOLD, data, BankQuote(6500.0, 6540.0)).first().name)
    }
}
