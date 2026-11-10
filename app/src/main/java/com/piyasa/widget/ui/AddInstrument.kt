package com.piyasa.widget.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.piyasa.widget.data.source.SearchHit
import com.piyasa.widget.data.source.YahooSource
import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.Catalog
import com.piyasa.widget.model.Category
import com.piyasa.widget.model.Instrument
import com.piyasa.widget.model.Source
import com.piyasa.widget.model.TradingView
import kotlinx.coroutines.delay
import java.util.Locale

private val tr = Locale.forLanguageTag("tr-TR")

@Composable
fun AddInstrumentDialog(state: AppState, onDismiss: () -> Unit, onAdd: (Instrument) -> Unit) {
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface) {
            AddInstrumentScreen(state, onDismiss, onAdd)
        }
    }
}

internal sealed interface SearchState {
    data object Idle : SearchState
    data object Loading : SearchState
    data class Done(val hits: List<SearchHit>) : SearchState
    data class Failed(val message: String) : SearchState
}

/**
 * Tam ekran gösterge ekleme: katalog + Yahoo Finance canlı arama + elle giriş.
 * Ekran açık kalır, birden fazla gösterge art arda eklenebilir.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddInstrumentScreen(
    state: AppState,
    onDismiss: () -> Unit,
    onAdd: (Instrument) -> Unit,
    initialQuery: String = "",
    searcher: suspend (String) -> List<SearchHit> = { YahooSource.search(it) },
) {
    var query by remember { mutableStateOf(initialQuery) }
    var filter by remember { mutableStateOf<Category?>(null) }
    val search = rememberSymbolSearch(query, searcher)
    var manualOpen by remember { mutableStateOf(false) }

    fun isAdded(ins: Instrument) = state.isTracked(ins)

    val needle = query.trim().lowercase(tr)
    val catalog = Catalog.all.filter { filter == null || it.category == filter }.filter { ins ->
        needle.isEmpty() || listOfNotNull(ins.name, ins.key, ins.symbol, ins.note, ins.category.label)
            .any { it.lowercase(tr).contains(needle) }
    }
    val hits = searchHitsToInstruments(search, state, filter)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Gösterge ekle") },
                navigationIcon = { IconButton(onClick = onDismiss) { Icon(Icons.Default.Close, "Kapat") } },
                actions = { TextButton(onClick = onDismiss) { Text("Bitti") } },
            )
        },
    ) { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(bottom = 32.dp)) {
            item {
                Column(Modifier.padding(horizontal = 16.dp)) {
                    OutlinedTextField(
                        query, { query = it }, Modifier.fillMaxWidth(), singleLine = true,
                        leadingIcon = { Icon(Icons.Default.Search, null) },
                        trailingIcon = { if (query.isNotEmpty()) IconButton(onClick = { query = "" }) { Icon(Icons.Default.Close, "Temizle") } },
                        placeholder = { Text("Ara: Aselsan, Apple, gümüş…") },
                        shape = RoundedCornerShape(28.dp),
                    )
                    Spacer(Modifier.height(8.dp))
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        item { FilterChip(selected = filter == null, onClick = { filter = null }, label = { Text("Tümü") }) }
                        items(Category.entries) { c ->
                            FilterChip(selected = filter == c, onClick = { filter = if (filter == c) null else c }, label = { Text(c.label) })
                        }
                    }
                }
            }

            // ---- Canlı arama sonuçları
            if (needle.length >= 2) {
                item { SectionHeader("Tüm piyasalarda") }
                when (val s = search) {
                    SearchState.Idle, SearchState.Loading -> item {
                        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                            Spacer(Modifier.width(10.dp))
                            Text("Aranıyor…", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    is SearchState.Failed -> item { Hint(s.message) }
                    is SearchState.Done -> {
                        if (hits.isEmpty()) item { Hint("Katalog dışında sonuç yok.") }
                        items(hits, key = { "h_${it.symbol}" }) { ins ->
                            PickRow(ins, isAdded(ins)) { onAdd(ins) }
                        }
                    }
                }
            }

            // ---- Katalog
            if (catalog.isNotEmpty()) {
                if (needle.isEmpty() && filter == null) {
                    Category.entries.forEach { cat ->
                        val list = catalog.filter { it.category == cat }
                        if (list.isEmpty()) return@forEach
                        item(key = "c_${cat.name}") { SectionHeader(cat.label) }
                        items(list, key = { "k_${it.key}" }) { ins -> PickRow(ins, isAdded(ins)) { onAdd(ins) } }
                    }
                } else {
                    item { SectionHeader(if (needle.isEmpty()) "Katalog" else "Katalogda") }
                    items(catalog, key = { "k_${it.key}" }) { ins -> PickRow(ins, isAdded(ins)) { onAdd(ins) } }
                }
            } else if (needle.isNotEmpty() && needle.length < 2) {
                item { Hint("En az 2 harf yazın.") }
            }

            // ---- Elle giriş
            item {
                Card(
                    Modifier.fillMaxWidth().padding(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                ) {
                    Column(Modifier.padding(14.dp)) {
                        Row(Modifier.fillMaxWidth().clickable { manualOpen = !manualOpen }, verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text("Listede yok mu?", style = MaterialTheme.typography.titleSmall)
                                Text("Sembolü elle girin (Yahoo, spot metal, TCMB)", style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Text(if (manualOpen) "Gizle" else "Aç", color = MaterialTheme.colorScheme.primary)
                        }
                        if (manualOpen) {
                            Spacer(Modifier.height(10.dp))
                            ManualForm(state, ::isAdded, onAdd)
                        }
                    }
                }
            }
        }
    }
}

/** Yazarken gecikmeli Yahoo araması. */
@Composable
internal fun rememberSymbolSearch(query: String, searcher: suspend (String) -> List<SearchHit>): SearchState {
    var search by remember { mutableStateOf<SearchState>(SearchState.Idle) }
    LaunchedEffect(query) {
        val q = query.trim()
        if (q.length < 2) {
            search = SearchState.Idle
            return@LaunchedEffect
        }
        delay(350) // yazarken her harfte istek atma
        search = SearchState.Loading
        search = try {
            SearchState.Done(searcher(q))
        } catch (e: Exception) {
            if (e is kotlinx.coroutines.CancellationException) throw e
            SearchState.Failed("Arama yapılamadı. Bağlantıyı kontrol edin.")
        }
    }
    return search
}

/** Zaten izleme listesinde mi (aynı kaynak + sembol ya da aynı anahtar + sembol). */
internal fun AppState.isTracked(ins: Instrument) = instruments.any {
    it.symbol.equals(ins.symbol, true) && (it.source == ins.source || it.key == ins.key)
}

/** Arama sonuçlarını, katalogda olanları ayıklayarak enstrümana çevirir. */
internal fun searchHitsToInstruments(search: SearchState, state: AppState, filter: Category?): List<Instrument> {
    val catalogSymbols = Catalog.all.map { it.symbol.uppercase() }.toSet()
    return (search as? SearchState.Done)?.hits.orEmpty()
        .filter { it.symbol.uppercase() !in catalogSymbols }
        .map { Catalog.fromSymbol(it.symbol, Source.YAHOO, it.name, state.allKeys, it.quoteType) to it }
        .filter { (ins, _) -> filter == null || ins.category == filter }
        .map { (ins, hit) -> ins.copy(note = listOfNotNull(hit.typeLabel, hit.exchange).joinToString(" · ").ifEmpty { null }) }
}

@Composable
internal fun Hint(text: String) {
    Text(text, Modifier.padding(horizontal = 16.dp, vertical = 10.dp), style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
fun CategoryBadge(category: Category, size: Int = 36) {
    val color = when (category) {
        Category.US -> Color(0xFF3B82F6)
        Category.TR -> Color(0xFFE11D48)
        Category.COMMODITY -> Color(0xFFD97706)
        Category.FX -> Color(0xFF10B981)
        Category.CRYPTO -> Color(0xFF8B5CF6)
    }
    Box(
        Modifier.size(size.dp).background(color.copy(alpha = 0.16f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(category.short, color = color, fontSize = if (category.short.length > 2) 10.sp else 11.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
internal fun PickRow(ins: Instrument, added: Boolean, onAdd: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(enabled = !added, onClick = onAdd).padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CategoryBadge(ins.category)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(ins.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                listOfNotNull(ins.symbol, ins.note).joinToString(" · "),
                style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(8.dp))
        if (added) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 12.dp)) {
                Icon(Icons.Default.Check, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(4.dp))
                Text("Ekli", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            }
        } else {
            FilledTonalButton(onClick = onAdd, contentPadding = PaddingValues(horizontal = 12.dp), modifier = Modifier.height(34.dp)) {
                Icon(Icons.Default.Add, null, Modifier.size(16.dp))
                Spacer(Modifier.width(4.dp))
                Text("Ekle")
            }
        }
    }
}

@Composable
private fun ManualForm(state: AppState, isAdded: (Instrument) -> Boolean, onAdd: (Instrument) -> Unit) {
    var source by remember { mutableStateOf(Source.YAHOO) }
    var symbol by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var category by remember { mutableStateOf<Category?>(null) }
    var tvSymbol by remember { mutableStateOf("") }

    val guessed = if (symbol.isBlank()) null else Catalog.fromSymbol(symbol, source, name, state.allKeys)
    val draft = guessed?.copy(category = category ?: guessed.category, tvSymbol = tvSymbol.ifBlank { null })

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf(Source.YAHOO to "Yahoo", Source.GOLD_API to "Spot metal", Source.TCMB to "TCMB").forEach { (s, label) ->
                FilterChip(selected = source == s, onClick = { source = s }, label = { Text(label) })
            }
        }
        OutlinedTextField(
            symbol, { symbol = it.trim() }, Modifier.fillMaxWidth(), singleLine = true,
            label = { Text("Sembol") },
            placeholder = {
                Text(when (source) {
                    Source.YAHOO -> "ASELS.IS, NVDA, SI=F, GBPTRY=X"
                    Source.GOLD_API -> "XAU, XAG, XPT, XPD, HG"
                    Source.TCMB -> "USD:ForexSelling"
                })
            },
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
        )
        OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), singleLine = true, label = { Text("Görünen ad (opsiyonel)") })
        if (draft != null) {
            Text("Kategori", style = MaterialTheme.typography.labelMedium)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                items(Category.entries) { c ->
                    FilterChip(selected = draft.category == c, onClick = { category = c }, label = { Text(c.label) })
                }
            }
            OutlinedTextField(
                tvSymbol, { tvSymbol = it.trim() }, Modifier.fillMaxWidth(), singleLine = true,
                label = { Text("TradingView sembolü (opsiyonel)") },
                placeholder = { Text(TradingView.symbolOf(draft) ?: "BIST:ASELS") },
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                CategoryBadge(draft.category, 28)
                Spacer(Modifier.width(8.dp))
                Text(
                    "${draft.name} · formül anahtarı ${draft.key}",
                    Modifier.weight(1f), style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
                val added = isAdded(draft)
                FilledTonalButton(enabled = !added, onClick = { onAdd(draft); symbol = ""; name = ""; tvSymbol = ""; category = null }) {
                    Text(if (added) "Ekli" else "Ekle")
                }
            }
        }
    }
}
