package com.piyasa.widget.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.appwidget.compose
import com.piyasa.widget.data.Actions
import com.piyasa.widget.data.AppJson
import com.piyasa.widget.model.WidgetConfig
import com.piyasa.widget.work.RefreshWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Uygulamadan ana ekrana hazır içerikli widget sabitleme (ör. bir dinamik liste ya da "Döviz" grubu).
 * Başlatıcı onay penceresini gösterir; widget eklenince [WidgetPinnedReceiver] içeriği yeni widget'a atar.
 */
object WidgetPins {
    internal const val EXTRA_CONFIG = "com.piyasa.widget.PIN_CONFIG"

    fun supported(context: Context): Boolean =
        AppWidgetManager.getInstance(context).isRequestPinAppWidgetSupported

    /** @return başlatıcı isteği kabul ettiyse true (kullanıcı onay penceresinde yine vazgeçebilir). */
    suspend fun request(context: Context, config: WidgetConfig?): Boolean {
        val app = context.applicationContext
        val mgr = AppWidgetManager.getInstance(app)
        if (!mgr.isRequestPinAppWidgetSupported) return false
        // Başlatıcı ayar ekranını açarsa orada da bu içerik başlangıç değeri olsun
        Actions.setPendingWidget(app, config)
        val callback = config?.let {
            val intent = Intent(app, WidgetPinnedReceiver::class.java)
                .putExtra(EXTRA_CONFIG, AppJson.encodeToString(WidgetConfig.serializer(), it))
            // Sistem widget kimliğini bu niyete ekler: Android 12+ değiştirilebilir olmalı
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
            PendingIntent.getBroadcast(app, (System.currentTimeMillis() and 0x7fffffff).toInt(), intent, flags)
        }
        // Onay penceresinde gerçek içerikle önizleme
        val extras = config?.let { cfg ->
            runCatching {
                val rows = if (cfg.keys.any { WidgetConfig.isScreen(it) }) cfg.screenRows.coerceAtMost(6) else cfg.keys.size.coerceAtMost(6)
                val views = PiyasaWidget(previewConfig = cfg).compose(app, size = DpSize(300.dp, (40 + rows * 30).dp))
                Bundle().apply { putParcelable(AppWidgetManager.EXTRA_APPWIDGET_PREVIEW, views) }
            }.getOrNull()
        }
        return mgr.requestPinAppWidget(ComponentName(app, PiyasaWidgetReceiver::class.java), extras, callback)
    }
}

/** Sabitlenen widget eklendiğinde çağrılır: hazır içeriği yeni widget kimliğine yazar. */
class WidgetPinnedReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
        val json = intent.getStringExtra(WidgetPins.EXTRA_CONFIG)
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID || json == null) return
        val config = runCatching { AppJson.decodeFromString(WidgetConfig.serializer(), json) }.getOrNull() ?: return
        val app = context.applicationContext
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                Actions.applyPinnedWidget(app, id, config)
                RefreshWorker.runNow(app)
            } finally {
                pending.finish()
            }
        }
    }
}
