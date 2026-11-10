package com.piyasa.widget.model

import com.piyasa.widget.model.Category.COMMODITY
import com.piyasa.widget.model.Category.CRYPTO
import com.piyasa.widget.model.Category.FX
import com.piyasa.widget.model.Category.TR
import com.piyasa.widget.model.Category.US
import com.piyasa.widget.model.Source.GOLD_API
import com.piyasa.widget.model.Source.TCMB
import com.piyasa.widget.model.Source.YAHOO

/** Hazır enstrüman kataloğu ve ilk kurulumdaki varsayılan izleme listesi. */
object Catalog {

    private fun y(key: String, name: String, symbol: String, cat: Category, decimals: Int = 2,
                  prefix: String = "", suffix: String = "", note: String? = null) =
        Instrument(key, name, symbol, YAHOO, cat, decimals, prefix, suffix, note)

    val all: List<Instrument> = listOf(
        // --- Amerika
        y("SPX", "S&P 500", "^GSPC", US),
        y("NASDAQ", "Nasdaq", "^IXIC", US),
        y("DOW", "Dow Jones", "^DJI", US),
        y("RUSSELL", "Russell 2000", "^RUT", US),
        y("VIX", "VIX", "^VIX", US),
        y("US10Y", "ABD 10Y Faiz", "^TNX", US, decimals = 3, suffix = "%"),
        y("AAPL", "Apple", "AAPL", US, prefix = "$"),
        y("MSFT", "Microsoft", "MSFT", US, prefix = "$"),
        y("NVDA", "Nvidia", "NVDA", US, prefix = "$"),
        y("GOOGL", "Alphabet", "GOOGL", US, prefix = "$"),
        y("AMZN", "Amazon", "AMZN", US, prefix = "$"),
        y("META", "Meta", "META", US, prefix = "$"),
        y("TSLA", "Tesla", "TSLA", US, prefix = "$"),

        // --- Türkiye
        y("XU100", "BIST 100", "XU100.IS", TR),
        y("XU030", "BIST 30", "XU030.IS", TR),
        y("XBANK", "BIST Banka", "XBANK.IS", TR),
        y("THYAO", "THY", "THYAO.IS", TR, suffix = "₺"),
        y("ASELS", "Aselsan", "ASELS.IS", TR, suffix = "₺"),
        y("GARAN", "Garanti BBVA", "GARAN.IS", TR, suffix = "₺"),
        y("AKBNK", "Akbank", "AKBNK.IS", TR, suffix = "₺"),
        y("KCHOL", "Koç Holding", "KCHOL.IS", TR, suffix = "₺"),
        y("TUPRS", "Tüpraş", "TUPRS.IS", TR, suffix = "₺"),
        y("BIMAS", "BİM", "BIMAS.IS", TR, suffix = "₺"),
        y("EREGL", "Ereğli", "EREGL.IS", TR, suffix = "₺"),
        y("FROTO", "Ford Otosan", "FROTO.IS", TR, suffix = "₺"),
        y("SISE", "Şişecam", "SISE.IS", TR, suffix = "₺"),

        // --- Emtia (spot metaller gold-api, enerji Yahoo vadeli)
        Instrument("ONS", "Ons Altın", "XAU", GOLD_API, COMMODITY, 2, prefix = "$", note = "Spot"),
        Instrument("GUMUS", "Ons Gümüş", "XAG", GOLD_API, COMMODITY, 3, prefix = "$", note = "Spot"),
        Instrument("PLATIN", "Platin", "XPT", GOLD_API, COMMODITY, 2, prefix = "$", note = "Spot"),
        Instrument("PALADYUM", "Paladyum", "XPD", GOLD_API, COMMODITY, 2, prefix = "$", note = "Spot"),
        Instrument("BAKIR", "Bakır", "HG", GOLD_API, COMMODITY, 3, prefix = "$", note = "Spot"),
        y("BRENT", "Brent Petrol", "BZ=F", COMMODITY, prefix = "$", note = "Vadeli"),
        y("WTI", "WTI Petrol", "CL=F", COMMODITY, prefix = "$", note = "Vadeli"),
        y("DOGALGAZ", "Doğalgaz", "NG=F", COMMODITY, decimals = 3, prefix = "$", note = "Vadeli"),

        // --- Döviz
        y("USDTRY", "Dolar/TL", "USDTRY=X", FX, decimals = 4),
        y("EURTRY", "Euro/TL", "EURTRY=X", FX, decimals = 4),
        y("GBPTRY", "Sterlin/TL", "GBPTRY=X", FX, decimals = 4),
        y("CHFTRY", "Frank/TL", "CHFTRY=X", FX, decimals = 4),
        y("EURUSD", "EUR/USD", "EURUSD=X", FX, decimals = 4),
        y("GBPUSD", "GBP/USD", "GBPUSD=X", FX, decimals = 4),
        y("USDJPY", "USD/JPY", "JPY=X", FX, decimals = 3),
        y("DXY", "Dolar Endeksi", "DX-Y.NYB", FX, decimals = 2),
        Instrument("TCMB_USD", "TCMB Dolar", "USD:ForexSelling", TCMB, FX, 4, note = "TCMB satış"),
        Instrument("TCMB_EUR", "TCMB Euro", "EUR:ForexSelling", TCMB, FX, 4, note = "TCMB satış"),

        // --- Kripto
        y("BTC", "Bitcoin", "BTC-USD", CRYPTO, decimals = 0, prefix = "$"),
        y("ETH", "Ethereum", "ETH-USD", CRYPTO, decimals = 0, prefix = "$"),
        y("SOL", "Solana", "SOL-USD", CRYPTO, prefix = "$"),
    )

    /**
     * Sembolden enstrüman üretir: kategori, ondalık ve birim tahmin edilir.
     * [quoteType] Yahoo aramasından gelir (EQUITY, INDEX, CURRENCY, FUTURE, CRYPTOCURRENCY, ETF ...).
     */
    fun fromSymbol(
        symbol: String,
        source: Source,
        name: String?,
        existingKeys: Collection<String>,
        quoteType: String? = null,
        currency: String? = null,
    ): Instrument {
        val sym = if (source == YAHOO) symbol.trim().uppercase() else symbol.trim()
        val type = quoteType?.uppercase()
        val category = when {
            source == GOLD_API -> COMMODITY
            source == TCMB -> FX
            type == "CRYPTOCURRENCY" || Regex("^[A-Z0-9]+-(USD|USDT|EUR|TRY)$").matches(sym) -> CRYPTO
            type == "CURRENCY" || sym.endsWith("=X") -> FX
            type == "FUTURE" || sym.endsWith("=F") -> COMMODITY
            sym.endsWith(".IS") -> TR
            else -> Category.US
        }
        val isFx = category == FX
        val isTrEquity = sym.endsWith(".IS") && !sym.startsWith("XU") && type != "INDEX"
        val isIndex = type == "INDEX" || sym.startsWith("^") || (sym.startsWith("XU") && sym.endsWith(".IS"))
        val decimals = when {
            isFx -> 4
            category == CRYPTO && !sym.startsWith("BTC") && !sym.startsWith("ETH") -> 4
            category == CRYPTO -> 0
            else -> 2
        }
        val prefix = when {
            isFx || isIndex || isTrEquity -> ""
            currency == "TRY" -> ""
            category == TR -> ""
            else -> "$"
        }
        val suffix = if (isTrEquity || (currency == "TRY" && !isFx && !isIndex)) "₺" else ""
        val base = sym.substringBefore('.').substringBefore('=').substringBefore('-').removePrefix("^")
            .let { if (source == TCMB) "TCMB_" + it.substringBefore(':') else it }
        var key = com.piyasa.widget.formula.Formulas.suggestKey(base)
        if (key in existingKeys) {
            var n = 2
            while ("${key}_$n" in existingKeys) n++
            key = "${key}_$n"
        }
        return Instrument(
            key = key,
            name = name?.trim()?.takeIf { it.isNotEmpty() } ?: base,
            symbol = sym,
            source = source,
            category = category,
            decimals = decimals,
            prefix = prefix,
            suffix = suffix,
            note = when {
                source == GOLD_API -> "Spot"
                category == COMMODITY && source == YAHOO -> "Vadeli"
                else -> null
            },
        )
    }

    private val defaultKeys = listOf(
        "SPX", "NASDAQ", "DOW",
        "XU100", "XU030",
        "ONS", "GUMUS", "BRENT",
        "USDTRY", "EURTRY", "EURUSD",
    )

    val defaultInstruments: List<Instrument> = defaultKeys.mapNotNull { k -> all.firstOrNull { it.key == k } }

    val defaultFormulas: List<Formula> = listOf(
        Formula("GRAM_ALTIN", "Gram Altın", "ONS * USDTRY / OZ", 2, suffix = "₺"),
        Formula("CEYREK", "Çeyrek (has)", "GRAM_ALTIN * 1.6067", 0, suffix = "₺"),
        Formula("GRAM_GUMUS", "Gram Gümüş", "GUMUS * USDTRY / OZ", 2, suffix = "₺"),
        Formula("BIST_USD", "BIST 100 ($)", "XU100 / USDTRY", 2, prefix = "$"),
        Formula("ALTIN_GUMUS", "Altın/Gümüş", "ONS / GUMUS", 2),
        Formula("SEPET", "Döviz Sepeti", "(USDTRY + EURTRY) / 2", 4),
    )
}
