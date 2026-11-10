package com.piyasa.widget.formula

import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.Category
import com.piyasa.widget.model.Formula
import com.piyasa.widget.model.Instrument
import com.piyasa.widget.model.Source
import com.piyasa.widget.model.TradingView
import org.junit.Assert.assertEquals
import org.junit.Test

class TradingViewTest {
    private val state = AppState()

    private fun withFormula(expr: String) =
        state.copy(formulas = state.formulas + Formula("T", "T", expr))

    @Test fun instruments() {
        assertEquals("FX:USDTRY", TradingView.symbolFor(state, "USDTRY"))
        assertEquals("BIST:XU100", TradingView.symbolFor(state, "XU100"))
        assertEquals("OANDA:XAUUSD", TradingView.symbolFor(state, "ONS"))
    }

    @Test fun derivedFromSourceSymbol() {
        fun y(sym: String) = TradingView.symbolOf(Instrument("K", "K", sym, Source.YAHOO, Category.TR))
        assertEquals("BIST:ASELS", y("ASELS.IS"))
        assertEquals("FX_IDC:GBPTRY", y("GBPTRY=X"))
        assertEquals("NVDA", y("NVDA"))
        assertEquals("NASDAQ:X", TradingView.symbolOf(Instrument("K", "K", "X", Source.YAHOO, Category.US, tvSymbol = "NASDAQ:X")))
    }

    @Test fun formulasExpandToSpreads() {
        assertEquals("OANDA:XAUUSD*FX:USDTRY/31.1034768", TradingView.symbolFor(state, "GRAM_ALTIN"))
        assertEquals("OANDA:XAUUSD*FX:USDTRY/31.1034768*1.6067", TradingView.symbolFor(state, "CEYREK"))
        assertEquals("(FX:USDTRY+FX:EURTRY)/2", TradingView.symbolFor(state, "SEPET"))
        assertEquals("BIST:XU100/FX:USDTRY", TradingView.symbolFor(state, "BIST_USD"))
        assertEquals("FX:USDTRY-(FX:EURTRY-1)", TradingView.symbolFor(withFormula("USDTRY - (EURTRY - 1)"), "T"))
        assertEquals("-FX:USDTRY*2", TradingView.symbolFor(withFormula("-USDTRY * 2"), "T"))
    }

    @Test fun unsupportedFunctionFallsBackToFirstInstrument() {
        assertEquals("FX:EURUSD", TradingView.symbolFor(withFormula("pct(EURUSD, 1.10)"), "T"))
        assertEquals("OANDA:XAUUSD", TradingView.symbolFor(withFormula("chg(GRAM_ALTIN)"), "T"))
    }

    @Test fun url() {
        assertEquals(
            "https://www.tradingview.com/chart/?symbol=OANDA%3AXAUUSD*FX%3AUSDTRY%2F31.1034768",
            TradingView.urlFor(state, "GRAM_ALTIN"),
        )
    }
}
