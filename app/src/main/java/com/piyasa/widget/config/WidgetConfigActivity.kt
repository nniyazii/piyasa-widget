package com.piyasa.widget.config

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.widget.FrameLayout
import android.widget.RemoteViews
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.compose
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import com.piyasa.widget.data.Actions
import com.piyasa.widget.data.appStore
import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.Category
import com.piyasa.widget.model.ChangeStyle
import com.piyasa.widget.model.Display
import com.piyasa.widget.model.FormulaEngine
import com.piyasa.widget.model.RowDensity
import com.piyasa.widget.model.WidgetConfig
import com.piyasa.widget.model.WidgetTheme
import com.piyasa.widget.ui.CategoryBadge
import com.piyasa.widget.ui.ChangeChip
import com.piyasa.widget.ui.PiyasaTheme
import com.piyasa.widget.ui.SectionHeader
import com.piyasa.widget.widget.PiyasaWidget
import com.piyasa.widget.work.RefreshWorker
import kotlinx.coroutines.launch
import java.util.Locale
import kotlin.math.min
import kotlin.math.roundToInt

/** Her widget örneği için içerik (göstergeler, bölümler) ve görünüm ayarları. */
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
        // Widget'ın ekrandaki gerçek boyutu (dikey yönde): önizleme bu boyutta çizilir.
        val opts = AppWidgetManager.getInstance(this).getAppWidgetOptions(appWidgetId)
        val w = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH).takeIf { it > 0 } ?: 320
        val h = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT).takeIf { it > 0 } ?: 190
        setContent {
            PiyasaTheme {
                val state by applicationContext.appStore.data.collectAsStateWithLifecycle(initialValue = null)
                val s = state
                if (s == null) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                } else {
                    WidgetEditor(s, s.widgetConfig(appWidgetId), DpSize(w.dp, h.dp), onSave = ::save, onCancel = { finish() })
                }
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

/**
 * Widget düzenleyici: üstte gerçek widget kodundan canlı önizleme, altta İçerik / Görünüm.
 * @param livePreview testlerde kapatılabilir.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WidgetEditor(
    state: AppState,
    initial: WidgetConfig,
    widgetSize: DpSize,
    onSave: (WidgetConfig) -> Unit,
    onCancel: () -> Unit,
    initialTab: Int = 0,
    livePreview: Boolean = true,
) {
    var cfg by remember { mutableStateOf(initial.copy(keys = initial.keys.filter { WidgetConfig.isSection(it) || it in state.allKeys })) }
    var tab by remember { mutableIntStateOf(initialTab) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Widget") },
                navigationIcon = { IconButton(onClick = onCancel) { Icon(Icons.Default.Close, "Vazgeç") } },
                actions = { TextButton(onClick = { onSave(cfg) }) { Text("Kaydet") } },
            )
        },
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            WidgetPreview(cfg, widgetSize, livePreview, state)
            TabRow(selectedTabIndex = tab) {
                Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("İçerik") })
                Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Görünüm") })
            }
            Box(Modifier.weight(1f)) {
                if (tab == 0) ContentTab(state, cfg) { cfg = it } else AppearanceTab(cfg) { cfg = it }
            }
            Button(onClick = { onSave(cfg) }, modifier = Modifier.fillMaxWidth().padding(16.dp)) { Text("Kaydet") }
        }
    }
}

// ------------------------------------------------------------------ canlı önizleme

@Composable
private fun WidgetPreview(cfg: WidgetConfig, size: DpSize, live: Boolean, state: AppState) {
    val context = LocalContext.current
    var views by remember { mutableStateOf<RemoteViews?>(null) }
    if (live) {
        LaunchedEffect(cfg, size, state.quotes, state.lastRefresh) {
            views = runCatching { PiyasaWidget(previewConfig = cfg).compose(context, size = size) }.getOrNull()
        }
    }
    BoxWithConstraints(
        Modifier
            .fillMaxWidth()
            .background(Brush.linearGradient(listOf(Color(0xFF2D3A4F), Color(0xFF4B5D78))))
            .padding(horizontal = 16.dp, vertical = 14.dp),
        contentAlignment = Alignment.Center,
    ) {
        // Sığdır: genişlik ve en fazla 230dp yükseklik
        val scale = min(1f, min(maxWidth.value / size.width.value, 230f / size.height.value))
        Box(Modifier.size(size.width * scale, size.height * scale)) {
            Box(
                Modifier
                    .wrapContentSize(Alignment.TopStart, unbounded = true)
                    .requiredSize(size)
                    .graphicsLayer(scaleX = scale, scaleY = scale, transformOrigin = TransformOrigin(0f, 0f)),
            ) {
                val v = views
                if (v != null) {
                    AndroidView(
                        factory = { FrameLayout(it) },
                        update = { frame ->
                            frame.removeAllViews()
                            runCatching { frame.addView(v.apply(frame.context, frame)) }
                        },
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    Box(Modifier.fillMaxSize().background(Color.White.copy(alpha = 0.12f), RoundedCornerShape(20.dp)))
                }
                // Önizlemede dokunuşlar widget aksiyonlarını tetiklemesin
                Box(Modifier.fillMaxSize().pointerInput(Unit) { awaitPointerEventScope { while (true) awaitPointerEvent().changes.forEach { it.consume() } } })
            }
        }
    }
}

// ------------------------------------------------------------------ İçerik

private val SECTION_SUGGESTIONS = listOf("Altın", "Döviz", "BIST", "ABD", "Emtia", "Kripto", "Ekonomi", "Hesaplamalar")

@Composable
private fun ContentTab(state: AppState, cfg: WidgetConfig, onChange: (WidgetConfig) -> Unit) {
    val entries = cfg.keys
    val engine = remember(state) { FormulaEngine(state) }
    var sectionDialog by remember { mutableStateOf<Int?>(null) } // -1 = yeni, >=0 = düzenlenen indeks
    var filter by remember { mutableStateOf("") }

    fun set(list: List<String>) = onChange(cfg.copy(keys = list))
    fun move(i: Int, d: Int) {
        val t = i + d
        if (t !in entries.indices) return
        set(entries.toMutableList().apply { add(t, removeAt(i)) })
    }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 16.dp)) {
        item {
            Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilledTonalButton(onClick = { sectionDialog = -1 }) {
                    Icon(Icons.Default.Add, null, Modifier.size(18.dp)); Spacer(Modifier.width(4.dp)); Text("Bölüm")
                }
                OutlinedButton(onClick = { set(autoSections(state, cfg.itemKeys)) }, enabled = cfg.itemKeys.isNotEmpty()) {
                    Text("Otomatik bölümle")
                }
                if (entries.any { WidgetConfig.isSection(it) }) {
                    TextButton(onClick = { set(cfg.itemKeys) }) { Text("Bölümsüz", maxLines = 1) }
                }
            }
        }
        if (entries.isEmpty()) {
            item {
                Text("Aşağıdan gösterge ekleyin.", Modifier.padding(16.dp), style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        itemsIndexed(entries, key = { i, k -> "e_${i}_$k" }) { i, k ->
            if (WidgetConfig.isSection(k)) {
                Row(
                    Modifier.fillMaxWidth().clickable { sectionDialog = i }.padding(start = 16.dp, end = 4.dp, top = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        WidgetConfig.sectionTitle(k).uppercase(Locale.forLanguageTag("tr-TR")),
                        Modifier.weight(1f), color = MaterialTheme.colorScheme.primary,
                        style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, letterSpacing = 0.8.sp,
                    )
                    EntryActions(i, entries.size, ::move) { set(entries.filterIndexed { j, _ -> j != i }) }
                }
            } else {
                val item = Display.item(state, engine, k)
                Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    val cat = state.instrument(k)?.category
                    if (cat != null) CategoryBadge(cat, 28) else Box(Modifier.size(28.dp).background(MaterialTheme.colorScheme.tertiaryContainer, RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) {
                        Text("ƒ", color = MaterialTheme.colorScheme.onTertiaryContainer, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.width(10.dp))
                    Column(Modifier.weight(1f)) {
                        Text(item?.title ?: k, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(item?.valueText ?: "", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (item != null) ChangeChip(item.changeText, item.direction)
                    EntryActions(i, entries.size, ::move) { set(entries.filterIndexed { j, _ -> j != i }) }
                }
            }
        }

        // ---- Ekle
        item {
            Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp)) {
                Text("Ekle", style = MaterialTheme.typography.titleSmall)
                Spacer(Modifier.height(6.dp))
                OutlinedTextField(
                    filter, { filter = it }, Modifier.fillMaxWidth(), singleLine = true,
                    leadingIcon = { Icon(Icons.Default.Search, null) }, placeholder = { Text("Listende ara") },
                    shape = RoundedCornerShape(28.dp),
                )
                Text(
                    "Listede olmayan bir sembol için uygulamada Piyasalar → + kullanın.",
                    Modifier.padding(start = 16.dp, top = 4.dp), style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        val needle = filter.trim().lowercase(Locale.forLanguageTag("tr-TR"))
        val groups: List<Pair<String, List<String>>> =
            listOf("Formüller" to state.formulas.map { it.key }) +
                Category.entries.map { c -> c.label to state.instruments.filter { it.category == c }.map { it.key } }
        groups.forEach { (label, keys) ->
            val available = keys.filter { it !in entries }.filter {
                needle.isEmpty() || state.titleOf(it).lowercase(Locale.forLanguageTag("tr-TR")).contains(needle) || it.lowercase().contains(needle)
            }
            if (available.isEmpty()) return@forEach
            item(key = "grp_$label") { SectionHeader(label) }
            items(available, key = { "add_$it" }) { key ->
                Row(
                    Modifier.fillMaxWidth().clickable { set(entries + key) }.padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(state.titleOf(key), Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                    Text(key, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Icon(Icons.Default.Add, null, Modifier.padding(start = 8.dp), tint = MaterialTheme.colorScheme.primary)
                }
            }
        }
    }

    sectionDialog?.let { idx ->
        val editing = idx >= 0
        var title by remember(idx) { mutableStateOf(if (editing) WidgetConfig.sectionTitle(entries[idx]) else "") }
        AlertDialog(
            onDismissRequest = { sectionDialog = null },
            title = { Text(if (editing) "Bölümü düzenle" else "Yeni bölüm") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(title, { title = it.take(24) }, Modifier.fillMaxWidth(), singleLine = true, label = { Text("Başlık") })
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        items(SECTION_SUGGESTIONS) { s -> AssistChip(onClick = { title = s }, label = { Text(s) }) }
                    }
                    if (!editing) {
                        Text("Bölüm listenin sonuna eklenir; oklarla yerini değiştirebilirsiniz.",
                            style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            },
            confirmButton = {
                TextButton(enabled = title.isNotBlank(), onClick = {
                    val e = WidgetConfig.section(title)
                    set(if (editing) entries.toMutableList().apply { this[idx] = e } else entries + e)
                    sectionDialog = null
                }) { Text("Tamam") }
            },
            dismissButton = { TextButton(onClick = { sectionDialog = null }) { Text("Vazgeç") } },
        )
    }
}

@Composable
private fun EntryActions(i: Int, size: Int, move: (Int, Int) -> Unit, remove: () -> Unit) {
    IconButton(enabled = i > 0, onClick = { move(i, -1) }) { Icon(Icons.Default.KeyboardArrowUp, "Yukarı") }
    IconButton(enabled = i < size - 1, onClick = { move(i, 1) }) { Icon(Icons.Default.KeyboardArrowDown, "Aşağı") }
    IconButton(onClick = remove) { Icon(Icons.Default.Close, "Çıkar") }
}

/** Göstergeleri kategoriye göre bölümler; formüller "Hesaplamalar" altında. Sıra, ilk görülme sırasıdır. */
internal fun autoSections(state: AppState, itemKeys: List<String>): List<String> {
    val groups = LinkedHashMap<String, MutableList<String>>()
    for (k in itemKeys) {
        val label = state.instrument(k)?.category?.label ?: "Hesaplamalar"
        groups.getOrPut(label) { mutableListOf() } += k
    }
    if (groups.size <= 1) return itemKeys
    return groups.flatMap { (label, keys) -> listOf(WidgetConfig.section(label)) + keys }
}

// ------------------------------------------------------------------ Görünüm

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AppearanceTab(cfg: WidgetConfig, onChange: (WidgetConfig) -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Setting("Yazı boyutu") {
                Segmented(WidgetConfig.TEXT_SCALES.map { it.second }, WidgetConfig.TEXT_SCALES.indexOfFirst { it.first == cfg.textScale }.coerceAtLeast(0)) {
                    onChange(cfg.copy(textScale = WidgetConfig.TEXT_SCALES[it].first))
                }
            }
        }
        item {
            Setting("Satır aralığı") {
                Segmented(RowDensity.entries.map { it.label }, cfg.density.ordinal) { onChange(cfg.copy(density = RowDensity.entries[it])) }
            }
        }
        item {
            Setting("Günlük değişim") {
                Segmented(ChangeStyle.entries.map { it.label }, cfg.changeStyle.ordinal) { onChange(cfg.copy(changeStyle = ChangeStyle.entries[it])) }
            }
        }
        item {
            Setting("Tema") {
                Segmented(WidgetTheme.entries.map { it.label }, cfg.theme.ordinal) { onChange(cfg.copy(theme = WidgetTheme.entries[it])) }
            }
        }
        item {
            Setting("Arka plan opaklığı · %${(cfg.opacity * 100).roundToInt()}") {
                Slider(value = cfg.opacity, onValueChange = { onChange(cfg.copy(opacity = (it * 20).roundToInt() / 20f)) }, valueRange = 0.2f..1f, steps = 15)
            }
        }
        item {
            Surface(shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)) {
                Column(Modifier.padding(horizontal = 14.dp, vertical = 6.dp)) {
                    Toggle("Başlık satırı", cfg.showHeader) { onChange(cfg.copy(showHeader = it)) }
                    if (cfg.showHeader) {
                        OutlinedTextField(cfg.title, { onChange(cfg.copy(title = it.take(24))) }, Modifier.fillMaxWidth().padding(bottom = 6.dp),
                            singleLine = true, label = { Text("Başlık") })
                        Toggle("Güncelleme saati", cfg.showTime) { onChange(cfg.copy(showTime = it)) }
                    }
                    Toggle("Mini grafik", cfg.showSpark) { onChange(cfg.copy(showSpark = it)) }
                    Toggle("Alt satırda sembol / formül", cfg.showSubtitle) { onChange(cfg.copy(showSubtitle = it)) }
                }
            }
        }
        item {
            TextButton(onClick = {
                onChange(WidgetConfig(title = cfg.title, keys = cfg.keys))
            }) { Text("Görünümü varsayılana döndür") }
        }
    }
}

@Composable
private fun Setting(label: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(label, style = MaterialTheme.typography.titleSmall)
        content()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Segmented(options: List<String>, selected: Int, onSelect: (Int) -> Unit) {
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        options.forEachIndexed { i, label ->
            SegmentedButton(
                selected = i == selected,
                onClick = { onSelect(i) },
                shape = SegmentedButtonDefaults.itemShape(i, options.size),
                icon = {},
            ) { Text(label, maxLines = 1, fontSize = 13.sp) }
        }
    }
}

@Composable
private fun Toggle(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().clickable { onChange(!checked) }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
        Switch(checked = checked, onCheckedChange = onChange)
    }
}
