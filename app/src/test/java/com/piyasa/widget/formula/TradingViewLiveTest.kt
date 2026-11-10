package com.piyasa.widget.formula

import com.piyasa.widget.data.source.TradingViewSource
import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.Catalog
import com.piyasa.widget.model.Source
import com.piyasa.widget.ui.SearchState
import com.piyasa.widget.ui.candidates
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

/** Gerçek TradingView servisine karşı (varsayılan çalıştırmada atlanır): ./gradlew testDebugUnitTest -Plive=true */
class TradingViewLiveTest {
    private val live = System.getProperty("live") == "true"

    @Test fun searchFindsWhatUsersType() = runBlocking {
        assumeTrue(live)
        val state = AppState()
        val expectations = mapOf(
            "ALTIN.S1" to "BIST:ALTIN", "gmstr.f" to "BIST:GMSTR", "trhpi" to "ECONOMICS:TRHPI",
            "konut" to "ECONOMICS:TRHPI", "aselsan" to "BIST:ASELS", "altın" to "OANDA:XAUUSD",
            "apple" to "NASDAQ:AAPL", "BIST:THYAO" to "BIST:THYAO", "astor" to "BIST:ASTOR", "nvidia" to "NASDAQ:NVDA",
        )
        val misses = mutableListOf<String>()
        for ((q, want) in expectations) {
            val hits = com.piyasa.widget.ui.defaultSearch(q)
            val list = candidates(state, q, SearchState.Done(hits), null)
            val top = list.take(6).map { it.instrument.symbol }
            println("“$q” → " + list.take(6).joinToString(" | ") { "${it.instrument.symbol} ${it.instrument.name} ${it.price}" })
            if (want !in top) misses += "$q → $want (ilk 6: $top)"
        }
        assertTrue("Bulunamayanlar: $misses", misses.isEmpty())
        val konut = candidates(state, "konut", SearchState.Done(com.piyasa.widget.ui.defaultSearch("konut")), null).first()
        assertTrue("konut fiyatı yok", konut.price != null)
    }

    @Test fun catalogQuotesResolve() = runBlocking {
        assumeTrue(live)
        val symbols = Catalog.all.filter { it.source == Source.TRADINGVIEW }.map { it.symbol }
        val q = TradingViewSource.quotes(symbols)
        val missing = symbols.filter { it !in q }
        println("fiyat gelen: ${q.size}/${symbols.size}  eksik: $missing")
        println(q.entries.take(5).joinToString { "${it.key}=${it.value.price} (önceki ${it.value.prevClose})" })
        assertTrue("Eksik: $missing", missing.isEmpty())
    }
}
