package com.piyasa.widget.data

import android.content.Context
import androidx.datastore.core.CorruptionException
import androidx.datastore.core.DataStore
import androidx.datastore.core.Serializer
import androidx.datastore.dataStore
import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.Formula
import com.piyasa.widget.model.Instrument
import com.piyasa.widget.model.WidgetConfig
import com.piyasa.widget.widget.PiyasaWidget
import com.piyasa.widget.work.RefreshWorker
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import java.io.InputStream
import java.io.OutputStream
import androidx.glance.appwidget.updateAll

val AppJson = Json {
    ignoreUnknownKeys = true
    encodeDefaults = true
    explicitNulls = false
}

object AppStateSerializer : Serializer<AppState> {
    override val defaultValue: AppState = AppState()

    override suspend fun readFrom(input: InputStream): AppState = try {
        AppJson.decodeFromString(AppState.serializer(), input.readBytes().decodeToString())
    } catch (e: SerializationException) {
        throw CorruptionException("Durum dosyası okunamadı", e)
    } catch (e: IllegalArgumentException) {
        throw CorruptionException("Durum dosyası okunamadı", e)
    }

    override suspend fun writeTo(t: AppState, output: OutputStream) {
        output.write(AppJson.encodeToString(AppState.serializer(), t).encodeToByteArray())
    }
}

val Context.appStore: DataStore<AppState> by dataStore(
    fileName = "piyasa_state.json",
    serializer = AppStateSerializer,
    corruptionHandler = androidx.datastore.core.handlers.ReplaceFileCorruptionHandler { AppState() },
)

/** Durum değişiklikleri; her değişiklikten sonra widget'lar yeniden çizilir. */
object Actions {

    private suspend fun edit(context: Context, transform: (AppState) -> AppState) {
        context.appStore.updateData(transform)
        PiyasaWidget().updateAll(context)
    }

    suspend fun addInstrument(context: Context, instrument: Instrument) {
        edit(context) { s ->
            if (s.allKeys.contains(instrument.key)) s else s.copy(instruments = s.instruments + instrument)
        }
        RefreshWorker.runNow(context)
    }

    suspend fun removeInstrument(context: Context, key: String) = edit(context) { s ->
        s.copy(
            instruments = s.instruments.filterNot { it.key == key },
            quotes = s.quotes - key,
            widgets = s.widgets.mapValues { (_, w) -> w.copy(keys = w.keys - key) },
        )
    }

    suspend fun moveInstrument(context: Context, key: String, delta: Int) = edit(context) { s ->
        s.copy(instruments = s.instruments.moved(s.instruments.indexOfFirst { it.key == key }, delta))
    }

    /** [originalKey] düzenlenen formülün eski anahtarı (yeniyse null). */
    suspend fun upsertFormula(context: Context, formula: Formula, originalKey: String?) = edit(context) { s ->
        val list = s.formulas.toMutableList()
        val idx = if (originalKey != null) list.indexOfFirst { it.key == originalKey } else -1
        if (idx >= 0) list[idx] = formula else list += formula
        val widgets = if (originalKey != null && originalKey != formula.key) {
            s.widgets.mapValues { (_, w) -> w.copy(keys = w.keys.map { if (it == originalKey) formula.key else it }) }
        } else s.widgets
        s.copy(formulas = list, widgets = widgets)
    }

    suspend fun deleteFormula(context: Context, key: String) = edit(context) { s ->
        s.copy(
            formulas = s.formulas.filterNot { it.key == key },
            widgets = s.widgets.mapValues { (_, w) -> w.copy(keys = w.keys - key) },
        )
    }

    suspend fun moveFormula(context: Context, key: String, delta: Int) = edit(context) { s ->
        s.copy(formulas = s.formulas.moved(s.formulas.indexOfFirst { it.key == key }, delta))
    }

    suspend fun setWidgetConfig(context: Context, appWidgetId: Int, config: WidgetConfig) = edit(context) { s ->
        s.copy(widgets = s.widgets + (appWidgetId to config))
    }

    suspend fun removeWidgets(context: Context, ids: IntArray) {
        context.appStore.updateData { s -> s.copy(widgets = s.widgets - ids.toSet()) }
    }

    suspend fun setRefreshMinutes(context: Context, minutes: Int) {
        context.appStore.updateData { it.copy(refreshMinutes = minutes) }
        RefreshWorker.schedule(context, minutes, replace = true)
    }

    /** Göstergeleri ve formülleri derli toplu varsayılan listeye döndürür (widget'lar korunur). */
    suspend fun resetToDefaults(context: Context) {
        edit(context) { com.piyasa.widget.model.Migrations.resetToDefaults(it) }
        RefreshWorker.runNow(context)
    }

    private fun <T> List<T>.moved(index: Int, delta: Int): List<T> {
        val target = index + delta
        if (index < 0 || target !in indices) return this
        return toMutableList().apply { add(target, removeAt(index)) }
    }
}
