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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.piyasa.widget.data.source.SearchHit
import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.Catalog
import com.piyasa.widget.model.Category
import com.piyasa.widget.model.Condition
import com.piyasa.widget.model.Field
import com.piyasa.widget.model.Fmt
import com.piyasa.widget.model.Instrument
import com.piyasa.widget.model.Op
import com.piyasa.widget.model.Screen
import com.piyasa.widget.model.ScreenCurrency
import com.piyasa.widget.model.ScreenEngine
import com.piyasa.widget.model.ScreenResult
import com.piyasa.widget.model.ScreenRow
import com.piyasa.widget.model.ScreenSort
import com.piyasa.widget.model.ScreenTemplates
import com.piyasa.widget.model.Universe
import kotlinx.coroutines.delay
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import kotlin.math.abs

private val trLoc = Locale.forLanguageTag("tr-TR")

// ======================================================================= düzenleyici

/**
 * Dinamik liste düzenleyici (tam ekran katman). Şablonla başla, koşulları cümle gibi kur,
 * önizlemede sonuçları canlı gör.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ScreenEditor(
    state: AppState,
    initial: Screen?,
    onClose: () -> Unit,
    onSave: (Screen) -> Unit,
    onDelete: ((String) -> Unit)?,
    runner: suspend (Screen) -> ScreenResult,
    livePreview: Boolean = true,
) {
    var screen by remember {
        mutableStateOf(
            initial ?: Screen(
                id = "s_" + UUID.randomUUID().toString().take(8), name = "Yeni liste", universe = Universe.BIST,
                conditions = listOf(Condition(Field.PRICE, Op.LTE, Field.LOW_52W, 5.0)),
            ),
        )
    }
    val isNew = initial == null || state.screen(initial.id) == null
    var preview by remember { mutableStateOf<ScreenResult?>(null) }
    var running by remember { mutableStateOf(false) }

    if (livePreview) {
        LaunchedEffect(screen.copy(name = "")) {
            delay(700) // ayarlar değiştikçe her seferinde tarama yapma
            running = true
            preview = runCatching { runner(screen) }.getOrElse { ScreenResult(System.currentTimeMillis(), error = it.message) }
            running = false
        }
    }

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding()) {
            Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 12.dp, top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onClose) { Icon(Icons.Default.Close, "Kapat") }
                Text(if (isNew) "Yeni dinamik liste" else "Dinamik liste", Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
                Button(onClick = { onSave(screen) }, enabled = screen.name.isNotBlank()) { Text("Kaydet") }
            }
            LazyColumn(Modifier.weight(1f).fillMaxWidth(), contentPadding = PaddingValues(bottom = 24.dp)) {
                if (isNew) {
                    item { SectionHeader("Şablonlar") }
                    item {
                        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            items(ScreenTemplates.all) { t ->
                                AssistChip(onClick = { screen = t.copy(id = screen.id) }, label = { Text(t.name) })
                            }
                        }
                    }
                }
                item {
                    OutlinedTextField(
                        screen.name, { screen = screen.copy(name = it.take(40)) },
                        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), singleLine = true, label = { Text("Ad") },
                    )
                }

                // ---- Nerede
                item { SectionHeader("Nerede aransın?") }
                item {
                    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Segmented(Universe.entries.map { it.label }, screen.universe.ordinal) {
                            screen = screen.copy(universe = Universe.entries[it])
                        }
                        Text(screen.universe.hint, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (screen.universe == Universe.MY_LIST) {
                            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                item { FilterChip(selected = screen.category == null, onClick = { screen = screen.copy(category = null) }, label = { Text("Tümü") }) }
                                items(Category.entries.filter { c -> state.instruments.any { it.category == c } }) { c ->
                                    FilterChip(selected = screen.category == c, onClick = { screen = screen.copy(category = c) }, label = { Text(c.label) })
                                }
                            }
                            Row(Modifier.fillMaxWidth().clickable { screen = screen.copy(onlyStocks = !screen.onlyStocks) }, verticalAlignment = Alignment.CenterVertically) {
                                Text("Yalnızca hisseler (endeks, döviz, emtia hariç)", Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                                Switch(checked = screen.onlyStocks, onCheckedChange = { screen = screen.copy(onlyStocks = it) })
                            }
                        }
                    }
                }

                // ---- Para birimi
                item { SectionHeader("Para birimi") }
                item {
                    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Segmented(ScreenCurrency.entries.map { if (it == ScreenCurrency.LOCAL) "Yerel (₺ / $)" else "USD cinsinden" }, screen.currency.ordinal) {
                            screen = screen.copy(currency = ScreenCurrency.entries[it])
                        }
                        if (screen.currency == ScreenCurrency.USD) {
                            Text(
                                "TL fiyatlar Dolar/TL'ye bölünür. 5 yıllık dip/zirve, her ayın kendi kuruyla USD'ye çevrilmiş geçmişten hesaplanır; " +
                                    "ortalamalar ve 52 hafta değerleri bugünkü kurla çevrilir (oranları değişmez).",
                                style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }

                // ---- Koşullar
                item { SectionHeader("Koşullar") }
                itemsIndexed(screen.conditions) { i, c ->
                    ConditionCard(
                        c,
                        onChange = { nc -> screen = screen.copy(conditions = screen.conditions.toMutableList().also { it[i] = nc }) },
                        onRemove = if (screen.conditions.size > 1) ({ screen = screen.copy(conditions = screen.conditions.filterIndexed { j, _ -> j != i }) }) else null,
                    )
                }
                item {
                    Column(Modifier.padding(horizontal = 16.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = { screen = screen.copy(conditions = screen.conditions + Condition(Field.RSI, Op.LT, null, 30.0)) }) {
                            Icon(Icons.Default.Add, null, Modifier.size(18.dp)); Spacer(Modifier.width(4.dp)); Text("Koşul ekle")
                        }
                        if (screen.conditions.size > 1) {
                            Segmented(listOf("Tüm koşullar", "Herhangi biri"), if (screen.matchAll) 0 else 1) { screen = screen.copy(matchAll = it == 0) }
                        }
                    }
                }

                // ---- Sıralama
                item { SectionHeader("Sırala") }
                item {
                    LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        items(ScreenSort.entries) { s -> FilterChip(selected = screen.sort == s, onClick = { screen = screen.copy(sort = s) }, label = { Text(s.label) }) }
                        item { Spacer(Modifier.width(8.dp)) }
                        items(listOf(10, 20, 30, 50)) { n -> FilterChip(selected = screen.limit == n, onClick = { screen = screen.copy(limit = n) }, label = { Text("En fazla $n") }) }
                    }
                }

                // ---- Önizleme
                item {
                    Row(Modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text("Önizleme", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary, letterSpacing = 0.8.sp)
                        Spacer(Modifier.weight(1f))
                        val p = preview
                        when {
                            running -> CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                            p?.error != null -> Text(p.error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.labelMedium)
                            p != null -> Text("${p.rows.size} eşleşme", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                        }
                    }
                }
                val p = preview
                if (p != null) {
                    p.note?.let { n -> item { Hint(n) } }
                    if (p.rows.isEmpty() && p.error == null && !running) item { Hint("Şu an koşulları sağlayan sembol yok. Yüzdeyi genişletmeyi deneyin.") }
                    items(p.rows.take(10), key = { "p_" + it.symbol }) { row -> ScreenRowItem(row, screen, state, onAdd = null) }
                } else if (!livePreview) {
                    item { Hint("Önizleme kapalı") }
                }
                if (!isNew && onDelete != null) {
                    item {
                        HorizontalDivider(Modifier.padding(top = 16.dp))
                        TextButton(onClick = { onDelete(screen.id) }, Modifier.padding(horizontal = 8.dp)) {
                            Text("Listeyi sil", color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        }
    }
}

/** Koşul: [alan] [op] [sayı | alan ± %] — altında okunabilir cümle. */
@Composable
private fun ConditionCard(c: Condition, onChange: (Condition) -> Unit, onRemove: (() -> Unit)?) {
    Surface(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
        shape = RoundedCornerShape(16.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(ScreenEngine.describe(c), Modifier.weight(1f), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                if (onRemove != null) IconButton(onClick = onRemove) { Icon(Icons.Default.Close, "Koşulu sil") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                FieldPicker(c.left, Modifier.weight(1f)) { onChange(c.copy(left = it)) }
                OpPicker(c.op) { onChange(c.copy(op = it)) }
            }
            Segmented(listOf("Başka bir değere göre", "Sayıya göre"), if (c.right != null) 0 else 1) {
                onChange(if (it == 0) c.copy(right = c.right ?: Field.SMA200, value = 0.0) else c.copy(right = null, value = 30.0))
            }
            if (c.right != null) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    FieldPicker(c.right, Modifier.weight(1f)) { onChange(c.copy(right = it)) }
                    NumberField(c.value, "± %", Modifier.width(96.dp)) { onChange(c.copy(value = it)) }
                }
                Text(
                    // Alan adlarına ek getirmeden (dil bilgisi), çarpanla: "= 52 hafta en düşük × 1,05"
                    if (c.value == 0.0) "= ${c.right.label}"
                    else "= ${c.right.label} × ${Fmt.number(1 + c.value / 100.0, if ((c.value * 10) % 10.0 == 0.0) 2 else 3)}",
                    style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            } else {
                if (c.left.kind == com.piyasa.widget.model.FieldKind.MONEY) {
                    // Piyasa değeri milyar cinsinden girilir (BIST ₺, ABD $)
                    NumberField(c.value / 1e9, "Milyar", Modifier.fillMaxWidth()) { onChange(c.copy(value = it * 1e9)) }
                } else {
                    NumberField(c.value, "Değer", Modifier.fillMaxWidth()) { onChange(c.copy(value = it)) }
                }
            }
        }
    }
}

@Composable
private fun FieldPicker(field: Field, modifier: Modifier = Modifier, onPick: (Field) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box(modifier) {
        Surface(onClick = { open = true }, shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.primaryContainer) {
            Row(Modifier.padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(field.label, Modifier.weight(1f), color = MaterialTheme.colorScheme.onPrimaryContainer, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Icon(Icons.Default.ArrowDropDown, null, tint = MaterialTheme.colorScheme.onPrimaryContainer)
            }
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            Field.entries.forEach { f ->
                DropdownMenuItem(
                    text = {
                        Column {
                            Text(f.label)
                            if (f.needsHistory) Text("Geçmiş veriden (Yahoo)", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    },
                    onClick = { open = false; onPick(f) },
                    trailingIcon = { if (f == field) Icon(Icons.Default.Check, null) },
                )
            }
        }
    }
}

@Composable
private fun OpPicker(op: Op, onPick: (Op) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        Surface(onClick = { open = true }, shape = CircleShape, color = MaterialTheme.colorScheme.secondaryContainer) {
            Box(Modifier.size(44.dp), contentAlignment = Alignment.Center) {
                Text(op.symbol, fontSize = 22.sp, color = MaterialTheme.colorScheme.onSecondaryContainer)
            }
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            listOf(Op.LT to "küçük", Op.LTE to "küçük veya eşit", Op.GT to "büyük", Op.GTE to "büyük veya eşit").forEach { (o, l) ->
                DropdownMenuItem(text = { Text("${o.symbol}  $l") }, onClick = { open = false; onPick(o) })
            }
        }
    }
}

@Composable
private fun NumberField(value: Double, label: String, modifier: Modifier, onValue: (Double) -> Unit) {
    var text by remember(value) { mutableStateOf(if (value % 1.0 == 0.0) value.toLong().toString() else value.toString().replace('.', ',')) }
    OutlinedTextField(
        text,
        { t ->
            text = t.filter { it.isDigit() || it == ',' || it == '.' || it == '-' }.take(12)
            text.replace(',', '.').toDoubleOrNull()?.let(onValue)
        },
        modifier, singleLine = true, label = { Text(label) },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Segmented(options: List<String>, selected: Int, onSelect: (Int) -> Unit) {
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        options.forEachIndexed { i, label ->
            SegmentedButton(selected = i == selected, onClick = { onSelect(i) }, shape = SegmentedButtonDefaults.itemShape(i, options.size), icon = {}) {
                Text(label, maxLines = 1, fontSize = 13.sp, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

// ======================================================================= sonuçlar

/** Bir sonuç satırının koşula uzaklığı: "5 yıl en düşük: %4,2 üstünde" · "RSI (14): 24,1". */
internal fun metricText(row: ScreenRow, screen: Screen): String? {
    val c = screen.conditions.firstOrNull() ?: return null
    val s = row.score ?: return null
    if (c.right == null) return "${c.left.label}: ${Fmt.number(s, if (abs(s) >= 100) 0 else 1)}"
    val pct = (s - 1.0) * 100.0
    return when {
        abs(pct) < 0.05 -> "${c.right.label} seviyesinde"
        pct > 0 -> "${c.right.label}: %${Fmt.number(pct, 1)} üstünde"
        else -> "${c.right.label}: %${Fmt.number(-pct, 1)} altında"
    }
}

@Composable
internal fun ScreenRowItem(row: ScreenRow, screen: Screen, state: AppState, onAdd: ((ScreenRow) -> Unit)?) {
    val context = LocalContext.current
    val tracked = state.instruments.any { it.symbol.equals(row.symbol, true) }
    val (pre, suf) = ScreenEngine.units(row.currency)
    val dir = when { row.change == null -> 0; row.change > 0.005 -> 1; row.change < -0.005 -> -1; else -> 0 }
    Row(
        Modifier.fillMaxWidth().clickable { openUrl(context, com.piyasa.widget.model.TradingView.chartUrl(row.symbol)) }
            .padding(start = 16.dp, end = 8.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(row.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                listOfNotNull(row.symbol, metricText(row, screen)).joinToString(" · "),
                style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(8.dp))
        Column(horizontalAlignment = Alignment.End) {
            Text(row.price?.let { Fmt.value(it, row.decimals, pre, suf) } ?: "—", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
            Text(Fmt.change(row.change), style = MaterialTheme.typography.labelSmall, color = directionColor(dir))
        }
        if (onAdd != null) {
            IconButton(onClick = { if (!tracked) onAdd(row) }, enabled = !tracked) {
                Icon(if (tracked) Icons.Default.Check else Icons.Default.Add, if (tracked) "Listende" else "Listeye ekle",
                    tint = if (tracked) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.primary)
            }
        }
    }
}

/** Sonuç satırını izleme listesine eklenecek göstergeye çevirir. */
internal fun ScreenRow.toInstrument(state: AppState): Instrument =
    Catalog.fromTradingView(
        SearchHit(symbol, name, if (symbol.startsWith("ECONOMICS:")) "economic" else "stock", symbol.substringBefore(':'), null,
            symbol.substringAfter(':'), price, change, null, currency),
        state.allKeys,
    ).let { if (currency == "USD" && it.category == Category.TR) it.copy(prefix = "", suffix = "₺") else it }

/** Dinamik liste sonuçları (tam ekran katman). */
@Composable
fun ScreenResultsView(
    state: AppState,
    screen: Screen,
    onClose: () -> Unit,
    onEdit: () -> Unit,
    onRefresh: () -> Unit,
    onAdd: (ScreenRow) -> Unit,
) {
    val result = state.screenResults[screen.id]
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp, top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onClose) { Icon(Icons.Default.Close, "Kapat") }
                Column(Modifier.weight(1f)) {
                    Text(screen.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(screen.summary(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(onClick = onRefresh) { Icon(Icons.Default.Refresh, "Yeniden tara") }
                IconButton(onClick = onEdit) { Icon(Icons.Default.Edit, "Düzenle") }
            }
            LazyColumn(Modifier.weight(1f)) {
                item {
                    Column(Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
                        screen.conditions.forEach { c ->
                            Text("• " + ScreenEngine.describe(c), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Medium)
                        }
                        val status = when {
                            result == null -> "Henüz taranmadı · yenileyin"
                            else -> "${result.rows.size} eşleşme · " +
                                SimpleDateFormat("d MMM HH:mm", trLoc).format(Date(result.time))
                        }
                        Text(status, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        result?.error?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error) }
                        result?.note?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                }
                if (result != null && result.rows.isEmpty() && result.error == null) {
                    item { Hint("Şu an koşulları sağlayan sembol yok.") }
                }
                items(result?.rows.orEmpty(), key = { "r_" + it.symbol }) { row -> ScreenRowItem(row, screen, state, onAdd) }
                item {
                    Text(
                        "Dokun: TradingView'da aç · + ile listene ekle. Liste her yenilemede kendiliğinden güncellenir.",
                        Modifier.padding(16.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
    }
}
