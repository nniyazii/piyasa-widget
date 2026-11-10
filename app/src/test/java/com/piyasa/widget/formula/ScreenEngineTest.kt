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
        assertEquals("Piyasa değeri > 5 mlr", ScreenEngine.describe(Condition(Field.MCAP, Op.GT, null, 5e9)))
        assertEquals("Piyasa değeri > 1,2 trn", ScreenEngine.describe(Condition(Field.MCAP, Op.GT, null, 1.2e12)))
    }

    private fun dec(y: Int) = LocalDate.of(y, 12, 1).atStartOfDay().toEpochSecond(ZoneOffset.UTC)

    @Test fun fiveYearAveragePeUsesFiscalYearEndPrices() {
        // Aralık kapanışları: 2025=100, 2024=50, 2023=30, 2022=40, 2021=20 (aradaki aylar önemsiz)
        val bars = listOf(2021 to 20.0, 2022 to 40.0, 2023 to 30.0, 2024 to 50.0, 2025 to 100.0)
            .flatMap { (y, c) -> listOf(Bar(t(y, 6), null, null, 999.0), Bar(dec(y), null, null, c)) }
        val fyEnd = LocalDate.of(2025, 12, 31).atStartOfDay().toEpochSecond(ZoneOffset.UTC)
        // EPS en yeni önce: 2025=10, 2024=5, 2023=zarar, 2022=4, 2021=0,01 (F/K 2000 → anlamsız, atlanır)
        val eps = listOf(10.0, 5.0, -1.0, 4.0, 0.01, 3.0)
        assertEquals(10.0, ScreenEngine.peAverage(bars, eps, fyEnd)!!, 1e-12) // (10 + 10 + 10) / 3
        // 3 geçerli yıl yoksa hesaplanmaz
        assertNull(ScreenEngine.peAverage(bars, listOf(10.0, -5.0, -1.0, 4.0, -2.0), fyEnd))
        assertNull(ScreenEngine.peAverage(bars, eps, null))
        // Mali yıl Eylül'de bitiyorsa Eylül kapanışları kullanılır
        val sep = LocalDate.of(2025, 9, 30).atStartOfDay().toEpochSecond(ZoneOffset.UTC)
        val sepBars = (2021..2025).map { y -> Bar(LocalDate.of(y, 9, 1).atStartOfDay().toEpochSecond(ZoneOffset.UTC), null, null, 20.0) }
        assertEquals(4.0, ScreenEngine.peAverage(sepBars, listOf(5.0, 5.0, 5.0, 5.0, 5.0), sep)!!, 1e-12)
    }

    @Test fun derivedFundamentals() {
        val d = ScreenEngine.derived(close = 120.0, epsFy = listOf(12.0, 10.0, 9.0, 8.0, 7.0, 6.0), revenueFy = listOf(150.0, 100.0), epsForecast = 15.0)
        assertEquals(20.0, d[Field.EPS_GROWTH_1Y]!!, 1e-9)
        assertEquals((Math.pow(2.0, 0.2) - 1) * 100, d[Field.EPS_CAGR_5Y]!!, 1e-9) // 6 → 12 beş yılda: yılda ≈ %14,9
        assertEquals(50.0, d[Field.REV_GROWTH_1Y]!!, 1e-9)
        assertEquals(8.0, d[Field.FWD_PE]!!, 1e-9)
        // Taban yıl zararlıysa büyüme anlamsız; tahmin zarar ise beklenen F/K yok
        val loss = ScreenEngine.derived(10.0, listOf(1.0, -2.0, 1.0, 1.0, 1.0, -1.0), emptyList(), -0.5)
        assertNull(loss[Field.EPS_GROWTH_1Y]); assertNull(loss[Field.EPS_CAGR_5Y]); assertNull(loss[Field.REV_GROWTH_1Y]); assertNull(loss[Field.FWD_PE])
        // Kâr düşüşü negatif büyüme olarak görünür
        assertEquals(-50.0, ScreenEngine.derived(null, listOf(5.0, 10.0), emptyList(), null)[Field.EPS_GROWTH_1Y]!!, 1e-9)
    }

    @Test fun peBelowHalfOfFiveYearAverageDeepestFirst() {
        val screen = com.piyasa.widget.model.ScreenTemplates.all.first { it.id == "d_my_pe_half" }
        val rows = listOf(
            row("BIST:A", "TRY", Field.PRICE to 10.0, Field.PE to 4.0),    // ort. 10 → %60 altında ✓
            row("BIST:B", "TRY", Field.PRICE to 10.0, Field.PE to 6.0),    // ort. 10 → %40 altında ✗
            row("NASDAQ:C", "USD", Field.PRICE to 10.0, Field.PE to 9.0),  // ort. 30 → %70 altında ✓
            row("NASDAQ:D", "USD", Field.PRICE to 10.0, Field.PE to -3.0), // zararda ✗
            row("NASDAQ:E", "USD", Field.PRICE to 10.0, Field.PE to 2.0),  // ortalama yok ✗
        )
        val h = mapOf("BIST:A" to HistoryStats(null, null, 10.0), "BIST:B" to HistoryStats(null, null, 10.0),
            "NASDAQ:C" to HistoryStats(null, null, 30.0), "NASDAQ:D" to HistoryStats(null, null, 10.0))
        val r = ScreenEngine.evaluate(rows, screen, null, h)
        assertEquals(listOf("NASDAQ:C", "BIST:A"), r.rows.map { it.symbol }) // en derin iskonto önce (0,30; 0,40)
        assertEquals(0.3, r.rows.first().score!!, 1e-12)
        // Ön elemede ortalama F/K (geçmiş) atlanır, F/K > 0 uygulanır
        assertTrue(ScreenEngine.preFilter(rows[1], screen, null))
        assertTrue(!ScreenEngine.preFilter(rows[3], screen, null))
        assertEquals("F/K ≤ 5 yıllık ortalama F/K −%50", ScreenEngine.describe(screen.conditions.first()))
    }

    @Test fun parsesFundamentalArraysFromTradingView() {
        val screen = Screen("s", "x", Universe.MY_LIST, conditions = listOf(Condition(Field.FWD_PE, Op.LT, Field.PE, 0.0), Condition(Field.EPS_GROWTH_1Y, Op.GT, null, 0.0)))
        val fields = listOf(Field.PE, Field.PRICE, Field.FWD_PE, Field.EPS_GROWTH_1Y)
        val columns = listOf("name", "description", "currency", "pricescale", "type", "price_earnings_ttm", "close",
            "earnings_per_share_diluted_fy_h", "total_revenue_fy_h", "earnings_per_share_forecast_next_fy", "fiscal_period_end_fy", "fundamental_currency_code")
        fun parse(json: String) = ScreenerSource.parseRow(com.piyasa.widget.data.AppJson.parseToJsonElement(json) as kotlinx.serialization.json.JsonObject,
            screen, com.piyasa.widget.model.AppState(instruments = emptyList()), fields, columns)!!
        val r = parse("""{"s":"BIST:THYAO","d":["THYAO","Turk Hava Yollari","TRY",100,"stock",3.85,313.75,[85.66,82.16,118.12,34.37,5.95,-4.05],[955.5,745.4],53.59,1767139200,"TRY"]}""")
        assertEquals(listOf(85.66, 82.16, 118.12, 34.37, 5.95, -4.05), r.epsFy)
        assertEquals(1767139200L, r.fyEnd)
        assertEquals(313.75 / 53.59, r.values[Field.FWD_PE]!!, 1e-9)
        assertEquals((85.66 / 82.16 - 1) * 100, r.values[Field.EPS_GROWTH_1Y]!!, 1e-9)
        // Tahmin başka para biriminde raporlanmışsa beklenen F/K hesaplanmaz
        val usd = parse("""{"s":"BIST:THYAO","d":["THYAO","x","TRY",100,"stock",3.85,313.75,[85.66,82.16],null,1.22,1767139200,"USD"]}""")
        assertNull(usd.values[Field.FWD_PE])
        assertEquals(emptyList<Double?>(), parse("""{"s":"BIST:X","d":["X","x","TRY",100,"stock",3.0,10.0,null,null,null,null,null]}""").epsFy)
    }

    @Test fun defaultScreensAreSane() {
        val d = com.piyasa.widget.model.ScreenTemplates.defaults
        assertEquals(15, d.size)
        assertTrue(com.piyasa.widget.model.ScreenTemplates.addedInV5.all { id -> d.any { it.id == id } })
        assertEquals(d.size, d.map { it.id }.toSet().size)
        assertTrue(d.all { it.conditions.isNotEmpty() && it.name.isNotBlank() })
        // Tüm BIST / ABD taramalarında (kullanıcının 5Y örneği hariç) küçük şirketler elenir
        d.filter { it.universe != Universe.MY_LIST && it.id != "d_bist_5y_usd" }
            .forEach { s -> assertTrue("${s.name}: büyüklük eşiği yok", s.conditions.any { it.left == Field.MCAP && it.op == Op.GT }) }
        // Kullanıcının örnekleri birebir
        val five = d.first { it.id == "d_bist_5y_usd" }
        assertEquals(Universe.BIST, five.universe); assertEquals(ScreenCurrency.USD, five.currency)
        assertEquals(Condition(Field.PRICE, Op.LTE, Field.LOW_5Y, 10.0), five.conditions.single())
        val sma = d.first { it.id == "d_my_us_sma200" }
        assertEquals(Universe.MY_LIST, sma.universe); assertEquals(com.piyasa.widget.model.Category.US, sma.category)
        assertEquals(Condition(Field.PRICE, Op.LT, Field.SMA200, 5.0), sma.conditions.single())
        val pe = d.first { it.id == "d_my_pe_half" }
        assertEquals(Universe.MY_LIST, pe.universe); assertTrue(pe.onlyStocks)
        assertEquals(Condition(Field.PE, Op.LTE, Field.PE_5Y_AVG, -50.0), pe.conditions.first())
        // Ortalama F/K ile karşılaştıran her listede zararlı şirketler (F/K ≤ 0) elenir
        d.filter { s -> s.conditions.any { Field.PE_5Y_AVG in it.fields } }
            .forEach { s -> assertTrue(s.name, s.conditions.contains(Condition(Field.PE, Op.GT, null, 0.0))) }
    }
}
