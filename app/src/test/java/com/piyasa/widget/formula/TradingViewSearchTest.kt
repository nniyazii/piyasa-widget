package com.piyasa.widget.formula

import com.piyasa.widget.data.source.SearchHit
import com.piyasa.widget.data.source.TradingViewSource
import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.Catalog
import com.piyasa.widget.model.Category
import com.piyasa.widget.model.Instrument
import com.piyasa.widget.model.Migrations
import com.piyasa.widget.model.Source
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TradingViewSearchTest {

    @Test fun normalizesBistAndYahooStyleCodes() {
        assertEquals("ALTIN", TradingViewSource.normalizeCode("altın.s1".replace('ı', 'i')))
        assertEquals("ALTIN", TradingViewSource.normalizeCode("ALTIN.S1"))
        assertEquals("GMSTR", TradingViewSource.normalizeCode("gmstr.f"))
        assertEquals("THYAO", TradingViewSource.normalizeCode("THYAO.IS"))
        assertEquals("THYAO", TradingViewSource.normalizeCode("BIST:THYAO"))
        assertEquals("USDTRY", TradingViewSource.normalizeCode("USDTRY=X"))
        assertEquals("BTCUSD", TradingViewSource.normalizeCode("btc-usd"))
        assertEquals("TRHPI", TradingViewSource.normalizeCode("trhpi"))
        assertNull(TradingViewSource.normalizeCode("gram altın"))
    }

    @Test fun textPatternAddsEnglishSynonyms() {
        val p = TradingViewSource.textPattern("Altın")!!
        assertTrue(p, p.split('|').containsAll(listOf("altin", "gold")))
        assertTrue(TradingViewSource.textPattern("konut fiyat")!!.contains("house price"))
        assertNull(TradingViewSource.textPattern("ı"))
    }

    private fun hit(sym: String, name: String, type: String, cur: String?, scale: Double?, price: Double = 10.0) =
        SearchHit(sym, name, type, sym.substringBefore(':'), null, sym.substringAfter(':'), price, 1.0, scale, cur)

    @Test fun instrumentFromHit() {
        Catalog.fromTradingView(hit("BIST:ASTOR", "ASTOR ENERJI A.S.", "stock", "TRY", 100.0), emptyList()).let {
            assertEquals(Category.TR, it.category); assertEquals("ASTOR", it.key); assertEquals("₺", it.suffix)
            assertEquals("Astor Enerji", it.name); assertEquals(Source.TRADINGVIEW, it.source); assertEquals(2, it.decimals)
        }
        Catalog.fromTradingView(hit("ECONOMICS:DEIRYY", "Germany Inflation Rate YoY", "economic", null, null), emptyList()).let {
            assertEquals(Category.ECONOMY, it.category); assertEquals("", it.prefix + it.suffix)
        }
        Catalog.fromTradingView(hit("NYSE:KO", "Coca-Cola Company (The)", "stock", "USD", 100.0), emptyList()).let {
            assertEquals(Category.US, it.category); assertEquals("$", it.prefix)
        }
        Catalog.fromTradingView(hit("FX:USDJPY", "USD/JPY", "forex", "JPY", 1000.0), emptyList()).let {
            assertEquals(Category.FX, it.category); assertEquals(3, it.decimals); assertEquals("", it.suffix)
        }
        Catalog.fromTradingView(hit("BINANCE:SOLTRY", "Solana / Turkish Lira", "spot", "TRY", 10.0, 3000.0), emptyList()).let {
            assertEquals(Category.CRYPTO, it.category); assertEquals(0, it.decimals); assertEquals("₺", it.suffix)
        }
        // katalogdakiler katalog tanımıyla gelir
        assertEquals("ALTIN", Catalog.fromTradingView(hit("BIST:ALTIN", "DARPHANE", "stock", "TRY", 100.0), emptyList()).key)
    }

    @Test fun migratesCatalogInstrumentsToTradingView() {
        val old = AppState(
            instruments = listOf(
                Instrument("ONS", "Ons Altın", "XAU", Source.GOLD_API, Category.COMMODITY),
                Instrument("USDTRY", "Dolar/TL", "USDTRY=X", Source.YAHOO, Category.FX, 4),
                Instrument("ASTOR", "Astor", "ASTOR.IS", Source.YAHOO, Category.TR),
                Instrument("TCMB_USD", "TCMB Dolar", "USD:ForexSelling", Source.TCMB, Category.FX),
            ),
        )
        val s = Migrations.apply(old)
        assertEquals(Migrations.CURRENT, s.schema)
        assertEquals("OANDA:XAUUSD", s.instrument("ONS")!!.symbol)
        assertEquals(Source.TRADINGVIEW, s.instrument("USDTRY")!!.source)
        assertEquals(Source.YAHOO, s.instrument("ASTOR")!!.source)
        assertEquals(Source.TCMB, s.instrument("TCMB_USD")!!.source)
        // formüller değişmeden çalışır
        assertEquals(old.formulas, s.formulas)
    }

    @Test fun catalogSymbolsAreTradingView() {
        assertTrue(Catalog.all.filter { it.source != Source.TCMB }.all { it.source == Source.TRADINGVIEW && it.symbol.contains(':') })
        assertEquals(Catalog.all.size, Catalog.all.map { it.key }.toSet().size)
    }
}
