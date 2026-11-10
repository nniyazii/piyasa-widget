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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.piyasa.widget.data.source.SearchHit
import com.piyasa.widget.data.source.TradingViewSource
import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.Catalog
import com.piyasa.widget.model.Category
import com.piyasa.widget.model.Fmt
import com.piyasa.widget.model.Instrument
import com.piyasa.widget.model.Source
import com.piyasa.widget.model.TradingView
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.util.Locale

private val tr = Locale.forLanguageTag("tr-TR")

internal sealed interface SearchState {
    data object Idle : SearchState
    data object Loading : SearchState
    data class Done(val hits: List<SearchHit>) : SearchState
    data class Failed(val message: String) : SearchState
}

/** Arama sonucu: eklenecek gösterge + (varsa) canlı fiyatı. */
internal data class Candidate(val instrument: Instrument, val price: Double?, val changePct: Double?)

/** Katalogda Türkçe ad, anahtar kelime veya kodla eşleşenler. */
internal fun catalogMatches(needle: String): List<Instrument> {
    val n = needle.trim().lowercase(tr)
    if (n.isEmpty()) return emptyList()
    val code = TradingViewSource.normalizeCode(needle)
    return Catalog.all.filter { ins ->
        val hay = listOfNotNull(ins.name, ins.key, ins.symbol, ins.note, Catalog.keywords[ins.key]).joinToString(" ").lowercase(tr)
        hay.contains(n) || (code != null && (ins.key == code || ins.symbol.substringAfter(':') == code))
    }
}

/** Varsayılan arama: TradingView + katalog eşleşmelerinin fiyatları aynı anda. */
internal suspend fun defaultSearch(q: String): List<SearchHit> =
    TradingViewSource.search(q, alsoTickers = catalogMatches(q).filter { it.source == Source.TRADINGVIEW }.map { it.symbol })

/** Katalog (Türkçe ad ve anahtar kelimelerle) + TradingView sonuçları; tekrarsız, fiyatlı. */
internal fun candidates(state: AppState, needle: String, search: SearchState, filter: Category?): List<Candidate> {
    if (needle.isEmpty()) return emptyList()
    val code = TradingViewSource.normalizeCode(needle)
    val hits = (search as? SearchState.Done)?.hits.orEmpty()
    val bySymbol = hits.associateBy { it.symbol.uppercase() }
    val fromCatalog = catalogMatches(needle).map { ins ->
        val h = bySymbol[ins.symbol.uppercase()]
        Candidate(ins, h?.price, h?.changePct)
    }
    val catalogSymbols = fromCatalog.map { it.instrument.symbol.uppercase() }.toSet() + Catalog.all.map { it.symbol.uppercase() }
    val keys = state.allKeys.toMutableSet()
    val fromSearch = hits.filter { it.symbol.uppercase() !in catalogSymbols }.map { h ->
        val ins = if (h.isTradingView) Catalog.fromTradingView(h, keys) else Catalog.fromSymbol(h.symbol, Source.YAHOO, h.name, keys, h.quoteType)
        keys += ins.key
        Candidate(ins, h.price, h.changePct)
    }
    // Kesin kod eşleşmesi en üstte
    return (fromCatalog + fromSearch)
        .filter { filter == null || it.instrument.category == filter }
        .sortedByDescending { code != null && it.instrument.symbol.substringAfter(':').equals(code, true) }
}

/** Yazarken gecikmeli arama. */
@Composable
internal fun rememberSymbolSearch(query: String, searcher: suspend (String) -> List<SearchHit>): SearchState {
    var search by remember { mutableStateOf<SearchState>(SearchState.Idle) }
    LaunchedEffect(query) {
        val q = query.trim()
        if (q.length < 2) {
            search = SearchState.Idle
            return@LaunchedEffect
        }
        delay(300) // yazarken her harfte istek atma
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

/** Zaten izleme listesinde mi (aynı sembol). */
internal fun AppState.isTracked(ins: Instrument) = instruments.any {
    it.symbol.equals(ins.symbol, true) && (it.source == ins.source || it.key == ins.key)
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
        Category.ECONOMY -> Color(0xFF0EA5E9)
        Category.WORLD -> Color(0xFF64748B)
    }
    Box(
        Modifier.size(size.dp).background(color.copy(alpha = 0.16f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(category.short, color = color, fontSize = if (category.short.length > 2) 10.sp else 11.sp, fontWeight = FontWeight.Bold)
    }
}

/**
 * Bir sonuç satırı: dokununca eklenir. Sağda canlı fiyat ve değişim.
 * @param insert formül yazılırken: satır formüle girer (sağda "↵").
 */
@Composable
internal fun PickRow(c: Candidate, added: Boolean, insert: Boolean = false, onAdd: () -> Unit) {
    val ins = c.instrument
    val isFormula = ins.symbol.startsWith("ƒ")
    Row(
        Modifier.fillMaxWidth().clickable(enabled = !added || insert, onClick = onAdd).padding(horizontal = 16.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (isFormula || ins.key == "OZ") {
            Box(
                Modifier.size(36.dp).background(MaterialTheme.colorScheme.tertiaryContainer, CircleShape),
                contentAlignment = Alignment.Center,
            ) { Text(if (isFormula) "ƒ" else "oz", color = MaterialTheme.colorScheme.onTertiaryContainer, fontWeight = FontWeight.Bold) }
        } else {
            CategoryBadge(ins.category)
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(ins.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                listOfNotNull(ins.symbol, ins.note).joinToString(" · "),
                style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        if (c.price != null) {
            Spacer(Modifier.width(8.dp))
            Column(horizontalAlignment = Alignment.End) {
                Text(Fmt.value(c.price, ins.decimals, ins.prefix, ins.suffix), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                val dir = when { c.changePct == null -> 0; c.changePct > 0.005 -> 1; c.changePct < -0.005 -> -1; else -> 0 }
                Text(Fmt.change(c.changePct), style = MaterialTheme.typography.labelSmall, color = directionColor(dir))
            }
        }
        Spacer(Modifier.width(12.dp))
        if (insert) {
            Box(
                Modifier.size(32.dp).background(MaterialTheme.colorScheme.tertiaryContainer, CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Text("↵", color = MaterialTheme.colorScheme.onTertiaryContainer, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            }
        } else {
            Box(
                Modifier.size(32.dp).background(
                    if (added) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.primaryContainer, CircleShape,
                ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    if (added) Icons.Default.Check else Icons.Default.Add,
                    contentDescription = if (added) "Ekli" else "Ekle",
                    Modifier.size(18.dp),
                    tint = if (added) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onPrimaryContainer,
                )
            }
        }
    }
}

@Composable
internal fun ManualForm(state: AppState, isAdded: (Instrument) -> Boolean, onAdd: (Instrument) -> Unit) {
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
                    Source.TRADINGVIEW -> "BIST:ALTIN"
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
