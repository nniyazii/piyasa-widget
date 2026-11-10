package com.piyasa.widget.config

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import com.piyasa.widget.data.Actions
import com.piyasa.widget.data.appStore
import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.Category
import com.piyasa.widget.model.Display
import com.piyasa.widget.model.FormulaEngine
import com.piyasa.widget.model.WidgetConfig
import com.piyasa.widget.ui.ChangeChip
import com.piyasa.widget.ui.PiyasaTheme
import com.piyasa.widget.ui.SectionHeader
import com.piyasa.widget.widget.PiyasaWidget
import com.piyasa.widget.work.RefreshWorker
import kotlinx.coroutines.launch

/** Her widget örneği için gösterilecek kalemleri seçme ekranı. */
class WidgetConfigActivity : ComponentActivity() {

    private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        appWidgetId = intent?.extras?.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
            ?: AppWidgetManager.INVALID_APPWIDGET_ID
        setResult(Activity.RESULT_CANCELED, resultIntent())
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }
        setContent {
            PiyasaTheme {
                ConfigScreen(appWidgetId, onSave = ::save, onCancel = { finish() })
            }
        }
    }

    private fun resultIntent() = Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)

    private fun save(config: WidgetConfig) {
        lifecycleScope.launch {
            Actions.setWidgetConfig(applicationContext, appWidgetId, config)
            runCatching {
                val glanceId = GlanceAppWidgetManager(applicationContext).getGlanceIdBy(appWidgetId)
                PiyasaWidget().update(applicationContext, glanceId)
            }
            RefreshWorker.runNow(applicationContext)
            setResult(Activity.RESULT_OK, resultIntent())
            finish()
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ConfigScreen(appWidgetId: Int, onSave: (WidgetConfig) -> Unit, onCancel: () -> Unit) {
    val context = LocalContext.current
    val state by context.appStore.data.collectAsStateWithLifecycle(initialValue = null)
    val s = state

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Widget içeriği") },
                navigationIcon = { IconButton(onClick = onCancel) { Icon(Icons.Default.Close, "Vazgeç") } },
            )
        },
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            if (s == null) {
                CircularProgressIndicator(Modifier.align(Alignment.Center))
            } else {
                ConfigBody(s, s.widgetConfig(appWidgetId), onSave)
            }
        }
    }
}

@Composable
private fun ConfigBody(state: AppState, initial: WidgetConfig, onSave: (WidgetConfig) -> Unit) {
    var title by remember { mutableStateOf(initial.title) }
    var showSpark by remember { mutableStateOf(initial.showSpark) }
    var showSubtitle by remember { mutableStateOf(initial.showSubtitle) }
    val selected = remember { mutableStateListOf<String>().apply { addAll(initial.keys.filter { it in state.allKeys }) } }
    val engine = remember(state) { FormulaEngine(state) }

    Column(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(bottom = 16.dp)) {
            item {
                Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    OutlinedTextField(title, { title = it.take(24) }, Modifier.fillMaxWidth(), singleLine = true, label = { Text("Başlık") })
                    ToggleRow("Mini grafik (geniş widget)", showSpark) { showSpark = it }
                    ToggleRow("Alt satırda sembol / formül", showSubtitle) { showSubtitle = it }
                }
            }
            item { SectionHeader("Widget'ta gösterilenler (${selected.size})") }
            if (selected.isEmpty()) {
                item {
                    Text(
                        "Aşağıdan gösterge veya formül ekleyin.",
                        Modifier.padding(16.dp),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            itemsIndexed(selected.toList(), key = { _, k -> "sel_$k" }) { index, key ->
                val item = Display.item(state, engine, key)
                Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(item?.title ?: key, style = MaterialTheme.typography.bodyMedium)
                        Text(item?.valueText ?: "", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (item != null) ChangeChip(item.changeText, item.direction)
                    IconButton(enabled = index > 0, onClick = { selected.add(index - 1, selected.removeAt(index)) }) {
                        Icon(Icons.Default.KeyboardArrowUp, "Yukarı")
                    }
                    IconButton(enabled = index < selected.lastIndex, onClick = { selected.add(index + 1, selected.removeAt(index)) }) {
                        Icon(Icons.Default.KeyboardArrowDown, "Aşağı")
                    }
                    IconButton(onClick = { selected.removeAt(index) }) { Icon(Icons.Default.Close, "Çıkar") }
                }
            }

            val groups: List<Pair<String, List<String>>> =
                listOf("Formüller" to state.formulas.map { it.key }) +
                    Category.entries.map { c -> c.label to state.instruments.filter { it.category == c }.map { it.key } }
            groups.forEach { (label, keys) ->
                val available = keys.filter { it !in selected }
                if (available.isEmpty()) return@forEach
                item(key = "grp_$label") { SectionHeader("Ekle · $label") }
                available.forEach { key ->
                    item(key = "add_$key") {
                        Row(
                            Modifier.fillMaxWidth().clickable { selected.add(key) }.padding(horizontal = 16.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(state.titleOf(key), Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                            Text(key, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Icon(Icons.Default.Add, null, Modifier.padding(start = 8.dp), tint = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }
        }
        Button(
            onClick = { onSave(WidgetConfig(title.ifBlank { "Piyasalar" }, selected.toList(), showSpark, showSubtitle)) },
            modifier = Modifier.fillMaxWidth().padding(16.dp),
        ) { Text("Kaydet") }
    }
}

@Composable
private fun ToggleRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().clickable { onChange(!checked) }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Switch(checked = checked, onCheckedChange = onChange)
    }
}
