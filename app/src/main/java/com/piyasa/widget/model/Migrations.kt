package com.piyasa.widget.model

/** Kayıtlı durumu güncel şemaya taşır. */
object Migrations {
    const val CURRENT = 2

    fun apply(state: AppState): AppState {
        var s = state
        if (s.schema < 2) s = toTradingView(s)
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
}
