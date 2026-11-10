package com.piyasa.widget.ui

import android.content.Context
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.TextButton
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.piyasa.widget.data.Actions
import com.piyasa.widget.data.appStore
import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.Category
import com.piyasa.widget.model.Display
import com.piyasa.widget.model.Formula
import com.piyasa.widget.model.FormulaEngine
import com.piyasa.widget.model.Reorder
import com.piyasa.widget.model.WidgetConfig
import com.piyasa.widget.widget.WidgetPins
import sh.calvin.reorderable.ReorderableItem
import sh.calvin.reorderable.rememberReorderableLazyListState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import com.piyasa.widget.work.RefreshWorker
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { PiyasaTheme { MainScreen() } }
    }
}

/** Composer'ı açan hedef: yeni (null) ya da düzenlenen formül. */
private data class ComposeTarget(val formula: Formula?)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainScreen() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val state by context.appStore.data.collectAsStateWithLifecycle(initialValue = null)
    var composing by remember { mutableStateOf<ComposeTarget?>(null) }
    var showSettings by remember { mutableStateOf(false) }
    // Dinamik listeler: düzenlenen (yeni ise state'te yok) ve görüntülenen
    var editingScreen by remember { mutableStateOf<ScreenEditTarget?>(null) }
    var viewingScreen by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) { RefreshWorker.runNow(context) }

    val s = state
    // Katmanlar açıkken geri tuşu en üsttekini kapatır
    BackHandler(enabled = composing != null || editingScreen != null || viewingScreen != null) {
        when {
            editingScreen != null -> editingScreen = null
            composing != null -> composing = null
            else -> viewingScreen = null
        }
    }

    Box(Modifier.fillMaxSize()) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Piyasa", fontWeight = FontWeight.Bold)
                        if (s != null) {
                            Text(statusText(s), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                },
                actions = {
                    if (s?.refreshing == true) {
                        CircularProgressIndicator(Modifier.size(20.dp).padding(end = 4.dp), strokeWidth = 2.dp)
                        Spacer(Modifier.size(12.dp))
                    } else {
                        IconButton(onClick = { RefreshWorker.runNow(context) }) { Icon(Icons.Default.Refresh, "Yenile") }
                    }
                    IconButton(onClick = { showSettings = true }) { Icon(Icons.Default.Settings, "Ayarlar") }
                },
            )
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { composing = ComposeTarget(null) }, shape = CircleShape) {
                Icon(Icons.Default.Add, "Sembol veya formül ekle")
            }
        },
    ) { padding ->
        if (s == null) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@Scaffold
        }
        Box(Modifier.fillMaxSize().padding(padding)) {
            WatchList(
                state = s,
                onOpenScreen = { viewingScreen = it },
                onEditScreen = { editingScreen = ScreenEditTarget(it) },
                onDeleteScreen = { id -> scope.launch { Actions.deleteScreen(context, id) } },
                onEdit = { composing = ComposeTarget(it) },
                onRemove = { key ->
                    scope.launch { if (s.formula(key) != null) Actions.deleteFormula(context, key) else Actions.removeInstrument(context, key) }
                },
                onReorder = { groupId, keys ->
                    scope.launch {
                        when (groupId) {
                            ListGroup.FORMULAS -> Actions.reorderFormulas(context, keys)
                            ListGroup.SCREENS -> Actions.reorderScreens(context, keys)
                            else -> Actions.reorderInstruments(context, keys)
                        }
                    }
                },
                onPinScreen = { scr -> scope.launch { pinWidget(context, WidgetConfig.forScreen(scr)) } },
                onPinGroup = { title, keys -> scope.launch { pinWidget(context, WidgetConfig.forGroup(title, keys)) } },
            )
        }
        if (showSettings) {
            Dialog(onDismissRequest = { showSettings = false }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface) {
                    Column {
                        TopAppBar(
                            title = { Text("Ayarlar") },
                            navigationIcon = { IconButton(onClick = { showSettings = false }) { Icon(Icons.Default.ArrowBack, "Geri") } },
                        )
                        SettingsScreen(s)
                    }
                }
            }
        }
    }
    // Ekle ekranı: listenin üstünde tam ekran katman (Dialog değil; gezinme çubuğu ve klavye boşlukları doğru)
    val target = composing
    if (target != null && s != null) {
        ComposerScreen(
            baseState = s,
            editing = target.formula,
            onClose = { composing = null },
            onAddInstrument = { ins -> scope.launch { Actions.addInstrument(context, ins) } },
            onUndoInstrument = { ins -> scope.launch { Actions.removeInstrument(context, ins.key) } },
            onSaveFormula = { f, originalKey, needed ->
                scope.launch {
                    needed.forEach { Actions.addInstrument(context, it) }
                    Actions.upsertFormula(context, f, originalKey)
                }
            },
            onDeleteFormula = { key -> scope.launch { Actions.deleteFormula(context, key) }; composing = null },
            onCreateScreen = { composing = null; editingScreen = ScreenEditTarget(null) },
        )
    }
    // Dinamik liste sonuçları
    val viewing = viewingScreen?.let { id -> s?.screen(id) }
    if (viewing != null && s != null) {
        ScreenResultsView(
            state = s,
            screen = viewing,
            onClose = { viewingScreen = null },
            onEdit = { editingScreen = ScreenEditTarget(viewing) },
            onRefresh = { scope.launch { Actions.runScreen(context, viewing.id) } },
            onAdd = { row -> scope.launch { Actions.addInstrument(context, row.toInstrument(s)) } },
            onPinWidget = { scope.launch { pinWidget(context, WidgetConfig.forScreen(viewing)) } },
        )
    }
    // Dinamik liste düzenleyici
    val screenTarget = editingScreen
    if (screenTarget != null && s != null) {
        ScreenEditor(
            state = s,
            initial = screenTarget.screen,
            onClose = { editingScreen = null },
            onSave = { scr ->
                editingScreen = null
                viewingScreen = scr.id
                scope.launch { Actions.upsertScreen(context, scr) }
            },
            onDelete = { id -> editingScreen = null; viewingScreen = null; scope.launch { Actions.deleteScreen(context, id) } },
            runner = { scr -> com.piyasa.widget.data.Repository.runScreen(scr, s) },
        )
    }
    }
}

private data class ScreenEditTarget(val screen: com.piyasa.widget.model.Screen?)

private fun statusText(s: AppState): String = when {
    s.refreshing -> "Güncelleniyor…"
    s.lastRefresh == 0L -> s.lastError ?: "Henüz veri yok"
    else -> {
        val t = SimpleDateFormat("d MMM HH:mm", Locale.forLanguageTag("tr-TR")).format(Date(s.lastRefresh))
        if (s.lastError != null) "$t · ${s.lastError}" else "Son güncelleme $t"
    }
}

/** Listedeki sıralanabilir grup: formüller, tek kategori ya da dinamik listeler. */
internal data class ListGroup(val id: String, val label: String, val keys: List<String>) {
    /** LazyColumn öğe anahtarı (formül ve gösterge anahtarları zaten benzersiz). */
    fun itemKey(k: String) = if (id == SCREENS) "scr_$k" else k
    fun keyOf(itemKey: Any): String? {
        val s = itemKey as? String ?: return null
        val k = if (id == SCREENS) s.takeIf { it.startsWith("scr_") }?.removePrefix("scr_") ?: return null else s
        return k.takeIf { it in keys }
    }

    companion object {
        const val FORMULAS = "f"
        const val SCREENS = "s"

        fun of(state: AppState): List<ListGroup> =
            listOf(ListGroup(FORMULAS, "Hesaplamalar", state.formulas.map { it.key })) +
                Category.entries.map { c -> ListGroup("c_" + c.name, c.label, state.instruments.filter { it.category == c }.map { it.key }) } +
                ListGroup(SCREENS, "Dinamik listeler", state.screens.map { it.id })
    }
}

/**
 * Tek liste: önce hesaplamalar (formüller), sonra kategoriye göre semboller, en altta dinamik listeler.
 * Dokun: aç · Uzun bas ve sürükle: grup içinde sırala · Uzun bas ve bırak: menü.
 */
@Composable
internal fun WatchList(
    state: AppState,
    onEdit: (Formula) -> Unit,
    onRemove: (String) -> Unit,
    onReorder: (groupId: String, keys: List<String>) -> Unit = { _, _ -> },
    onOpenScreen: (String) -> Unit = {},
    onEditScreen: (com.piyasa.widget.model.Screen) -> Unit = {},
    onDeleteScreen: (String) -> Unit = {},
    onPinScreen: (com.piyasa.widget.model.Screen) -> Unit = {},
    onPinGroup: (title: String, keys: List<String>) -> Unit = { _, _ -> },
) {
    val context = LocalContext.current
    val haptic = androidx.compose.ui.platform.LocalHapticFeedback.current
    val engine = remember(state) { FormulaEngine(state) }
    if (state.instruments.isEmpty() && state.formulas.isEmpty() && state.screens.isEmpty()) {
        Column(Modifier.fillMaxSize().padding(32.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Listen boş", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(6.dp))
            Text("+ ile sembol ara ya da formül yaz.", textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        return
    }
    // Sürüklerken sıra yerelde tutulur (anında tepki); bırakınca kaydedilir.
    val base = remember(state.formulas, state.instruments, state.screens) { ListGroup.of(state) }
    var groups by remember(base) { mutableStateOf(base) }
    var movedGroup by remember { mutableStateOf<String?>(null) }
    val listState = rememberLazyListState()
    val reorder = rememberReorderableLazyListState(listState) { from, to ->
        val g = groups.indexOfFirst { it.keyOf(from.key) != null }
        if (g < 0 || groups[g].keyOf(to.key) == null) return@rememberReorderableLazyListState // yalnızca kendi grubunda
        val grp = groups[g]
        val a = grp.keys.indexOf(grp.keyOf(from.key))
        val b = grp.keys.indexOf(grp.keyOf(to.key))
        groups = groups.toMutableList().also { it[g] = grp.copy(keys = Reorder.move(grp.keys, a, b)) }
        movedGroup = grp.id
        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
    }
    // Uzun basıp bırakınca (sürüklemeden) menü açılır; sürüklendiyse yeni sıra kaydedilir.
    fun dragStopped(openMenu: () -> Unit) {
        val id = movedGroup
        movedGroup = null
        if (id == null) openMenu() else groups.firstOrNull { it.id == id }?.let { onReorder(it.id, it.keys) }
    }

    LazyColumn(state = listState, contentPadding = PaddingValues(bottom = 96.dp)) {
        groups.forEach { grp ->
            if (grp.keys.isEmpty()) return@forEach
            item(key = "h_${grp.id}") {
                GroupHeader(grp, pinnable = grp.id != ListGroup.SCREENS) { onPinGroup(grp.label, grp.keys) }
            }
            if (grp.id == ListGroup.SCREENS) {
                items(grp.keys, key = { grp.itemKey(it) }) { id ->
                    val scr = state.screen(id) ?: return@items
                    ReorderableItem(reorder, key = grp.itemKey(id)) { dragging ->
                        var menu by remember { mutableStateOf(false) }
                        DragSurface(dragging) {
                            Box {
                                ScreenListRow(
                                    state, scr,
                                    Modifier.clickable { onOpenScreen(scr.id) }
                                        .longPressDraggableHandle(
                                            onDragStarted = { haptic.performHapticFeedback(HapticFeedbackType.LongPress) },
                                            onDragStopped = { dragStopped { menu = true } },
                                        ),
                                )
                                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                                    DropdownMenuItem(text = { Text("Ana ekrana widget olarak ekle") }, onClick = { menu = false; onPinScreen(scr) })
                                    DropdownMenuItem(text = { Text("Düzenle") }, onClick = { menu = false; onEditScreen(scr) })
                                    DropdownMenuItem(text = { Text("Sil", color = MaterialTheme.colorScheme.error) }, onClick = { menu = false; onDeleteScreen(scr.id) })
                                }
                            }
                        }
                    }
                }
            } else {
                items(grp.keys, key = { it }) { key ->
                    val item = Display.item(state, engine, key) ?: return@items
                    val formula = state.formula(key)
                    ReorderableItem(reorder, key = key) { dragging ->
                        var menu by remember { mutableStateOf(false) }
                        DragSurface(dragging) {
                            Box {
                                ValueRow(
                                    item,
                                    Modifier.clickable { if (item.tvUrl != null) openUrl(context, item.tvUrl) else formula?.let(onEdit) }
                                        .longPressDraggableHandle(
                                            onDragStarted = { haptic.performHapticFeedback(HapticFeedbackType.LongPress) },
                                            onDragStopped = { dragStopped { menu = true } },
                                        ),
                                    subtitle = formula?.let { f -> Tokens2.pretty(state, f.expression) } ?: item.subtitle,
                                )
                                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                                    if (formula != null) DropdownMenuItem(text = { Text("Düzenle") }, onClick = { menu = false; onEdit(formula) })
                                    if (item.tvUrl != null) DropdownMenuItem(text = { Text("TradingView'da aç") }, onClick = { menu = false; openUrl(context, item.tvUrl) })
                                    DropdownMenuItem(
                                        text = { Text(if (formula != null) "Sil" else "Kaldır", color = MaterialTheme.colorScheme.error) },
                                        onClick = { menu = false; onRemove(key) },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
        item(key = "hint") {
            Text(
                "Dokun: aç · Basılı tutup sürükle: sırala · Basılı tutup bırak: menü",
                Modifier.padding(16.dp),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

/** Sürüklenen satır hafifçe kalkar (gölge + yüzey rengi). */
@Composable
private fun DragSurface(dragging: Boolean, content: @Composable () -> Unit) {
    val elevation by androidx.compose.animation.core.animateDpAsState(if (dragging) 8.dp else 0.dp, label = "drag")
    Surface(
        shadowElevation = elevation,
        color = if (dragging) MaterialTheme.colorScheme.surfaceContainerHigh else MaterialTheme.colorScheme.surface,
        content = content,
    )
}

/** Grup başlığı; sağda grubu ana ekrana widget olarak ekleyen menü. */
@Composable
private fun GroupHeader(grp: ListGroup, pinnable: Boolean, onPin: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    Box {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { SectionHeader(grp.label) }
            if (pinnable) {
                IconButton(onClick = { menu = true }, modifier = Modifier.size(36.dp)) {
                    Icon(Icons.Default.MoreVert, "${grp.label} seçenekleri", Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }, offset = androidx.compose.ui.unit.DpOffset(200.dp, 0.dp)) {
            DropdownMenuItem(text = { Text("Ana ekrana widget olarak ekle") }, onClick = { menu = false; onPin() })
        }
    }
}

/** Dinamik liste satırı: ad · ilk eşleşenler · eşleşme sayısı. */
@Composable
private fun ScreenListRow(state: AppState, scr: com.piyasa.widget.model.Screen, modifier: Modifier) {
    val r = state.screenResults[scr.id]
    Row(modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(scr.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, maxLines = 1,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
            val rows = r?.rows.orEmpty()
            // Eşleşenlerin adları (listeyi açmadan bir bakışta); yoksa koşulun kendisi
            Text(
                if (rows.isNotEmpty()) rows.take(4).joinToString(", ") { it.name } + if (rows.size > 4) " …" else ""
                else scr.conditions.firstOrNull()?.let { com.piyasa.widget.model.ScreenEngine.describe(it) } ?: scr.summary(),
                style = MaterialTheme.typography.labelSmall,
                color = if (rows.isNotEmpty()) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.size(8.dp))
        Surface(shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp), color = MaterialTheme.colorScheme.primaryContainer) {
            Text(
                when { r == null -> "…"; r.error != null && r.rows.isEmpty() -> "!"; else -> "${r.rows.size}" },
                Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                color = MaterialTheme.colorScheme.onPrimaryContainer, fontWeight = FontWeight.Bold,
            )
        }
    }
}

/** Formül ifadesini insan diliyle gösterir: "ONS * USDTRY / OZ" → "Ons Altın × Dolar/TL ÷ OZ". */
internal object Tokens2 {
    /** Parantez içi boşluksuz: "(Dolar/TL + Euro/TL) ÷ 2", "% fark(Sertifika × 100; Gram Altın)". */
    fun pretty(state: AppState, expression: String): String {
        val tokens = com.piyasa.widget.formula.Tokens.tokenize(expression)
        return buildString {
            tokens.forEachIndexed { i, t ->
                val label = tokenLabel(state, t).removeSuffix(" (").let { if (com.piyasa.widget.formula.Tokens.isFunction(t)) "$it(" else it }
                val prev = tokens.getOrNull(i - 1)
                val glue = prev == null || prev == "(" || com.piyasa.widget.formula.Tokens.isFunction(prev) || t == ")" || t == ";"
                if (!glue) append(' ')
                append(label)
            }
        }
    }
}

@Composable
private fun SettingsScreen(state: AppState) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Otomatik yenileme", style = MaterialTheme.typography.titleSmall)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(15, 30, 60, 120).forEach { m ->
                FilterChip(
                    selected = state.refreshMinutes == m,
                    onClick = { scope.launch { Actions.setRefreshMinutes(context, m) } },
                    label = { Text(if (m < 60) "$m dk" else "${m / 60} sa") },
                )
            }
        }
        Text(
            "Android en sık 15 dakikada bir arka plan yenilemesine izin verir. Widget'taki ⟳ simgesiyle anında yenileyebilirsiniz.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        HorizontalDivider()
        Text("Widget", style = MaterialTheme.typography.titleSmall)
        Button(onClick = { scope.launch { pinWidget(context, null) } }) { Text("Ana ekrana widget ekle") }
        Text(
            "Her widget kendi içeriğine ve görünümüne sahiptir. Bir dinamik listeyi ya da listedeki bir grubu (Döviz, Hesaplamalar …) " +
                "doğrudan widget yapmak için listede ona uzun basın ya da başlığındaki ⋮ menüsünü kullanın. " +
                "Widget'a uzun basıp “Yeniden yapılandır” ile içerik (sürükleyerek sıralama), yazı boyutu, tema ve opaklık ayarlanır.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        OutlinedButton(onClick = { RefreshWorker.runNow(context) }) { Text("Şimdi yenile") }
        HorizontalDivider()
        Text("Liste", style = MaterialTheme.typography.titleSmall)
        var confirmReset by remember { mutableStateOf(false) }
        OutlinedButton(onClick = { confirmReset = true }) { Text("Varsayılan listeye dön") }
        Text(
            "Derli toplu hazır liste: döviz, altın ve gümüş, BIST, ABD endeksleri, Bitcoin, enflasyon ve faiz; " +
                "gram/çeyrek altın, sertifika primi, BIST ($), reel faiz gibi hesaplamalar.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (confirmReset) {
            AlertDialog(
                onDismissRequest = { confirmReset = false },
                title = { Text("Varsayılan listeye dön?") },
                text = {
                    Text(
                        "Listen ve formüllerin hazır listeyle değiştirilecek (${state.instruments.size} gösterge, " +
                            "${state.formulas.size} formül → ${AppState().instruments.size} gösterge, ${AppState().formulas.size} formül). " +
                            "Widget ayarların korunur. Bu işlem geri alınamaz.",
                    )
                },
                confirmButton = {
                    TextButton(onClick = { confirmReset = false; scope.launch { Actions.resetToDefaults(context) } }) {
                        Text("Değiştir", color = MaterialTheme.colorScheme.error)
                    }
                },
                dismissButton = { TextButton(onClick = { confirmReset = false }) { Text("Vazgeç") } },
            )
        }
        HorizontalDivider()
        Text("Veri kaynakları", style = MaterialTheme.typography.titleSmall)
        Text(
            "• TradingView: hisse, endeks, fon, sertifika, döviz, emtia, kripto ve ekonomik göstergeler. TradingView'da gördüğünüz her sembol (ALTIN.S1, GMSTR.F, TRHPI, BIST:THYAO…) aramayla eklenebilir. BIST verisi ~15 dk gecikmeli olabilir.\n" +
                "• TCMB gösterge kurları: tcmb.gov.tr (+ ekranında Gelişmiş bölümünden)\n\nBu uygulama yatırım tavsiyesi vermez.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(8.dp))
    }
}

/** Ana ekrana widget sabitler; [preset] verilirse widget bu içerikle gelir (ör. bir dinamik liste). */
private suspend fun pinWidget(context: Context, preset: WidgetConfig?) {
    if (!WidgetPins.request(context, preset)) {
        Toast.makeText(context, "Başlatıcınız desteklemiyor; ana ekrana uzun basıp Widget'lar menüsünden ekleyin.", Toast.LENGTH_LONG).show()
    }
}
