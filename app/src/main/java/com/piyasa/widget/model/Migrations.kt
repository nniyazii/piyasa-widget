package com.piyasa.widget.model

/** Kayıtlı durumu güncel şemaya taşır. */
object Migrations {
    const val CURRENT = 3

    fun apply(state: AppState): AppState {
        var s = state
        if (state.schema < 2) s = toTradingView(s)
        if (state.schema < 3) s = refreshCatalogDefinitions(s)
        return if (s.schema == CURRENT) s else s.copy(schema = CURRENT)
    }

    /**
     * v1 -> v2: Katalogdan gelen Yahoo / gold-api göstergeleri TradingView karşılıklarına geçer
     * (anahtarlar aynı kalır, formüller ve widget'lar etkilenmez). TCMB ve özel semboller korunur.
     */
    private fun toTradingView(s: AppState): AppState {
        val byKey = Catalog.all.filter { it.source == Source.TRADINGVIEW }.associateBy { it.key }
        val migrated = mutableSetOf<String>()
        val instruments = s.instruments.map { ins ->
            val tv = byKey[ins.key]
            if (tv != null && (ins.source == Source.YAHOO || ins.source == Source.GOLD_API)) {
                migrated += ins.key
                tv
            } else ins
        }
        return s.copy(instruments = instruments, quotes = s.quotes - migrated)
    }

    /**
     * v2 -> v3: Katalogdan gelen göstergelerin adı, notu, ondalığı ve birimi güncel katalogla
     * eşitlenir (aynı anahtar + aynı sembol). Kullanıcının değiştirmediği eski varsayılan formüller
     * yeni tanımlarıyla (ad, birim) güncellenir. Kullanıcının kendi göstergeleri ve formülleri korunur.
     */
    private fun refreshCatalogDefinitions(s: AppState): AppState {
        val catalog = Catalog.all.associateBy { it.key }
        val instruments = s.instruments.map { ins ->
            val c = catalog[ins.key]
            if (c != null && c.symbol.equals(ins.symbol, ignoreCase = true) && c.source == ins.source) c else ins
        }
        val newDefaults = Catalog.defaultFormulas.associateBy { it.key }
        val formulas = s.formulas.map { f ->
            val legacy = Catalog.legacyDefaultFormulas[f.key]
            val fresh = newDefaults[f.key]
            if (legacy != null && fresh != null && f.expression.trim() == legacy) fresh else f
        }
        return s.copy(instruments = instruments, formulas = formulas)
    }

    /**
     * "Varsayılan listeye dön": göstergeler ve formüller derli toplu varsayılana döner.
     * Widget'lar korunur; listede artık olmayan kalemler widget'lardan çıkarılır.
     */
    fun resetToDefaults(s: AppState): AppState {
        val fresh = AppState()
        val keys = (fresh.instruments.map { it.key } + fresh.formulas.map { it.key }).toSet()
        return s.copy(
            instruments = fresh.instruments,
            formulas = fresh.formulas,
            quotes = s.quotes.filterKeys { k -> fresh.instruments.any { it.key == k && s.instrument(k)?.symbol == it.symbol } },
            widgets = s.widgets.mapValues { (_, w) ->
                // Bölümler ve dinamik listeler korunur (dinamik listeler sıfırlamadan etkilenmez)
                w.copy(keys = w.keys.filter { WidgetConfig.isSection(it) || WidgetConfig.isScreen(it) || it in keys })
            },
            schema = CURRENT,
        )
    }
}
