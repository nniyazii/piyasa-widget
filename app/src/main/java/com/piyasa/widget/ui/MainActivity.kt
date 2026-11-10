package com.piyasa.widget.ui

import android.appwidget.AppWidgetManager
import android.content.ComponentName
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
import com.piyasa.widget.widget.PiyasaWidgetReceiver
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

    LaunchedEffect(Unit) { RefreshWorker.runNow(context) }

    val s = state
    // Ekle ekranı açıkken geri tuşu onu kapatır
    BackHandler(enabled = composing != null) { composing = null }

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
                onEdit = { composing = ComposeTarget(it) },
                onRemove = { key ->
                    scope.launch { if (s.formula(key) != null) Actions.deleteFormula(context, key) else Actions.removeInstrument(context, key) }
                },
                onMove = { key, d ->
                    scope.launch { if (s.formula(key) != null) Actions.moveFormula(context, key, d) else Actions.moveInstrument(context, key, d) }
                },
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
        )
    }
    }
}

private fun statusText(s: AppState): String = when {
    s.refreshing -> "Güncelleniyor…"
    s.lastRefresh == 0L -> s.lastError ?: "Henüz veri yok"
    else -> {
        val t = SimpleDateFormat("d MMM HH:mm", Locale.forLanguageTag("tr-TR")).format(Date(s.lastRefresh))
        if (s.lastError != null) "$t · ${s.lastError}" else "Son güncelleme $t"
    }
}

/** Tek liste: önce hesaplamalar (formüller), sonra kategoriye göre semboller. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun WatchList(
    state: AppState,
    onEdit: (Formula) -> Unit,
    onRemove: (String) -> Unit,
    onMove: (String, Int) -> Unit,
) {
    val context = LocalContext.current
    val engine = remember(state) { FormulaEngine(state) }
    if (state.instruments.isEmpty() && state.formulas.isEmpty()) {
        Column(Modifier.fillMaxSize().padding(32.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Listen boş", style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.height(6.dp))
            Text("+ ile sembol ara ya da formül yaz.", textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        return
    }
    val groups: List<Pair<String, List<String>>> =
        listOf("Hesaplamalar" to state.formulas.map { it.key }) +
            Category.entries.map { c -> c.label to state.instruments.filter { it.category == c }.map { it.key } }

    LazyColumn(contentPadding = PaddingValues(bottom = 96.dp)) {
        groups.forEach { (label, keys) ->
            if (keys.isEmpty()) return@forEach
            item(key = "h_$label") { SectionHeader(label) }
            items(keys, key = { it }) { key ->
                val item = Display.item(state, engine, key) ?: return@items
                val formula = state.formula(key)
                var menu by remember { mutableStateOf(false) }
                Box {
                    ValueRow(
                        item,
                        Modifier.combinedClickable(
                            onClick = { if (item.tvUrl != null) openUrl(context, item.tvUrl) else formula?.let(onEdit) },
                            onLongClick = { menu = true },
                        ),
                        subtitle = formula?.let { f -> Tokens2.pretty(state, f.expression) } ?: item.subtitle,
                    )
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        if (formula != null) DropdownMenuItem(text = { Text("Düzenle") }, onClick = { menu = false; onEdit(formula) })
                        if (item.tvUrl != null) DropdownMenuItem(text = { Text("TradingView'da aç") }, onClick = { menu = false; openUrl(context, item.tvUrl) })
                        DropdownMenuItem(text = { Text("Yukarı taşı") }, onClick = { menu = false; onMove(key, -1) })
                        DropdownMenuItem(text = { Text("Aşağı taşı") }, onClick = { menu = false; onMove(key, 1) })
                        DropdownMenuItem(
                            text = { Text(if (formula != null) "Sil" else "Kaldır", color = MaterialTheme.colorScheme.error) },
                            onClick = { menu = false; onRemove(key) },
                        )
                    }
                }
            }
        }
        item {
            Text(
                "Dokun: TradingView'da aç · Uzun bas: düzenle, sırala, kaldır",
                Modifier.padding(16.dp),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
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
        Button(onClick = { pinWidget(context) }) { Text("Ana ekrana widget ekle") }
        Text(
            "Her widget kendi içeriğine ve görünümüne sahiptir. Widget'a uzun basıp “Yeniden yapılandır” ile bölümler, yazı boyutu, tema ve opaklığı ayarlayabilirsiniz.",
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

private fun pinWidget(context: Context) {
    val mgr = AppWidgetManager.getInstance(context)
    if (mgr.isRequestPinAppWidgetSupported) {
        mgr.requestPinAppWidget(ComponentName(context, PiyasaWidgetReceiver::class.java), null, null)
    } else {
        Toast.makeText(context, "Başlatıcınız desteklemiyor; ana ekrana uzun basıp Widget'lar menüsünden ekleyin.", Toast.LENGTH_LONG).show()
    }
}
