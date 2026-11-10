package com.piyasa.widget.formula

import com.piyasa.widget.data.source.ScreenerSource
import com.piyasa.widget.data.source.YahooSource
import com.piyasa.widget.model.Condition
import com.piyasa.widget.model.Field
import com.piyasa.widget.model.Op
import com.piyasa.widget.model.Screen
import com.piyasa.widget.model.ScreenCurrency
import com.piyasa.widget.model.ScreenEngine
import com.piyasa.widget.model.ScreenEngine.Bar
import com.piyasa.widget.model.ScreenEngine.HistoryStats
import com.piyasa.widget.model.ScreenEngine.Row
import com.piyasa.widget.model.ScreenSort
import com.piyasa.widget.model.Universe
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneOffset

class ScreenEngineTest {

    private fun row(sym: String, currency: String, vararg v: Pair<Field, Double?>) =
        Row(sym, sym.substringAfter(':'), currency, 100.0, mapOf(*v))

    private fun t(y: Int, m: Int) = LocalDate.of(y, m, 1).atStartOfDay().toEpochSecond(ZoneOffset.UTC)

    @Test fun historyStatsConvertsEachMonthWithThatMonthsRate() {
        // ₺ fiyat aynı kalırken kur ikiye katlanırsa USD fiyatı yarıya iner
        val bars = listOf(Bar(t(2022, 1), 10.0, 12.0, 11.0), Bar(t(2024, 1), 10.0, 12.0, 11.0), Bar(t(2026, 1), 20.0, 24.0, 22.0))
        val fx = listOf(Bar(t(2022, 1), null, null, 10.0), Bar(t(2024, 1), null, null, 20.0), Bar(t(2026, 1), null, null, 40.0))
        val local = ScreenEngine.historyStats(bars)
        assertEquals(10.0, local.low!!, 1e-12)
        assertEquals(24.0, local.high!!, 1e-12)
        val usd = ScreenEngine.historyStats(bars, fx)
        assertEquals(0.5, usd.low!!, 1e-12)   // 10 ₺ / 20 (2024) ya da 20 ₺ / 40 (2026)
        assertEquals(1.2, usd.high!!, 1e-12)  // 12 ₺ / 10 (2022)
    }

    @Test fun nearFiveYearLowInUsd() {
        val screen = Screen("s", "x", Universe.BIST, currency = ScreenCurrency.USD,
            conditions = listOf(Condition(Field.PRICE, Op.LTE, Field.LOW_5Y, 10.0)))
        val usdTry = 50.0
        val rows = listOf(
            row("BIST:AAA", "TRY", Field.PRICE to 26.0),   // 0,52 $ ; 5Y dip 0,50 $ → %4 üstünde ✓
            row("BIST:BBB", "TRY", Field.PRICE to 40.0),   // 0,80 $ ; dip 0,50 → %60 üstünde ✗
            row("BIST:CCC", "TRY", Field.PRICE to 50.0),   // 1,00 $ ; dip 0,95 → %5 üstünde ✓
            row("BIST:DDD", "TRY", Field.PRICE to 10.0),   // geçmişi yok ✗
        )
        val history = mapOf("BIST:AAA" to HistoryStats(0.50, 2.0), "BIST:BBB" to HistoryStats(0.50, 2.0), "BIST:CCC" to HistoryStats(0.95, 3.0))
        val r = ScreenEngine.evaluate(rows, screen, usdTry, history)
        assertEquals(listOf("BIST:AAA", "BIST:CCC"), r.rows.map { it.symbol }) // dibe en yakın önce (%4, %5)
        assertEquals(0.52, r.rows.first().price!!, 1e-12)
        assertEquals("USD", r.rows.first().currency)
    }

    @Test fun belowOrWithinFivePercentAboveSma200() {
        val screen = Screen("s", "x", Universe.MY_LIST, conditions = listOf(Condition(Field.PRICE, Op.LT, Field.SMA200, 5.0)))
        val rows = listOf(
            row("NASDAQ:A", "USD", Field.PRICE to 90.0, Field.SMA200 to 100.0),  // altında ✓
            row("NASDAQ:B", "USD", Field.PRICE to 104.0, Field.SMA200 to 100.0), // %4 üstünde ✓
            row("NASDAQ:C", "USD", Field.PRICE to 106.0, Field.SMA200 to 100.0), // %6 üstünde ✗
            row("NASDAQ:D", "USD", Field.PRICE to 100.5, Field.SMA200 to null),  // SMA yok ✗
        )
        val r = ScreenEngine.evaluate(rows, screen, null, emptyMap())
        assertEquals(listOf("NASDAQ:B", "NASDAQ:A"), r.rows.map { it.symbol }) // ortalamaya yakınlık: %4, %10
    }

    @Test fun numericConditionsSortExtremeFirstAndMatchAny() {
        val rsi = Screen("s", "x", Universe.BIST, conditions = listOf(Condition(Field.RSI, Op.LT, null, 30.0)))
        val rows = listOf(row("BIST:A", "TRY", Field.RSI to 25.0), row("BIST:B", "TRY", Field.RSI to 12.0), row("BIST:C", "TRY", Field.RSI to 45.0))
        assertEquals(listOf("BIST:B", "BIST:A"), ScreenEngine.evaluate(rows, rsi, null, emptyMap()).rows.map { it.symbol })
        val any = rsi.copy(conditions = rsi.conditions + Condition(Field.RSI, Op.GT, null, 40.0), matchAll = false, sort = ScreenSort.NAME)
        assertEquals(listOf("A", "B", "C"), ScreenEngine.evaluate(rows, any, null, emptyMap()).rows.map { it.name })
    }

    @Test fun usdModeConvertsPriceFieldsButKeepsRatios() {
        val screen = Screen("s", "x", Universe.BIST, currency = ScreenCurrency.USD,
            conditions = listOf(Condition(Field.PRICE, Op.GT, Field.SMA200, 0.0), Condition(Field.PRICE, Op.LT, null, 1.0)))
        val rows = listOf(
            row("BIST:A", "TRY", Field.PRICE to 40.0, Field.SMA200 to 30.0),  // 0,80 $ > ort., < 1 $ ✓
            row("BIST:B", "TRY", Field.PRICE to 60.0, Field.SMA200 to 30.0),  // 1,20 $ ✗ (1 $ üstü)
        )
        val r = ScreenEngine.evaluate(rows, screen, 50.0, emptyMap())
        assertEquals(listOf("BIST:A"), r.rows.map { it.symbol })
        assertEquals(0.8, r.rows.single().price!!, 1e-12)
        assertNull("kur yoksa USD fiyatı yok", ScreenEngine.valueOf(rows[0], Field.PRICE, screen, null, emptyMap()))
    }

    @Test fun preFilterSkipsHistoryConditions() {
        val screen = Screen("s", "x", Universe.BIST, conditions = listOf(
            Condition(Field.PRICE, Op.LTE, Field.LOW_5Y, 10.0), Condition(Field.MCAP, Op.GT, null, 1e9)))
        assertTrue(ScreenEngine.preFilter(row("BIST:A", "TRY", Field.PRICE to 1.0, Field.MCAP to 2e9), screen, null))
        assertTrue(!ScreenEngine.preFilter(row("BIST:B", "TRY", Field.PRICE to 1.0, Field.MCAP to 5e8), screen, null))
    }

    @Test fun serverSideFiltersOnlyWhatTradingViewCanDo() {
        val s = Screen("s", "x", Universe.BIST, currency = ScreenCurrency.USD, conditions = listOf(
            Condition(Field.RSI, Op.LT, null, 30.0),            // ✓ sayı
            Condition(Field.PRICE, Op.GT, Field.SMA200, 0.0),   // ✓ alan–alan, ofsetsiz
            Condition(Field.PRICE, Op.LT, Field.SMA200, 5.0),   // ✗ ofsetli
            Condition(Field.PRICE, Op.LT, null, 1.0),           // ✗ USD fiyat (çevrilmeli)
            Condition(Field.PRICE, Op.LTE, Field.LOW_5Y, 10.0), // ✗ geçmiş
        ))
        val f = ScreenerSource.serverFilters(s).map { it.toString() }
        assertEquals(2, f.size)
        assertTrue(f[0].contains("\"RSI\"") && f[0].contains("less"))
        assertTrue(f[1].contains("\"SMA200\"") && f[1].contains("greater"))
        assertEquals(0, ScreenerSource.serverFilters(s.copy(matchAll = false)).size)
    }

    @Test fun yahooHistoryParsingAndSymbolMapping() {
        val json = """{"chart":{"result":[{"meta":{"currency":"TRY"},"timestamp":[1640995200,1643673600],
            "indicators":{"quote":[{"low":[10.5,null],"high":[12.0,13.0],"close":[11.0,12.5]}]}}],"error":null}}"""
        val bars = YahooSource.parseHistory(json)
        assertEquals(2, bars.size)
        assertEquals(10.5, bars[0].low!!, 1e-12)
        assertNull(bars[1].low)
        assertEquals(10.5, ScreenEngine.historyStats(bars).low!!, 1e-12)
        assertEquals("THYAO.IS", YahooSource.fromTradingView("BIST:THYAO"))
        assertEquals("BRK-B", YahooSource.fromTradingView("NYSE:BRK.B"))
        assertEquals("USDTRY=X", YahooSource.fromTradingView("FX:USDTRY"))
        assertNull(YahooSource.fromTradingView("ECONOMICS:TRHPI"))
    }

    @Test fun describesConditionsInPlainTurkish() {
        assertEquals("Fiyat ≤ 5 yıl en düşük +%10", ScreenEngine.describe(Condition(Field.PRICE, Op.LTE, Field.LOW_5Y, 10.0)))
        assertEquals("Fiyat < 200 günlük ortalama +%5", ScreenEngine.describe(Condition(Field.PRICE, Op.LT, Field.SMA200, 5.0)))
        assertEquals("Fiyat ≥ Tüm zamanların en yükseği −%3", ScreenEngine.describe(Condition(Field.PRICE, Op.GTE, Field.ATH, -3.0)))
        assertEquals("RSI (14) < 30", ScreenEngine.describe(Condition(Field.RSI, Op.LT, null, 30.0)))
    }
}
