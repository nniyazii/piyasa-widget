package com.piyasa.widget.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.piyasa.widget.formula.Formulas
import com.piyasa.widget.formula.Parser
import com.piyasa.widget.formula.Tokens
import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.Category
import com.piyasa.widget.model.Display
import com.piyasa.widget.model.Fmt
import com.piyasa.widget.model.Formula
import com.piyasa.widget.model.FormulaEngine
import com.piyasa.widget.model.TradingView
import com.piyasa.widget.model.Catalog
import com.piyasa.widget.model.Instrument
import com.piyasa.widget.data.source.SearchHit
import com.piyasa.widget.data.source.TradingViewSource
import java.util.Locale

private val trLocale = Locale.forLanguageTag("tr-TR")

/** Hazır kalıplar: kullanıcı yalnızca boşlukları (A, B) listeden seçer. */
private data class Template(
    val label: String,
    val hint: String,
    val slots: List<String>,
    val build: (List<String>) -> List<String>,
)

private fun templates(state: AppState): List<Template> {
    val hasUsd = state.instrument("USDTRY") != null
    return listOf(
        Template("A × B", "İki değeri çarp (ör. ons × kur)", listOf("1. değer", "2. değer")) { (a, b) -> listOf(a, "*", b) },
        Template("A ÷ B", "Oran / çapraz kur (ör. BIST ÷ Dolar)", listOf("Bölünen", "Bölen")) { (a, b) -> listOf(a, "/", b) },
        Template("% Fark", "A, B'den yüzde kaç farklı", listOf("Karşılaştırılan", "Referans")) { (a, b) -> listOf("pct(", a, ";", b, ")") },
        if (hasUsd) {
            Template("TL / gram", "USD/ons fiyatını TL/grama çevir", listOf("USD/ons fiyatı (ör. Ons Altın)")) { (a) -> listOf(a, "*", "USDTRY", "/", "OZ") }
        } else {
            Template("TL / gram", "USD/ons fiyatını TL/grama çevir", listOf("USD/ons fiyatı", "Dolar/TL kuru")) { (a, b) -> listOf(a, "*", b, "/", "OZ") }
        },
        Template("Günlük %", "Bir değerin günlük % değişimi", listOf("Değer")) { (a) -> listOf("chg(", a, ")") },
        Template("Ortalama", "İki değerin ortalaması", listOf("1. değer", "2. değer")) { (a, b) -> listOf("avg(", a, ";", b, ")") },
    )
}

private data class FunctionInfo(val token: String, val label: String, val desc: String)

private val functionInfos = listOf(
    FunctionInfo("pct(", "% fark (a; b)", "a'nın b'ye göre yüzde farkı"),
    FunctionInfo("chg(", "günlük % (x)", "x'in günlük yüzde değişimi"),
    FunctionInfo("prev(", "önceki (x)", "x'in önceki kapanış değeri"),
    FunctionInfo("min(", "en küçük (a; b; …)", ""),
    FunctionInfo("max(", "en büyük (a; b; …)", ""),
    FunctionInfo("avg(", "ortalama (a; b; …)", ""),
    FunctionInfo("round(", "yuvarla (x; basamak)", ""),
    FunctionInfo("abs(", "mutlak değer (x)", ""),
)

private fun tokenLabel(state: AppState, t: String): String = when {
    t == "*" -> "×"
    t == "/" -> "÷"
    t == "-" -> "−"
    t == "OZ" -> "OZ (31,10 g)"
    Tokens.isNumber(t) -> t.replace('.', ',')
    Tokens.isFunction(t) -> functionInfos.firstOrNull { it.token == t }?.label?.substringBefore(" (")?.plus(" (") ?: t
    Tokens.isVariable(t) -> state.titleOf(t)
    else -> t
}

private enum class Filter(val label: String, val category: Category?) {
    ALL("Tümü", null), FORMULA("Formüller", null),
    US("ABD", Category.US), TR("TR", Category.TR), COMMODITY("Emtia", Category.COMMODITY), FX("Döviz", Category.FX), CRYPTO("Kripto", Category.CRYPTO),
}

@Composable
fun FormulaBuilderDialog(
    state: AppState,
    original: Formula?,
    onDismiss: () -> Unit,
    onSave: (Formula) -> Unit,
    onDelete: (String) -> Unit,
    onAddInstrument: (Instrument) -> Unit,
) {
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface) {
            FormulaBuilderScreen(state, original, onDismiss, onSave, onDelete, onAddInstrument = onAddInstrument)
        }
    }
}

/** Tam ekran formül kurucusu (Dialog içinde açılır; önizleme testinde doğrudan çizilir). */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class, ExperimentalFoundationApi::class)
@Composable
fun FormulaBuilderScreen(
    baseState: AppState,
    original: Formula?,
    onDismiss: () -> Unit,
    onSave: (Formula) -> Unit,
    onDelete: (String) -> Unit,
    initialTemplate: Int? = null,
    initialSearch: String = "",
    onAddInstrument: (Instrument) -> Unit = {},
    searcher: suspend (String) -> List<SearchHit> = ::defaultSearch,
) {
    // Bu ekrandan yeni eklenen göstergeler, depo güncellenene kadar da formülde kullanılabilsin.
    val justAdded = remember { mutableStateListOf<Instrument>() }
    val state = remember(baseState, justAdded.toList()) {
        val missing = justAdded.filter { a -> baseState.instruments.none { it.key == a.key } }
        if (missing.isEmpty()) baseState else baseState.copy(instruments = baseState.instruments + missing)
    }
    var name by remember { mutableStateOf(original?.name ?: "") }
    var key by remember { mutableStateOf(original?.key ?: "") }
    var keyTouched by remember { mutableStateOf(original != null) }
    var decimals by remember { mutableStateOf((original?.decimals ?: 2).toString()) }
    var prefix by remember { mutableStateOf(original?.prefix ?: "") }
    var suffix by remember { mutableStateOf(original?.suffix ?: "") }
    var showDetails by remember { mutableStateOf(false) }

    val tokens = remember { mutableStateListOf<String>().apply { addAll(Tokens.tokenize(original?.expression ?: "")) } }
    var cursor by remember { mutableIntStateOf(tokens.size) }
    var textMode by remember { mutableStateOf(false) }
    var text by remember { mutableStateOf("") }

    var pending by remember { mutableStateOf(initialTemplate?.let { templates(state).getOrNull(it) }) }
    val filled = remember { mutableStateListOf<String>() }
    var numberInput by remember { mutableStateOf("") }
    var search by remember { mutableStateOf(initialSearch) }
    var filter by remember { mutableStateOf(Filter.ALL) }
    var fnMenu by remember { mutableStateOf(false) }

    fun insert(list: List<String>) {
        val c = cursor.coerceIn(0, tokens.size)
        tokens.addAll(c, list)
        cursor = c + list.size
    }

    /** Sembol / sayı seçildi: şablon bekliyorsa boşluğu doldurur, değilse imlece ekler. */
    fun pick(token: String) {
        val tpl = pending
        if (tpl != null) {
            filled += token
            if (filled.size == tpl.slots.size) {
                insert(tpl.build(filled.toList()))
                pending = null
                filled.clear()
            }
        } else {
            insert(listOf(token))
        }
    }

    val expression = if (textMode) text.trim() else Tokens.render(tokens)
    val dec = decimals.toIntOrNull() ?: 2
    val autoName = tokens.joinToString(" ") { tokenLabel(state, it) }.take(28)
    val effectiveName = name.ifBlank { autoName }
    val effectiveKey = if (keyTouched) Formulas.normalizeName(key) else Formulas.suggestKey(effectiveName)
    val otherKeys = state.allKeys.filter { it != original?.key }
    val keyError = when {
        effectiveName.isBlank() -> null
        !Formulas.isValidKey(effectiveKey) -> "Geçersiz anahtar (A-Z, 0-9, _)"
        effectiveKey in otherKeys -> "Bu anahtar kullanımda"
        else -> null
    }
    val candidate = Formula(effectiveKey.ifEmpty { "_ONIZLEME" }, effectiveName, expression, dec, prefix, suffix)
    val candidateState = remember(state, candidate) {
        state.copy(formulas = state.formulas.filter { it.key != original?.key } + candidate)
    }
    val preview = remember(candidateState) { FormulaEngine(candidateState).evaluateKey(candidate.key) }
    val tv = remember(candidateState) { TradingView.symbolFor(candidateState, candidate.key) }
    val parses = remember(expression) { runCatching { Parser.parse(expression) }.isSuccess }
    val canSave = expression.isNotBlank() && parses && keyError == null && effectiveName.isNotBlank() &&
        preview.error?.startsWith("Döngüsel") != true

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (original == null) "Yeni formül" else "Formülü düzenle") },
                navigationIcon = { IconButton(onClick = onDismiss) { Icon(Icons.Default.Close, "Vazgeç") } },
                actions = {
                    IconButton(onClick = {
                        if (textMode) {
                            tokens.clear(); tokens.addAll(Tokens.tokenize(text)); cursor = tokens.size
                        } else {
                            text = Tokens.render(tokens)
                        }
                        textMode = !textMode
                    }) { Icon(Icons.Default.Edit, if (textMode) "Görsel düzenleyici" else "Metin olarak düzenle") }
                    TextButton(
                        enabled = canSave,
                        onClick = { onSave(candidate.copy(key = effectiveKey, name = effectiveName, expression = expression)) },
                    ) { Text("Kaydet") }
                },
            )
        },
    ) { padding ->
        val engine = remember(state) { FormulaEngine(state) }
        val needle = search.trim().lowercase(trLocale)
        val liveSearch = rememberSymbolSearch(if (filter == Filter.FORMULA) "" else search, searcher)
        val candidates: List<String> = buildList {
            if (filter == Filter.ALL || filter == Filter.FORMULA) addAll(state.formulas.map { it.key }.filter { it != original?.key })
            if (filter != Filter.FORMULA) addAll(state.instruments.filter { filter.category == null || it.category == filter.category }.map { it.key })
        }.filter { k ->
            if (needle.isEmpty()) true
            else {
                val ins = state.instrument(k)
                listOfNotNull(k, state.titleOf(k), ins?.symbol, ins?.note).any { it.lowercase(trLocale).contains(needle) }
            }
        }

        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(bottom = 24.dp)) {
            // ---- Sonuç kartı
            item {
                Card(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer),
                ) {
                    Column(Modifier.padding(14.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(effectiveName.ifBlank { "Formül" }, Modifier.weight(1f), style = MaterialTheme.typography.labelLarge,
                                maxLines = 1, overflow = TextOverflow.Ellipsis)
                            if (preview.error == null && preview.value != null) {
                                val ch = preview.change
                                ChangeChip(Fmt.change(ch), if (ch == null) 0 else if (ch > 0.005) 1 else if (ch < -0.005) -1 else 0)
                            }
                        }
                        Text(
                            when {
                                expression.isBlank() -> "Aşağıdan sembol veya şablon seçin"
                                preview.error != null -> preview.error
                                else -> preview.value?.let { Fmt.value(it, dec, prefix, suffix) } ?: "—"
                            },
                            style = if (preview.error == null && expression.isNotBlank()) MaterialTheme.typography.headlineSmall else MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Bold,
                            color = if (preview.error != null && expression.isNotBlank()) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSecondaryContainer,
                        )
                        if (tv != null && preview.error == null) {
                            Text("TradingView: $tv", style = MaterialTheme.typography.labelSmall, fontFamily = FontFamily.Monospace,
                                color = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.7f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }

            // ---- Ad + ayrıntılar
            item {
                Column(Modifier.padding(horizontal = 16.dp)) {
                    OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), singleLine = true,
                        label = { Text("Ad") }, placeholder = { Text(autoName.ifBlank { "ör. Gram Altın" }) })
                    TextButton(onClick = { showDetails = !showDetails }) {
                        Text(if (showDetails) "Ayrıntıları gizle" else "Ayrıntılar: anahtar, ondalık, birim")
                    }
                    if (showDetails) {
                        OutlinedTextField(
                            value = effectiveKey, onValueChange = { key = it; keyTouched = true }, singleLine = true,
                            label = { Text("Anahtar (diğer formüllerde kullanılır)") }, isError = keyError != null,
                            supportingText = keyError?.let { { Text(it) } },
                            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(decimals, { decimals = it.filter(Char::isDigit).take(1) }, Modifier.weight(1f), singleLine = true,
                                label = { Text("Ondalık") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                            OutlinedTextField(prefix, { prefix = it.take(3) }, Modifier.weight(1f), singleLine = true, label = { Text("Ön ek") }, placeholder = { Text("$") })
                            OutlinedTextField(suffix, { suffix = it.take(3) }, Modifier.weight(1f), singleLine = true, label = { Text("Son ek") }, placeholder = { Text("₺") })
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            listOf("" to "yok", "₺" to "₺", "$" to "$", "€" to "€", "%" to "%").forEach { (sym, label) ->
                                FilterChip(selected = if (sym == "$") prefix == "$" else prefix.isEmpty() && suffix == sym, onClick = {
                                    if (sym == "$") { prefix = "$"; suffix = "" } else { prefix = ""; suffix = sym }
                                }, label = { Text(label) })
                            }
                        }
                    }
                }
            }

            // ---- İfade
            item { SectionHeader("Formül") }
            item {
                if (textMode) {
                    OutlinedTextField(
                        value = text, onValueChange = { text = it },
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                        textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                        minLines = 2,
                        supportingText = { Text("Metin modu. Görsel düzenleyiciye dönmek için ✎") },
                    )
                } else {
                    Surface(
                        Modifier.fillMaxWidth().padding(horizontal = 16.dp).heightIn(min = 56.dp),
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f),
                    ) {
                        FlowRow(
                            Modifier.padding(8.dp).clickable { cursor = tokens.size },
                            horizontalArrangement = Arrangement.spacedBy(4.dp),
                            verticalArrangement = Arrangement.spacedBy(6.dp),
                        ) {
                            if (tokens.isEmpty()) {
                                Cursor()
                                Text("boş", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(6.dp))
                            }
                            tokens.forEachIndexed { i, t ->
                                if (i == cursor) Cursor()
                                TokenChip(tokenLabel(state, t), kind(t)) { cursor = i + 1 }
                            }
                            if (tokens.isNotEmpty() && cursor >= tokens.size) Cursor()
                        }
                    }
                }
            }

            if (!textMode) {
                // ---- İşlem tuşları
                item {
                    Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                            listOf("+", "-", "*", "/", "(", ")").forEach { op ->
                                KeyButton(tokenLabel(state, op), Modifier.weight(1f)) { insert(listOf(op)) }
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                            IconButton(onClick = { cursor = (cursor - 1).coerceAtLeast(0) }) { Icon(Icons.Default.KeyboardArrowLeft, "Sola") }
                            IconButton(onClick = { cursor = (cursor + 1).coerceAtMost(tokens.size) }) { Icon(Icons.Default.KeyboardArrowRight, "Sağa") }
                            KeyButton("⌫", Modifier.weight(1f)) {
                                if (cursor > 0) { tokens.removeAt(cursor - 1); cursor-- }
                            }
                            KeyButton("Temizle", Modifier.weight(1.4f)) { tokens.clear(); cursor = 0 }
                            Box(Modifier.weight(1.4f)) {
                                KeyButton("ƒ Fonksiyon", Modifier.fillMaxWidth()) { fnMenu = true }
                                DropdownMenu(expanded = fnMenu, onDismissRequest = { fnMenu = false }) {
                                    functionInfos.forEach { f ->
                                        DropdownMenuItem(
                                            text = {
                                                Column {
                                                    Text(f.label)
                                                    if (f.desc.isNotEmpty()) Text(f.desc, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                                }
                                            },
                                            onClick = { fnMenu = false; insert(listOf(f.token)) },
                                        )
                                    }
                                    DropdownMenuItem(text = { Text("; (argüman ayırıcı)") }, onClick = { fnMenu = false; insert(listOf(";")) })
                                }
                            }
                        }
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            val num = Tokens.parseNumber(numberInput)
                            OutlinedTextField(
                                numberInput, { numberInput = it.filter { c -> c.isDigit() || c == ',' || c == '.' }.take(14) },
                                Modifier.weight(1f), singleLine = true, label = { Text("Sayı") }, placeholder = { Text("ör. 31,1035") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Done),
                                keyboardActions = KeyboardActions(onDone = { if (num != null) { pick(num); numberInput = "" } }),
                            )
                            FilledTonalButton(enabled = num != null, onClick = { pick(num!!); numberInput = "" }) { Text("Ekle") }
                        }
                    }
                }

                // ---- Şablonlar
                item { SectionHeader("Hızlı şablonlar") }
                item {
                    LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        items(templates(state)) { tpl ->
                            AssistChip(onClick = { pending = tpl; filled.clear() }, label = { Text(tpl.label) })
                        }
                    }
                }
                pending?.let { tpl ->
                    item {
                        Card(
                            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                        ) {
                            Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text("${tpl.label}: ${tpl.hint}", style = MaterialTheme.typography.labelMedium)
                                    val idx = filled.size
                                    Text(
                                        "Seçin → ${tpl.slots[idx]}" + if (filled.isNotEmpty()) "  (seçilen: ${filled.joinToString(", ") { tokenLabel(state, it) }})" else "",
                                        style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold,
                                    )
                                    Text("Aşağıdaki listeden bir sembol seçin veya sayı ekleyin", style = MaterialTheme.typography.labelSmall)
                                }
                                IconButton(onClick = { pending = null; filled.clear() }) { Icon(Icons.Default.Close, "Şablonu iptal et") }
                            }
                        }
                    }
                }

                // ---- Kaydırırken üstte kalan özet çubuğu
                stickyHeader(key = "bar") {
                    Surface(color = MaterialTheme.colorScheme.surface, shadowElevation = 3.dp, modifier = Modifier.fillMaxWidth()) {
                        Row(Modifier.padding(start = 16.dp, end = 4.dp, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    tokens.joinToString(" ") { tokenLabel(state, it) }.ifEmpty { "Formül boş" },
                                    style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis,
                                )
                                val tplNow = pending
                                Text(
                                    when {
                                        tplNow != null -> "${tplNow.label} · seçin → ${tplNow.slots[filled.size]}"
                                        expression.isBlank() -> "Bir sembole dokunun"
                                        preview.error != null -> preview.error
                                        else -> "= " + (preview.value?.let { Fmt.value(it, dec, prefix, suffix) } ?: "—") + "  " + Fmt.change(preview.change)
                                    },
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = when {
                                        tplNow != null -> MaterialTheme.colorScheme.primary
                                        preview.error != null && expression.isNotBlank() -> MaterialTheme.colorScheme.error
                                        else -> MaterialTheme.colorScheme.onSurface
                                    },
                                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                                )
                            }
                            IconButton(onClick = { if (cursor > 0) { tokens.removeAt(cursor - 1); cursor-- } }) { Text("⌫", fontSize = 18.sp) }
                        }
                    }
                }

                // ---- Sembol listesi
                item { SectionHeader("Semboller") }
                item {
                    Column(Modifier.padding(horizontal = 16.dp)) {
                        OutlinedTextField(
                            search, { search = it }, Modifier.fillMaxWidth(), singleLine = true,
                            leadingIcon = { Icon(Icons.Default.Search, null) }, placeholder = { Text("Ara: altın, USD, BIST…") },
                        )
                        Spacer(Modifier.height(6.dp))
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            items(Filter.entries) { f ->
                                FilterChip(selected = filter == f, onClick = { filter = f }, label = { Text(f.label) })
                            }
                        }
                    }
                }
                val constants = listOf("OZ").filter { needle.isEmpty() || "oz ons gram".contains(needle) }
                if (filter == Filter.ALL) {
                    items(constants, key = { "c_$it" }) { c ->
                        SymbolRow(title = "Ons → gram (OZ)", sub = "Sabit · 31,1034768 g", value = null, change = null, direction = 0) { pick(c) }
                    }
                }
                items(candidates, key = { "s_$it" }) { k ->
                    val d = Display.item(state, engine, k)
                    val ins = state.instrument(k)
                    SymbolRow(
                        title = state.titleOf(k),
                        sub = buildString {
                            append(k)
                            if (ins != null) append(" · ").append(ins.category.short) else append(" · formül")
                            ins?.note?.let { append(" · ").append(it) }
                        },
                        value = d?.valueText,
                        change = d?.changeText,
                        direction = d?.direction ?: 0,
                    ) { pick(k) }
                }
                // ---- Listede olmayanlar: katalog + canlı arama; dokununca hem listeye eklenir hem formüle girer
                if (needle.length >= 2) {
                    val cat = filter.category
                    val fresh = if (filter == Filter.FORMULA) emptyList()
                    else candidates(state, search.trim(), liveSearch, cat).filter { !state.isTracked(it.instrument) && state.instrument(it.instrument.key) == null }
                    val fromCatalog = fresh
                    val hits = emptyList<Candidate>()
                    item { SectionHeader("Listende olmayanlar · dokun: ekle ve formüle koy") }
                    items(fresh, key = { "n_${it.instrument.source}_${it.instrument.symbol}" }) { c ->
                        PickRow(c, added = false) {
                            justAdded += c.instrument
                            onAddInstrument(c.instrument)
                            pick(c.instrument.key)
                        }
                    }
                    if ((fromCatalog.isNotEmpty() || hits.isNotEmpty()) && liveSearch !is SearchState.Done && liveSearch !is SearchState.Failed) {
                        item { Hint("Tüm piyasalarda aranıyor…") }
                    }
                    if (fromCatalog.isEmpty() && hits.isEmpty()) {
                        item {
                            when (val ls = liveSearch) {
                                SearchState.Idle, SearchState.Loading -> Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                                    androidx.compose.material3.CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                                    Spacer(Modifier.width(10.dp))
                                    Text("Tüm piyasalarda aranıyor…", style = MaterialTheme.typography.bodySmall)
                                }
                                is SearchState.Failed -> Hint(ls.message)
                                is SearchState.Done -> Hint("“${search.trim()}” için sonuç yok. Kod (ASELS), ad (Aselsan) ya da TradingView sembolü (BIST:ASELS) deneyin.")
                            }
                        }
                    }
                } else if (candidates.isEmpty()) {
                    item { Hint("Eşleşen sembol yok. Aramak için en az 2 harf yazın.") }
                }
            }

            if (original != null) {
                item {
                    HorizontalDivider(Modifier.padding(top = 16.dp))
                    TextButton(onClick = { onDelete(original.key) }, Modifier.padding(horizontal = 8.dp)) {
                        Text("Formülü sil", color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }
    }
}

private enum class Kind { VAR, NUM, OP, FUNC }

private fun kind(t: String) = when {
    Tokens.isFunction(t) -> Kind.FUNC
    Tokens.isVariable(t) -> Kind.VAR
    Tokens.isNumber(t) -> Kind.NUM
    else -> Kind.OP
}

@Composable
private fun TokenChip(label: String, kind: Kind, onClick: () -> Unit) {
    val (bg, fg) = when (kind) {
        Kind.VAR -> MaterialTheme.colorScheme.primaryContainer to MaterialTheme.colorScheme.onPrimaryContainer
        Kind.FUNC -> MaterialTheme.colorScheme.tertiaryContainer to MaterialTheme.colorScheme.onTertiaryContainer
        Kind.NUM -> MaterialTheme.colorScheme.secondaryContainer to MaterialTheme.colorScheme.onSecondaryContainer
        Kind.OP -> MaterialTheme.colorScheme.surface to MaterialTheme.colorScheme.onSurface
    }
    Surface(onClick = onClick, shape = RoundedCornerShape(8.dp), color = bg) {
        Text(
            label,
            Modifier.padding(horizontal = if (kind == Kind.OP) 10.dp else 8.dp, vertical = 6.dp),
            color = fg,
            fontSize = if (kind == Kind.OP) 16.sp else 13.sp,
            fontWeight = if (kind == Kind.VAR) FontWeight.Medium else FontWeight.Bold,
            maxLines = 1,
        )
    }
}

@Composable
private fun Cursor() {
    Box(
        Modifier
            .padding(vertical = 4.dp)
            .size(width = 2.dp, height = 24.dp)
            .background(MaterialTheme.colorScheme.primary, RoundedCornerShape(1.dp)),
    )
}

@Composable
private fun KeyButton(label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        modifier = modifier.height(40.dp),
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(label, fontSize = if (label.length <= 2) 18.sp else 13.sp, fontWeight = FontWeight.Medium, maxLines = 1)
        }
    }
}

@Composable
private fun SymbolRow(title: String, sub: String, value: String?, change: String?, direction: Int, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(sub, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        }
        if (value != null) {
            Column(horizontalAlignment = Alignment.End) {
                Text(value, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                if (change != null) Text(change, style = MaterialTheme.typography.labelSmall, color = directionColor(direction))
            }
        }
        Spacer(Modifier.width(8.dp))
        Icon(Icons.Default.Add, "Ekle", tint = MaterialTheme.colorScheme.primary)
    }
}
