package com.piyasa.widget.data

import android.content.Context
import com.piyasa.widget.data.source.GoldApiSource
import com.piyasa.widget.data.source.TradingViewSource
import com.piyasa.widget.model.Migrations
import com.piyasa.widget.data.source.TcmbSource
import com.piyasa.widget.data.source.YahooSource
import com.piyasa.widget.data.source.ScreenerSource
import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.Instrument
import com.piyasa.widget.model.Quote
import com.piyasa.widget.model.Screen
import com.piyasa.widget.model.ScreenResult
import com.piyasa.widget.model.Source
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit
import java.time.Instant
import java.time.ZoneId

object Repository {
    private val mutex = Mutex()
    private val istanbul: ZoneId = ZoneId.of("Europe/Istanbul")

    /** Tüm enstrümanları çeker, durumu günceller. Başarısız semboller eski değerini korur. */
    suspend fun refresh(context: Context) {
        if (mutex.isLocked) return
        mutex.withLock {
            val store = context.appStore
            store.updateData { Migrations.apply(it).copy(refreshing = true) }
            try {
                val instruments = store.data.first().instruments
                val fetched = fetchAll(instruments)
                val failed = instruments.filter { fetched[it.key]?.isSuccess != true }.map { it.key }
                store.updateData { cur ->
                    val quotes = cur.quotes.toMutableMap()
                    for ((key, res) in fetched) {
                        val q = res.getOrNull() ?: continue
                        quotes[key] = withReference(quotes[key], q)
                    }
                    val validKeys = cur.instruments.map { it.key }.toSet()
                    cur.copy(
                        quotes = quotes.filterKeys { it in validKeys },
                        lastRefresh = if (failed.size < instruments.size) System.currentTimeMillis() else cur.lastRefresh,
                        lastError = when {
                            failed.isEmpty() -> null
                            failed.size == instruments.size -> "Bağlantı hatası — veriler alınamadı"
                            else -> "Alınamadı: " + failed.joinToString(", ")
                        },
                        refreshing = false,
                    )
                }
                // Dinamik listeler: fiyatlardan sonra, tek tek (her biri bitince widget güncellenebilir)
                val afterQuotes = store.data.first()
                for (screen in afterQuotes.screens) {
                    val result = runScreen(screen, afterQuotes)
                    store.updateData { cur ->
                        cur.copy(screenResults = (cur.screenResults + (screen.id to result)).filterKeys { id -> cur.screens.any { it.id == id } })
                    }
                }
            } finally {
                store.updateData { if (it.refreshing) it.copy(refreshing = false) else it }
            }
        }
    }

    /** Bir dinamik listeyi çalıştırır; hata olursa sonucu hata mesajıyla döner (önceki sonuçları silmez). */
    suspend fun runScreen(screen: Screen, state: AppState): ScreenResult = try {
        ScreenerSource.run(screen, state)
    } catch (e: Exception) {
        if (e is kotlinx.coroutines.CancellationException) throw e
        val previous = state.screenResults[screen.id]
        ScreenResult(
            time = System.currentTimeMillis(),
            rows = previous?.rows.orEmpty(),
            scanned = previous?.scanned ?: 0,
            error = "Tarama yapılamadı: ${e.message ?: "bağlantı hatası"}",
        )
    }

    private suspend fun fetchAll(instruments: List<Instrument>): Map<String, Result<Quote>> = coroutineScope {
        val limit = Semaphore(6)
        val tvInstruments = instruments.filter { it.source == Source.TRADINGVIEW }
        val tv = async {
            if (tvInstruments.isEmpty()) return@async emptyList()
            val res = runCatching { TradingViewSource.quotes(tvInstruments.map { it.symbol }) }
            tvInstruments.map { ins ->
                ins.key to res.mapCatching { it[ins.symbol.uppercase()] ?: it[ins.symbol] ?: error("TradingView'da ${ins.symbol} yok") }
            }
        }
        val single = instruments.filter { it.source == Source.YAHOO || it.source == Source.GOLD_API }.map { ins ->
            async {
                limit.withPermit {
                    ins.key to runCatching {
                        when (ins.source) {
                            Source.YAHOO -> YahooSource.fetch(ins.symbol)
                            Source.GOLD_API -> GoldApiSource.fetch(ins.symbol)
                            Source.TCMB, Source.TRADINGVIEW -> error("unreachable")
                        }
                    }
                }
            }
        }
        val tcmbInstruments = instruments.filter { it.source == Source.TCMB }
        val tcmb = async {
            if (tcmbInstruments.isEmpty()) return@async emptyList()
            val res = runCatching { TcmbSource.fetchAll(tcmbInstruments.map { it.symbol }) }
            tcmbInstruments.map { ins ->
                ins.key to res.mapCatching { it[ins.symbol] ?: error("TCMB'de ${ins.symbol} yok") }
            }
        }
        (single.awaitAll() + tcmb.await() + tv.await()).toMap()
    }

    /**
     * Gün içi mini grafik ve (sağlanmıyorsa) günlük referans uygulama tarafından tutulur.
     * Yahoo gün içi seriyi kendisi verir; TradingView/gold-api/TCMB için her yenilemede nokta eklenir.
     * Günün ilk noktası önceki kapanıştır, böylece grafik ilk yenilemede de yönü gösterir.
     */
    private fun withReference(old: Quote?, new: Quote): Quote {
        if (new.spark.isNotEmpty()) return new
        val today = day(new.time)
        if (old == null) return new.copy(spark = listOfNotNull(new.prevClose, new.price))
        if (old.time == new.time && old.price == new.price) return old
        val sameDay = day(old.time) == today
        val prev = new.prevClose ?: if (sameDay) old.prevClose else old.price
        val spark = if (sameDay && old.spark.isNotEmpty()) (old.spark + new.price).takeLast(40)
        else listOfNotNull(prev, new.price)
        return new.copy(prevClose = prev, spark = spark)
    }

    private fun day(millis: Long) = Instant.ofEpochMilli(millis).atZone(istanbul).toLocalDate()
}
