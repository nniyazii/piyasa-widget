package com.piyasa.widget.formula

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TokensTest {
    @Test fun roundTrip() {
        val cases = mapOf(
            "ONS * USDTRY / OZ" to listOf("ONS", "*", "USDTRY", "/", "OZ"),
            "(USDTRY + EURTRY) / 2" to listOf("(", "USDTRY", "+", "EURTRY", ")", "/", "2"),
            "pct(EURUSD; 1.10)" to listOf("pct(", "EURUSD", ";", "1.10", ")"),
            "GRAM_ALTIN * 1.6067" to listOf("GRAM_ALTIN", "*", "1.6067"),
        )
        for ((expr, tokens) in cases) {
            assertEquals(tokens, Tokens.tokenize(expr))
            assertEquals(expr, Tokens.render(tokens))
        }
    }

    @Test fun normalizesInput() {
        assertEquals(listOf("pct(", "ONS", ";", "1", ")"), Tokens.tokenize("PCT (ons, 1)"))
        assertEquals(listOf("A", "*", "B", "/", "C", "-", "D"), Tokens.tokenize("a×b÷c−d"))
    }

    @Test fun renderedExpressionParses() {
        val tokens = listOf("chg(", "ONS", "*", "USDTRY", "/", "OZ", ")")
        Parser.parse(Tokens.render(tokens))
    }

    @Test fun numbers() {
        assertEquals("31.1035", Tokens.parseNumber("31,1035"))
        assertEquals("2", Tokens.parseNumber(" 2 "))
        assertNull(Tokens.parseNumber("abc"))
        assertNull(Tokens.parseNumber("1,2,3"))
    }
}
