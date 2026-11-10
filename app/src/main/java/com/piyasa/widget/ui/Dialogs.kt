package com.piyasa.widget.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import com.piyasa.widget.formula.Formulas
import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.Catalog
import com.piyasa.widget.model.Category
import com.piyasa.widget.model.Fmt
import com.piyasa.widget.model.Formula
import com.piyasa.widget.model.FormulaEngine
import com.piyasa.widget.model.Instrument
import com.piyasa.widget.model.Source
import com.piyasa.widget.model.TradingView

// ------------------------------------------------------------------ enstrüman ekle

@Composable
fun AddInstrumentDialog(state: AppState, onDismiss: () -> Unit, onAdd: (Instrument) -> Unit) {
    var tab by remember { mutableIntStateOf(0) }
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {},
        dismissButton = { TextButton(onClick = onDismiss) { Text("Kapat") } },
        title = { Text("Gösterge ekle") },
        text = {
            Column {
                TabRow(selectedTabIndex = tab) {
                    Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Katalog") })
                    Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Özel sembol") })
                }
                Spacer(Modifier.padding(4.dp))
                if (tab == 0) CatalogList(state, onAdd) else CustomInstrumentForm(state, onAdd)
            }
        },
    )
}

@Composable
private fun CatalogList(state: AppState, onAdd: (Instrument) -> Unit) {
    val existing = state.allKeys.toSet()
    val available = Catalog.all.filter { it.key !in existing }
    if (available.isEmpty()) {
        Text("Katalogdaki tüm göstergeler zaten ekli.", style = MaterialTheme.typography.bodySmall)
        return
    }
    LazyColumn(Modifier.heightIn(max = 420.dp)) {
        Category.entries.forEach { cat ->
            val list = available.filter { it.category == cat }
            if (list.isEmpty()) return@forEach
            item { SectionHeader(cat.label, Modifier.padding(start = 0.dp)) }
            items(list, key = { it.key }) { ins ->
                Row(
                    Modifier.fillMaxWidth().clickable { onAdd(ins) }.padding(vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(ins.name, style = MaterialTheme.typography.bodyMedium)
                        Text(
                            "${ins.key} · ${ins.symbol}${ins.note?.let { " · $it" } ?: ""}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Text("+", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary)
                }
            }
        }
    }
}

@Composable
private fun CustomInstrumentForm(state: AppState, onAdd: (Instrument) -> Unit) {
    var symbol by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var key by remember { mutableStateOf("") }
    var keyTouched by remember { mutableStateOf(false) }
    var category by remember { mutableStateOf(Category.TR) }
    var source by remember { mutableStateOf(Source.YAHOO) }
    var decimals by remember { mutableStateOf("2") }
    var prefix by remember { mutableStateOf("") }
    var suffix by remember { mutableStateOf("") }
    var tvSymbol by remember { mutableStateOf("") }

    val effectiveKey = if (keyTouched) Formulas.normalizeName(key) else Formulas.suggestKey(symbol.substringBefore('.').substringBefore('='))
    val keyError = when {
        symbol.isBlank() -> null
        !Formulas.isValidKey(effectiveKey) -> "Geçersiz anahtar (A-Z, 0-9, _)"
        effectiveKey in state.allKeys -> "Bu anahtar kullanımda"
        else -> null
    }

    Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Source.entries.forEach { s ->
                FilterChip(selected = source == s, onClick = { source = s }, label = { Text(s.label.substringBefore(' ')) })
            }
        }
        OutlinedTextField(
            value = symbol, onValueChange = { symbol = it.trim() }, singleLine = true,
            label = { Text("Sembol") },
            supportingText = {
                Text(
                    when (source) {
                        Source.YAHOO -> "ör. ASELS.IS, NVDA, SI=F, GBPTRY=X, ^FTSE"
                        Source.GOLD_API -> "XAU, XAG, XPT, XPD, HG"
                        Source.TCMB -> "KOD:Alan → USD:ForexSelling, EUR:BanknoteBuying"
                    },
                )
            },
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(value = name, onValueChange = { name = it }, singleLine = true, label = { Text("Görünen ad") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(
            value = effectiveKey, onValueChange = { key = it; keyTouched = true }, singleLine = true,
            label = { Text("Formül anahtarı") }, isError = keyError != null,
            supportingText = keyError?.let { { Text(it) } },
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
            modifier = Modifier.fillMaxWidth(),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Category.entries.forEach { c ->
                FilterChip(selected = category == c, onClick = { category = c }, label = { Text(c.short) })
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(decimals, { decimals = it.filter(Char::isDigit).take(1) }, Modifier.weight(1f), singleLine = true,
                label = { Text("Ondalık") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
            OutlinedTextField(prefix, { prefix = it.take(3) }, Modifier.weight(1f), singleLine = true, label = { Text("Ön ek") })
            OutlinedTextField(suffix, { suffix = it.take(3) }, Modifier.weight(1f), singleLine = true, label = { Text("Son ek") })
        }
        val draft = Instrument(effectiveKey, name, symbol, source, category)
        OutlinedTextField(
            value = tvSymbol, onValueChange = { tvSymbol = it.trim() }, singleLine = true,
            label = { Text("TradingView sembolü (opsiyonel)") },
            placeholder = { Text(if (symbol.isBlank()) "BIST:ASELS" else TradingView.symbolOf(draft) ?: "") },
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
            modifier = Modifier.fillMaxWidth(),
        )
        TextButton(
            enabled = symbol.isNotBlank() && keyError == null,
            onClick = {
                onAdd(
                    Instrument(
                        key = effectiveKey,
                        name = name.ifBlank { symbol },
                        symbol = if (source == Source.YAHOO) symbol.uppercase() else symbol,
                        source = source,
                        category = category,
                        decimals = decimals.toIntOrNull() ?: 2,
                        prefix = prefix,
                        suffix = suffix,
                        note = if (source == Source.GOLD_API) "Spot" else null,
                        tvSymbol = tvSymbol.ifBlank { null },
                    ),
                )
            },
            modifier = Modifier.align(Alignment.End),
        ) { Text("Ekle") }
    }
}

// ------------------------------------------------------------------ formül düzenleyici

@Composable
fun FormulaEditorDialog(
    state: AppState,
    original: Formula?,
    onDismiss: () -> Unit,
    onSave: (Formula) -> Unit,
    onDelete: (String) -> Unit,
) {
    var name by remember { mutableStateOf(original?.name ?: "") }
    var key by remember { mutableStateOf(original?.key ?: "") }
    var keyTouched by remember { mutableStateOf(original != null) }
    var expr by remember { mutableStateOf(TextFieldValue(original?.expression ?: "")) }
    var decimals by remember { mutableStateOf((original?.decimals ?: 2).toString()) }
    var prefix by remember { mutableStateOf(original?.prefix ?: "") }
    var suffix by remember { mutableStateOf(original?.suffix ?: "") }

    val effectiveKey = if (keyTouched) Formulas.normalizeName(key) else Formulas.suggestKey(name)
    val otherKeys = state.allKeys.filter { it != original?.key }
    val keyError = when {
        name.isBlank() && !keyTouched -> null
        !Formulas.isValidKey(effectiveKey) -> "Geçersiz anahtar (A-Z, 0-9, _; rezerve isimler kullanılamaz)"
        effectiveKey in otherKeys -> "Bu anahtar kullanımda"
        else -> null
    }
    val dec = decimals.toIntOrNull() ?: 2
    val candidate = Formula(effectiveKey.ifEmpty { "_ONIZLEME" }, name, expr.text, dec, prefix, suffix)
    val preview = remember(state, candidate) {
        val s = state.copy(formulas = state.formulas.filter { it.key != original?.key } + candidate)
        FormulaEngine(s).evaluateKey(candidate.key)
    }

    fun insert(token: String) {
        val t = expr.text
        val sel = expr.selection
        val before = t.substring(0, sel.start)
        val after = t.substring(sel.end)
        val pad = if (before.isNotEmpty() && !before.last().isWhitespace() && before.last() != '(') " " else ""
        val ins = pad + token
        expr = TextFieldValue(before + ins + after, TextRange(before.length + ins.length))
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (original == null) "Yeni formül" else "Formülü düzenle") },
        confirmButton = {
            TextButton(
                enabled = name.isNotBlank() && keyError == null && expr.text.isNotBlank() && preview.error?.startsWith("Döngüsel") != true,
                onClick = { onSave(candidate.copy(key = effectiveKey, expression = expr.text.trim())) },
            ) { Text("Kaydet") }
        },
        dismissButton = {
            Row {
                if (original != null) {
                    TextButton(onClick = { onDelete(original.key) }) { Text("Sil", color = MaterialTheme.colorScheme.error) }
                }
                TextButton(onClick = onDismiss) { Text("Vazgeç") }
            }
        },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), singleLine = true, label = { Text("Ad") })
                OutlinedTextField(
                    value = effectiveKey, onValueChange = { key = it; keyTouched = true }, singleLine = true,
                    label = { Text("Anahtar") }, isError = keyError != null,
                    supportingText = keyError?.let { { Text(it) } },
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = expr, onValueChange = { expr = it },
                    label = { Text("Formül") },
                    textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
                LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    val tokens = state.instruments.map { it.key } + state.formulas.map { it.key }.filter { it != original?.key } +
                        listOf("OZ", "*", "/", "(", ")", "pct(", "chg(", "prev(")
                    items(tokens) { t -> SuggestionChip(onClick = { insert(t) }, label = { Text(t) }) }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Sonuç: ", style = MaterialTheme.typography.labelMedium)
                    if (preview.error != null) {
                        Text(preview.error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    } else {
                        Text(
                            preview.value?.let { Fmt.value(it, dec, prefix, suffix) } ?: "—",
                            fontWeight = FontWeight.Bold,
                        )
                        Spacer(Modifier.width(8.dp))
                        val ch = preview.change
                        ChangeChip(Fmt.change(ch), if (ch == null) 0 else if (ch > 0.005) 1 else if (ch < -0.005) -1 else 0)
                    }
                }
                val tv = remember(state, candidate) {
                    TradingView.symbolFor(state.copy(formulas = state.formulas.filter { it.key != original?.key } + candidate), candidate.key)
                }
                if (tv != null && preview.error == null) {
                    Text(
                        "TradingView: $tv",
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(decimals, { decimals = it.filter(Char::isDigit).take(1) }, Modifier.weight(1f), singleLine = true,
                        label = { Text("Ondalık") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
                    OutlinedTextField(prefix, { prefix = it.take(3) }, Modifier.weight(1f), singleLine = true, label = { Text("Ön ek") })
                    OutlinedTextField(suffix, { suffix = it.take(3) }, Modifier.weight(1f), singleLine = true, label = { Text("Son ek") })
                }
                Text(FORMULA_HELP, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
    )
}
