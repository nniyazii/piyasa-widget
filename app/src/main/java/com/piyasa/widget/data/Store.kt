package com.piyasa.widget.data

import android.content.Context
import androidx.datastore.core.CorruptionException
import androidx.datastore.core.DataStore
import androidx.datastore.core.Serializer
import androidx.datastore.dataStore
import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.Formula
import com.piyasa.widget.model.Instrument
import com.piyasa.widget.model.Reorder
import com.piyasa.widget.model.WidgetConfig
import com.piyasa.widget.widget.PiyasaWidget
import com.piyasa.widget.work.RefreshWorker
import kotlinx.coroutines.flow.first
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

    /** Sürükle-bırak sonrası: verilen anahtarların (ör. tek kategori) yeni sırası. */
    suspend fun reorderInstruments(context: Context, keys: List<String>) = edit(context) { s ->
        s.copy(instruments = Reorder.subset(s.instruments, keys) { it.key })
    }

    suspend fun reorderFormulas(context: Context, keys: List<String>) = edit(context) { s ->
        s.copy(formulas = Reorder.subset(s.formulas, keys) { it.key })
    }

    suspend fun reorderScreens(context: Context, ids: List<String>) = edit(context) { s ->
        s.copy(screens = Reorder.subset(s.screens, ids) { it.id })
    }

    /** Ana ekrana sabitleme isteği: başlatıcı widget'ı eklediğinde bu içerik atanır. */
    suspend fun setPendingWidget(context: Context, config: WidgetConfig?) {
        context.appStore.updateData { it.copy(pendingWidget = config, pendingWidgetAt = System.currentTimeMillis()) }
    }

    /**
     * Sabitlenen widget eklendi: içeriğini ata. Kullanıcı bu arada ayar ekranında kaydettiyse
     * (başlatıcı ayar ekranını açtıysa) onun seçimi korunur.
     */
    suspend fun applyPinnedWidget(context: Context, appWidgetId: Int, config: WidgetConfig) = edit(context) { s ->
        s.copy(
            widgets = if (s.widgets.containsKey(appWidgetId)) s.widgets else s.widgets + (appWidgetId to config),
            pendingWidget = null,
        )
    }

    // ------------------------------------------------------------------ dinamik listeler

    /** Kaydeder ve hemen çalıştırır (sonuç beklenmeden ekran kapanabilir; sonuç gelince liste güncellenir). */
    suspend fun upsertScreen(context: Context, screen: com.piyasa.widget.model.Screen) {
        edit(context) { s ->
            val list = s.screens.toMutableList()
            val i = list.indexOfFirst { it.id == screen.id }
            if (i >= 0) list[i] = screen else list += screen
            s.copy(screens = list)
        }
        runScreen(context, screen.id)
    }

    suspend fun runScreen(context: Context, id: String) {
        val state = context.appStore.data.first()
        val screen = state.screen(id) ?: return
        val result = Repository.runScreen(screen, state)
        edit(context) { s -> if (s.screen(id) == null) s else s.copy(screenResults = s.screenResults + (id to result)) }
    }

    suspend fun deleteScreen(context: Context, id: String) = edit(context) { s ->
        val entry = com.piyasa.widget.model.WidgetConfig.screenEntry(id)
        s.copy(
            screens = s.screens.filterNot { it.id == id },
            screenResults = s.screenResults - id,
            widgets = s.widgets.mapValues { (_, w) -> w.copy(keys = w.keys - entry) },
        )
    }

    suspend fun moveScreen(context: Context, id: String, delta: Int) = edit(context) { s ->
        s.copy(screens = s.screens.moved(s.screens.indexOfFirst { it.id == id }, delta))
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
        s.copy(widgets = s.widgets + (appWidgetId to config), pendingWidget = null)
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
