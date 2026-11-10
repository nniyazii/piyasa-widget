package com.piyasa.widget.data

import android.content.Context
import com.piyasa.widget.data.source.GoldApiSource
import com.piyasa.widget.data.source.TcmbSource
import com.piyasa.widget.data.source.YahooSource
import com.piyasa.widget.model.Instrument
import com.piyasa.widget.model.Quote
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
            store.updateData { it.copy(refreshing = true) }
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
            } finally {
                store.updateData { if (it.refreshing) it.copy(refreshing = false) else it }
            }
        }
    }

    private suspend fun fetchAll(instruments: List<Instrument>): Map<String, Result<Quote>> = coroutineScope {
        val limit = Semaphore(6)
        val single = instruments.filter { it.source != Source.TCMB }.map { ins ->
            async {
                limit.withPermit {
                    ins.key to runCatching {
                        when (ins.source) {
                            Source.YAHOO -> YahooSource.fetch(ins.symbol)
                            Source.GOLD_API -> GoldApiSource.fetch(ins.symbol)
                            Source.TCMB -> error("unreachable")
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
        (single.awaitAll() + tcmb.await()).toMap()
    }

    /**
     * Önceki kapanış vermeyen kaynaklar (spot metal, TCMB) için günlük referans ve
     * gün içi mini grafik uygulama tarafından tutulur.
     */
    private fun withReference(old: Quote?, new: Quote): Quote {
        if (new.prevClose != null) return new
        val today = day(new.time)
        if (old == null) return new.copy(spark = listOf(new.price))
        if (old.time == new.time && old.price == new.price) return old
        val sameDay = day(old.time) == today
        val prev = if (sameDay) old.prevClose else old.price
        val spark = if (sameDay) (old.spark + new.price).takeLast(40) else listOf(old.price, new.price)
        return new.copy(prevClose = prev, spark = spark)
    }

    private fun day(millis: Long) = Instant.ofEpochMilli(millis).atZone(istanbul).toLocalDate()
}
