package com.piyasa.widget.ui

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
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

private enum class Tab(val label: String) { MARKETS("Piyasalar"), FORMULAS("Formüller"), SETTINGS("Ayarlar") }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainScreen() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val state by context.appStore.data.collectAsStateWithLifecycle(initialValue = null)
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var showAdd by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<FormulaEditTarget?>(null) }

    LaunchedEffect(Unit) {
        RefreshWorker.runNow(context)
    }

    val s = state
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
                        IconButton(onClick = { RefreshWorker.runNow(context) }) {
                            Icon(Icons.Default.Refresh, contentDescription = "Yenile")
                        }
                    }
                },
            )
        },
        bottomBar = {
            NavigationBar {
                Tab.entries.forEachIndexed { i, t ->
                    NavigationBarItem(
                        selected = tab == i,
                        onClick = { tab = i },
                        icon = {
                            Icon(
                                when (t) { Tab.MARKETS -> Icons.Default.Home; Tab.FORMULAS -> Icons.Default.List; Tab.SETTINGS -> Icons.Default.Settings },
                                contentDescription = null,
                            )
                        },
                        label = { Text(t.label) },
                    )
                }
            }
        },
        floatingActionButton = {
            when (Tab.entries[tab]) {
                Tab.MARKETS -> FloatingActionButton(onClick = { showAdd = true }) { Icon(Icons.Default.Add, "Ekle") }
                Tab.FORMULAS -> FloatingActionButton(onClick = { editing = FormulaEditTarget(null) }) { Icon(Icons.Default.Add, "Formül ekle") }
                Tab.SETTINGS -> Unit
            }
        },
    ) { padding ->
        if (s == null) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@Scaffold
        }
        Box(Modifier.fillMaxSize().padding(padding)) {
            when (Tab.entries[tab]) {
                Tab.MARKETS -> MarketsScreen(
                    state = s,
                    onRemove = { key -> scope.launch { Actions.removeInstrument(context, key) } },
                    onMove = { key, d -> scope.launch { Actions.moveInstrument(context, key, d) } },
                )
                Tab.FORMULAS -> FormulasScreen(
                    state = s,
                    onEdit = { editing = FormulaEditTarget(it) },
                    onMove = { key, d -> scope.launch { Actions.moveFormula(context, key, d) } },
                )
                Tab.SETTINGS -> SettingsScreen(s)
            }
        }
        if (showAdd) {
            AddInstrumentDialog(
                state = s,
                onDismiss = { showAdd = false },
                onAdd = { ins -> scope.launch { Actions.addInstrument(context, ins) }; showAdd = false },
            )
        }
        editing?.let { target ->
            FormulaEditorDialog(
                state = s,
                original = target.formula,
                onDismiss = { editing = null },
                onSave = { f -> scope.launch { Actions.upsertFormula(context, f, target.formula?.key) }; editing = null },
                onDelete = { key -> scope.launch { Actions.deleteFormula(context, key) }; editing = null },
            )
        }
    }
}

private data class FormulaEditTarget(val formula: Formula?)

private fun statusText(s: AppState): String = when {
    s.refreshing -> "Güncelleniyor…"
    s.lastRefresh == 0L -> s.lastError ?: "Henüz veri yok"
    else -> {
        val t = SimpleDateFormat("d MMM HH:mm", Locale.forLanguageTag("tr-TR")).format(Date(s.lastRefresh))
        if (s.lastError != null) "$t · ${s.lastError}" else "Son güncelleme $t"
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun MarketsScreen(state: AppState, onRemove: (String) -> Unit, onMove: (String, Int) -> Unit) {
    val context = LocalContext.current
    val engine = remember(state) { FormulaEngine(state) }
    LazyColumn(contentPadding = PaddingValues(bottom = 88.dp)) {
        Category.entries.forEach { cat ->
            val list = state.instruments.filter { it.category == cat }
            if (list.isEmpty()) return@forEach
            item(key = "h_${cat.name}") { SectionHeader(cat.label) }
            items(list, key = { it.key }) { ins ->
                val item = Display.item(state, engine, ins.key) ?: return@items
                var menu by remember { mutableStateOf(false) }
                Box {
                    ValueRow(item, Modifier.combinedClickable(onClick = { openUrl(context, item.tvUrl) }, onLongClick = { menu = true }))
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        DropdownMenuItem(text = { Text("Yukarı taşı") }, onClick = { menu = false; onMove(ins.key, -1) })
                        DropdownMenuItem(text = { Text("Aşağı taşı") }, onClick = { menu = false; onMove(ins.key, 1) })
                        DropdownMenuItem(text = { Text("Kaldır", color = MaterialTheme.colorScheme.error) }, onClick = { menu = false; onRemove(ins.key) })
                    }
                }
            }
        }
        item {
            Text(
                "Dokun: TradingView'da aç · Uzun bas: sırala / kaldır. Anahtarlar (ör. USDTRY) formüllerde değişken olarak kullanılır.",
                Modifier.padding(16.dp),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun FormulasScreen(state: AppState, onEdit: (Formula) -> Unit, onMove: (String, Int) -> Unit) {
    val context = LocalContext.current
    val engine = remember(state) { FormulaEngine(state) }
    LazyColumn(contentPadding = PaddingValues(bottom = 88.dp)) {
        item { SectionHeader("Formüller") }
        items(state.formulas, key = { it.key }) { f ->
            val item = Display.item(state, engine, f.key) ?: return@items
            var menu by remember { mutableStateOf(false) }
            Box {
                ValueRow(
                    item,
                    Modifier.combinedClickable(onClick = { onEdit(f) }, onLongClick = { menu = true }),
                    subtitle = "${f.key} = ${f.expression}",
                )
                DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(text = { Text("Düzenle") }, onClick = { menu = false; onEdit(f) })
                    if (item.tvUrl != null) {
                        DropdownMenuItem(text = { Text("TradingView'da aç") }, onClick = { menu = false; openUrl(context, item.tvUrl) })
                    }
                    DropdownMenuItem(text = { Text("Yukarı taşı") }, onClick = { menu = false; onMove(f.key, -1) })
                    DropdownMenuItem(text = { Text("Aşağı taşı") }, onClick = { menu = false; onMove(f.key, 1) })
                }
            }
        }
        item {
            ElevatedCard(Modifier.fillMaxWidth().padding(16.dp)) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Formül dili", style = MaterialTheme.typography.titleSmall)
                    Text(FORMULA_HELP, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

const val FORMULA_HELP = """Operatörler: + − * / ^ ( )   Ondalık: nokta (31.1)
Değişkenler: enstrüman ve formül anahtarları (USDTRY, ONS, GRAM_ALTIN…)
Sabit: OZ = 31,1035 (troy ons → gram)
Fonksiyonlar: min, max, avg, sum, abs, round(x; n), sqrt, pow, ln, log
Kıyas: pct(a; b) = a'nın b'ye göre % farkı · prev(x) önceki kapanış · chg(x) günlük % değişim
Örnek: ONS * USDTRY / OZ   ·   XU100 / USDTRY   ·   pct(EURUSD; 1.10)"""

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
            "Her widget kendi gösterge listesine sahiptir. Widget'a uzun basıp “Ayarlar / Yeniden yapılandır” ile içeriğini değiştirebilirsiniz. Yükseklik 1 satır ise yatay bant, daha büyükse liste; genişlik arttıkça mini grafik ve çift sütun açılır.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        OutlinedButton(onClick = { RefreshWorker.runNow(context) }) { Text("Şimdi yenile") }
        HorizontalDivider()
        Text("Veri kaynakları", style = MaterialTheme.typography.titleSmall)
        Text(
            "• Endeks, hisse, döviz, enerji: Yahoo Finance (resmi olmayan uç nokta; BIST ~15 dk gecikmeli)\n" +
                "• Spot altın/gümüş/platin/paladyum/bakır: gold-api.com (günlük değişim, uygulamanın önceki gün gördüğü son fiyata göre hesaplanır)\n" +
                "• TCMB gösterge kurları: tcmb.gov.tr\n\nBu uygulama yatırım tavsiyesi vermez.",
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
