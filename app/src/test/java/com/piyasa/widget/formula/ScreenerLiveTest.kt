package com.piyasa.widget.formula

import com.piyasa.widget.data.source.ScreenerSource
import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.Catalog
import com.piyasa.widget.model.Category
import com.piyasa.widget.model.Condition
import com.piyasa.widget.model.Field
import com.piyasa.widget.model.Op
import com.piyasa.widget.model.Screen
import com.piyasa.widget.model.ScreenCurrency
import com.piyasa.widget.model.ScreenEngine
import com.piyasa.widget.model.ScreenTemplates
import com.piyasa.widget.model.Universe
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

/** Gerçek TradingView taramasına karşı (varsayılan çalıştırmada atlanır): ./gradlew testDebugUnitTest -Plive=true */
class ScreenerLiveTest {
    private val live = System.getProperty("live") == "true"

    private fun print(name: String, r: com.piyasa.widget.model.ScreenResult) {
        println("[$name] taranan=${r.scanned} eşleşen=${r.rows.size} hata=${r.error} not=${r.note}")
        r.rows.take(8).forEach { println("   ${it.symbol.padEnd(18)} ${it.name.take(28).padEnd(28)} ${it.price} ${it.currency} skor=${it.score}") }
    }

    /** Uygulamaya hazır gelen tüm dinamik listeler, varsayılan izleme listesiyle bugün ne veriyor. */
    @Test fun everyDefaultScreenRunsAndFindsSomething() = runBlocking {
        assumeTrue(live)
        val state = AppState()
        val empty = mutableListOf<String>()
        for (s in ScreenTemplates.defaults) {
            val r = ScreenerSource.run(s, state)
            print(s.name, r)
            assertNull("${s.name}: ${r.error}", r.error)
            // "Listem" taramaları kullanıcının listesine bağlı; varsayılan listede boş çıkabilir
            if (r.rows.isEmpty() && s.universe != Universe.MY_LIST) empty += s.name
        }
        println("Boş çıkanlar: $empty")
        assertTrue("En fazla bir varsayılan liste boş olabilir: $empty", empty.size <= 1)
    }

    /** 5 yıllık ortalama F/K: bilinen hisselerde makul değerler ve kullanıcının listesi örneği. */
    @Test fun fiveYearAveragePe() = runBlocking {
        assumeTrue(live)
        val symbols = listOf("BIST:THYAO", "BIST:ASELS", "BIST:FROTO", "BIST:BIMAS", "BIST:TUPRS", "NASDAQ:AAPL", "NASDAQ:MSFT", "NYSE:UNH", "NASDAQ:NVDA", "NASDAQ:PYPL", "NYSE:NKE")
        val extra = symbols.map { com.piyasa.widget.model.Instrument(key = it, name = it.substringAfter(':'), symbol = it, source = com.piyasa.widget.model.Source.TRADINGVIEW, category = Category.TR) }
        val state = AppState().let { it.copy(instruments = it.instruments + extra) }
        // Herkesi gösteren bir tarama: F/K > 0 ve F/K ≤ ortalama × 100 (her zaman doğru), sıralama en ucuz önce
        val probe = Screen("p", "probe", Universe.MY_LIST, conditions = listOf(Condition(Field.PE, Op.LTE, Field.PE_5Y_AVG, 10000.0), Condition(Field.PE, Op.GT, null, 0.0)), sort = com.piyasa.widget.model.ScreenSort.EXTREME, onlyStocks = true)
        val r = ScreenerSource.run(probe, state)
        print("F/K ÷ 5Y ort. F/K", r)
        r.rows.forEach { println("   ${it.symbol.padEnd(14)} F/K / ortalama = ${"%.2f".format(it.score)}") }
        assertNull(r.error)
        assertTrue("çoğu hissede ortalama F/K hesaplanmalı: ${r.rows.size}", r.rows.size >= 7)
        r.rows.forEach { assertTrue("${it.symbol} oran makul: ${it.score}", it.score!! in 0.05..20.0) }
        val half = ScreenerSource.run(ScreenTemplates.all.first { it.id == "d_my_pe_half" }, state)
        print("listem · F/K ≤ 5Y ort. −%50", half)
        assertNull(half.error)
        half.rows.forEach { assertTrue(it.score!! <= 0.5) }
    }

    @Test fun myUsStocksNearOrBelowSma200() = runBlocking {
        assumeTrue(live)
        // Listemde birkaç ABD hissesi + endeks
        val us = listOf("AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA").mapNotNull { k -> Catalog.all.firstOrNull { it.key == k } }
        val state = AppState().let { it.copy(instruments = it.instruments + us) }
        // "yalnızca hisseler" açık (varsayılan listede kapalı: endeksler de görünsün diye)
        val screen = ScreenTemplates.all.first { it.id == "d_my_us_sma200" }.copy(onlyStocks = true)
        val r = ScreenerSource.run(screen, state)
        print("listem ABD · fiyat < SMA200 +%5", r)
        assertNull(r.error)
        assertTrue("ABD kategorisindeki tüm listem taranmalı", r.scanned >= us.size)
        // Doğrulama: her sonuç gerçekten koşulu sağlıyor (skor = fiyat / SMA200 < 1,05) ve yalnızca hisseler
        r.rows.forEach { assertTrue("${it.symbol} skor ${it.score}", it.score != null && it.score!! < 1.05) }
        assertTrue("endeksler hariç", r.rows.none { it.symbol in setOf("SP:SPX", "NASDAQ:IXIC", "DJ:DJI") })
    }

    @Test fun bistOversold() = runBlocking {
        assumeTrue(live)
        val screen = Screen("t", "BIST RSI<30", Universe.BIST, conditions = listOf(Condition(Field.RSI, Op.LT, null, 30.0)))
        val r = ScreenerSource.run(screen, AppState())
        print("BIST RSI<30", r)
        assertNull(r.error)
        r.rows.forEach { assertTrue(it.symbol.startsWith("BIST:")) }
    }

    @Test fun bistNear52wLowInUsd() = runBlocking {
        assumeTrue(live)
        // USD modu: fiyat ve 52H dip kura bölünür; oran aynı kalır
        val screen = Screen("t", "52H dibe yakın (USD)", Universe.BIST, currency = ScreenCurrency.USD,
            conditions = listOf(Condition(Field.PRICE, Op.LTE, Field.LOW_52W, 5.0)))
        val r = ScreenerSource.run(screen, AppState())
        print("BIST 52H dip +%5 (USD)", r)
        assertNull(r.error)
        assertTrue("BIST evreni büyük olmalı", r.scanned > 300)
        r.rows.forEach { assertTrue(it.currency == "USD") }
    }

    @Test fun usLargeCapsAboveSma200() = runBlocking {
        assumeTrue(live)
        val screen = Screen("t", "ABD SMA200 üstü", Universe.US, conditions = listOf(Condition(Field.PRICE, Op.GT, Field.SMA200, 0.0)), limit = 10)
        val r = ScreenerSource.run(screen, AppState())
        print("ABD > SMA200 (sunucu filtresi)", r)
        assertNull(r.error)
        assertTrue(r.rows.isNotEmpty())
    }

    @Test fun fiveYearLowNeedsYahooAndFailsGracefully() = runBlocking {
        assumeTrue(live)
        // Bu ortamda Yahoo engelli: çökmeden anlaşılır bir hata dönmeli (telefonda Yahoo ile çalışır)
        val screen = ScreenTemplates.all.first { it.id == "d_bist_5y_usd" }
        val r = runCatching { ScreenerSource.run(screen, AppState()) }.getOrElse { e -> throw AssertionError("çöktü: $e") }
        print("BIST 5Y dip (USD)", r)
        assertTrue(r.error != null || r.note != null)
        println("ScreenEngine örnek: " + ScreenEngine.describe(screen.conditions.first()))
    }
}
