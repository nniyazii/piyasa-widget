package com.piyasa.widget

import android.app.Application
import com.piyasa.widget.data.appStore
import com.piyasa.widget.model.Migrations
import com.piyasa.widget.work.RefreshWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class PiyasaApp : Application() {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun onCreate() {
        super.onCreate()
        scope.launch {
            val minutes = appStore.updateData { Migrations.apply(it) }.refreshMinutes
            RefreshWorker.schedule(this@PiyasaApp, minutes)
        }
    }
}
