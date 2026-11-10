package com.piyasa.widget.model

import com.piyasa.widget.model.Category.COMMODITY
import com.piyasa.widget.model.Category.CRYPTO
import com.piyasa.widget.model.Category.FX
import com.piyasa.widget.model.Category.TR
import com.piyasa.widget.model.Category.US
import com.piyasa.widget.model.Source.GOLD_API
import com.piyasa.widget.model.Source.TCMB
import com.piyasa.widget.model.Source.YAHOO
import com.piyasa.widget.model.Category.ECONOMY

/** Hazır enstrüman kataloğu ve ilk kurulumdaki varsayılan izleme listesi. */
object Catalog {

    private fun t(key: String, name: String, symbol: String, cat: Category, decimals: Int = 2,
                  prefix: String = "", suffix: String = "", note: String? = null) =
        Instrument(key, name, symbol, Source.TRADINGVIEW, cat, decimals, prefix, suffix, note, tvSymbol = symbol)

    /** Hazır katalog: TradingView sembolleri (kullanıcının TradingView'da gördüğüyle birebir). */
    val all: List<Instrument> = listOf(
        // --- Amerika
        t("SPX", "S&P 500", "SP:SPX", US),
        t("NASDAQ", "Nasdaq", "NASDAQ:IXIC", US),
        t("DOW", "Dow Jones", "DJ:DJI", US),
        t("RUSSELL", "Russell 2000", "TVC:RUT", US),
        t("VIX", "VIX", "TVC:VIX", US),
        t("US10Y", "ABD 10Y Faiz", "TVC:US10Y", US, decimals = 3, suffix = "%"),
        t("AAPL", "Apple", "NASDAQ:AAPL", US, prefix = "$"),
        t("MSFT", "Microsoft", "NASDAQ:MSFT", US, prefix = "$"),
        t("NVDA", "Nvidia", "NASDAQ:NVDA", US, prefix = "$"),
        t("GOOGL", "Alphabet", "NASDAQ:GOOGL", US, prefix = "$"),
        t("AMZN", "Amazon", "NASDAQ:AMZN", US, prefix = "$"),
        t("META", "Meta", "NASDAQ:META", US, prefix = "$"),
        t("TSLA", "Tesla", "NASDAQ:TSLA", US, prefix = "$"),

        // --- Türkiye
        t("XU100", "BIST 100", "BIST:XU100", TR),
        t("XU030", "BIST 30", "BIST:XU030", TR),
        t("XBANK", "BIST Banka", "BIST:XBANK", TR),
        t("THYAO", "THY", "BIST:THYAO", TR, suffix = "₺"),
        t("ASELS", "Aselsan", "BIST:ASELS", TR, suffix = "₺"),
        t("GARAN", "Garanti BBVA", "BIST:GARAN", TR, suffix = "₺"),
        t("AKBNK", "Akbank", "BIST:AKBNK", TR, suffix = "₺"),
        t("KCHOL", "Koç Holding", "BIST:KCHOL", TR, suffix = "₺"),
        t("TUPRS", "Tüpraş", "BIST:TUPRS", TR, suffix = "₺"),
        t("BIMAS", "BİM", "BIST:BIMAS", TR, suffix = "₺"),
        t("EREGL", "Ereğli", "BIST:EREGL", TR, suffix = "₺"),
        t("FROTO", "Ford Otosan", "BIST:FROTO", TR, suffix = "₺"),
        t("SISE", "Şişecam", "BIST:SISE", TR, suffix = "₺"),
        t("ALTIN", "Darphane Altın Sertifikası", "BIST:ALTIN", TR, suffix = "₺", note = "ALTIN.S1"),
        t("GLDTR", "Altın Fonu (GoldIST)", "BIST:GLDTR", TR, suffix = "₺", note = "BYF"),
        t("GMSTR", "Gümüş Fonu", "BIST:GMSTR", TR, suffix = "₺", note = "GMSTR.F · BYF"),

        // --- Emtia
        t("ONS", "Ons Altın", "OANDA:XAUUSD", COMMODITY, prefix = "$", note = "Spot"),
        t("GUMUS", "Ons Gümüş", "TVC:SILVER", COMMODITY, decimals = 3, prefix = "$", note = "Spot"),
        t("PLATIN", "Platin", "TVC:PLATINUM", COMMODITY, prefix = "$", note = "Spot"),
        t("PALADYUM", "Paladyum", "TVC:PALLADIUM", COMMODITY, prefix = "$", note = "Spot"),
        t("BAKIR", "Bakır", "COMEX:HG1!", COMMODITY, decimals = 3, prefix = "$", note = "Vadeli"),
        t("BRENT", "Brent Petrol", "FX:UKOIL", COMMODITY, prefix = "$"),
        t("WTI", "WTI Petrol", "FX:USOIL", COMMODITY, prefix = "$"),
        t("DOGALGAZ", "Doğalgaz", "NYMEX:NG1!", COMMODITY, decimals = 3, prefix = "$", note = "Vadeli"),

        // --- Döviz
        t("USDTRY", "Dolar/TL", "FX:USDTRY", FX, decimals = 4),
        t("EURTRY", "Euro/TL", "FX:EURTRY", FX, decimals = 4),
        t("GBPTRY", "Sterlin/TL", "FX_IDC:GBPTRY", FX, decimals = 4),
        t("CHFTRY", "Frank/TL", "FX_IDC:CHFTRY", FX, decimals = 4),
        t("EURUSD", "EUR/USD", "FX:EURUSD", FX, decimals = 4),
        t("GBPUSD", "GBP/USD", "FX:GBPUSD", FX, decimals = 4),
        t("USDJPY", "USD/JPY", "FX:USDJPY", FX, decimals = 3),
        t("DXY", "Dolar Endeksi", "TVC:DXY", FX, decimals = 2),
        Instrument("TCMB_USD", "TCMB Dolar", "USD:ForexSelling", TCMB, FX, 4, note = "TCMB satış"),
        Instrument("TCMB_EUR", "TCMB Euro", "EUR:ForexSelling", TCMB, FX, 4, note = "TCMB satış"),

        // --- Kripto
        t("BTC", "Bitcoin", "BITSTAMP:BTCUSD", CRYPTO, decimals = 0, prefix = "$"),
        t("BTCTRY", "Bitcoin/TL", "BINANCE:BTCTRY", CRYPTO, decimals = 0, suffix = "₺"),
        t("ETH", "Ethereum", "BITSTAMP:ETHUSD", CRYPTO, decimals = 0, prefix = "$"),
        t("SOL", "Solana", "COINBASE:SOLUSD", CRYPTO, prefix = "$"),

        // --- Ekonomi
        t("TR_ENF", "TÜFE (yıllık)", "ECONOMICS:TRIRYY", ECONOMY, suffix = "%", note = "Türkiye"),
        t("TR_FAIZ", "TCMB Politika Faizi", "ECONOMICS:TRINTR", ECONOMY, suffix = "%", note = "Türkiye"),
        t("TR_KONUT", "Konut Fiyat Endeksi", "ECONOMICS:TRHPI", ECONOMY, note = "TRHPI · Türkiye"),
        t("TR_ISSIZ", "İşsizlik Oranı", "ECONOMICS:TRUR", ECONOMY, decimals = 1, suffix = "%", note = "Türkiye"),
        t("US_ENF", "ABD Enflasyonu (yıllık)", "ECONOMICS:USIRYY", ECONOMY, decimals = 1, suffix = "%", note = "ABD"),
        t("US_FAIZ", "Fed Faizi", "ECONOMICS:USINTR", ECONOMY, suffix = "%", note = "ABD"),
    )

    /** Katalog araması için Türkçe eş anlamlılar (ad/anahtar/sembol yanında). */
    val keywords: Map<String, String> = mapOf(
        "ONS" to "altın gold xau", "GUMUS" to "gümüş silver xag", "ALTIN" to "altın sertifika darphane gold",
        "GLDTR" to "altın fon gold etf", "GMSTR" to "gümüş fon silver etf", "BRENT" to "petrol oil", "WTI" to "petrol oil",
        "DOGALGAZ" to "gaz natural gas", "BAKIR" to "copper", "USDTRY" to "dolar usd", "EURTRY" to "euro avro eur",
        "TR_ENF" to "enflasyon tüfe inflation", "TR_KONUT" to "konut ev house trhpi", "TR_FAIZ" to "faiz interest",
        "BTC" to "bitcoin kripto", "BTCTRY" to "bitcoin kripto",
    )

    private val CRYPTO_EXCHANGES = setOf("BINANCE", "COINBASE", "BITSTAMP", "KRAKEN", "BTCTURK", "BYBIT", "OKX", "BITFINEX", "CRYPTOCAP", "PARIBU")
    private val US_EXCHANGES = setOf("NASDAQ", "NYSE", "AMEX", "CBOE", "SP", "DJ", "OTC", "BATS", "ARCA")
    private val COMMODITY_EXCHANGES = setOf("COMEX", "NYMEX", "CBOT", "ICEEUR", "ICEUS", "MCX")

    /** TradingView arama sonucundan enstrüman: kategori, ondalık, birim ve anahtar otomatik. */
    fun fromTradingView(hit: com.piyasa.widget.data.source.SearchHit, existingKeys: Collection<String>): Instrument {
        all.firstOrNull { it.symbol.equals(hit.symbol, true) }?.let { return it }
        val exchange = hit.exchange ?: hit.symbol.substringBefore(':')
        val ticker = hit.ticker ?: hit.symbol.substringAfter(':')
        val type = hit.quoteType
        val category = when {
            type == "economic" || exchange == "ECONOMICS" -> Category.ECONOMY
            exchange == "BIST" -> TR
            type == "forex" -> FX
            type == "spot" || type == "crypto" || exchange in CRYPTO_EXCHANGES -> CRYPTO
            type == "commodity" || type == "futures" || exchange in COMMODITY_EXCHANGES -> COMMODITY
            exchange in US_EXCHANGES || (exchange == "TVC" && ticker.startsWith("US")) -> US
            exchange == "OANDA" || exchange == "TVC" && type == "cfd" -> COMMODITY
            else -> Category.WORLD
        }
        val price = hit.price
        val scaleDecimals = hit.pricescale?.takeIf { it >= 1 }?.let { kotlin.math.log10(it).toInt() }
        val decimals = when {
            category == FX -> (scaleDecimals ?: 4).coerceIn(2, 4)
            category == CRYPTO && price != null && price >= 1000 -> 0
            category == Category.ECONOMY -> 2
            else -> (scaleDecimals ?: 2).coerceIn(0, 6)
        }
        val priced = type in setOf("stock", "fund", "dr", "structured", "spot", "crypto", "commodity", "futures", "cfd") ||
            category == COMMODITY || category == CRYPTO
        val cur = hit.currency
        val prefix = if (!priced) "" else when (cur) {
            "USD", "USDT", "USDC" -> "$"
            "EUR" -> "€"
            "GBP" -> "£"
            else -> ""
        }
        val suffix = if (!priced) "" else when (cur) {
            "TRY" -> "₺"
            null, "USD", "USDT", "USDC", "EUR", "GBP" -> ""
            else -> cur
        }
        var key = com.piyasa.widget.formula.Formulas.suggestKey(ticker.replace("!", ""))
        if (key in existingKeys) {
            var n = 2
            while ("${key}_$n" in existingKeys) n++
            key = "${key}_$n"
        }
        return Instrument(
            key = key,
            name = prettyName(hit.name, ticker),
            symbol = hit.symbol.uppercase(),
            source = Source.TRADINGVIEW,
            category = category,
            decimals = decimals,
            prefix = prefix,
            suffix = suffix,
            note = if (type == "futures") "Vadeli" else null,
            tvSymbol = hit.symbol.uppercase(),
        )
    }

    /** "DARPHANE ALTIN SERTIFIKASI" -> "Darphane Altin Sertifikasi"; şirket ekleri kısaltılır. */
    fun prettyName(raw: String?, fallback: String): String {
        var s = raw?.trim().orEmpty().ifEmpty { return fallback }
        if (s == s.uppercase() && s.any { it.isLetter() } && s.length > 4) {
            s = s.lowercase(java.util.Locale.ROOT).split(' ').joinToString(" ") { w -> w.replaceFirstChar { it.titlecase() } }
        }
        s = s.replace(Regex("(?i)\\s+(A\\.?S\\.?|A\\.O\\.|T\\.A\\.S\\.|Inc\\.?|Corporation|Corp\\.?|Ltd\\.?|PLC|N\\.V\\.|Class [A-C]|S\\.A\\.)\\.?(?=\\s|,|$)"), "")
        s = s.replace(Regex("\\s+"), " ").trim().trimEnd(',', '.')
        return s.ifEmpty { fallback }
    }

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
