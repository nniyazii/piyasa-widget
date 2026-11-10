package com.piyasa.widget.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.piyasa.widget.data.source.SearchHit
import com.piyasa.widget.formula.Formulas
import com.piyasa.widget.formula.Parser
import com.piyasa.widget.formula.Tokens
import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.Category
import com.piyasa.widget.model.Catalog
import com.piyasa.widget.model.Display
import com.piyasa.widget.model.Fmt
import com.piyasa.widget.model.Formula
import com.piyasa.widget.model.FormulaEngine
import com.piyasa.widget.model.Instrument
import com.piyasa.widget.model.TradingView
import kotlinx.coroutines.launch
import java.util.Locale

/*
 * Tek ekran, iki iş: sembol eklemek ve formül yazmak.
 *
 *   "aselsan"                → sonuca dokun → sembol eklendi
 *   "ons" × "dolar" ÷ "oz"   → canlı sonuç → "=" → formül kaydedildi ("Gram Altın", ₺)
 *
 * Operatöre basıldığında yazılan kelime en iyi eşleşen sembole dönüşür (TradingView'daki gibi).
 */

private val trLocale = Locale.forLanguageTag("tr-TR")
private const val ZWSP = "​" // boş alanda geri silmeyi yakalamak için

private data class FunctionInfo(val token: String, val label: String, val desc: String)

private val functionInfos = listOf(
    FunctionInfo("pct(", "% fark", "a'nın b'ye göre yüzde farkı: % fark(a ; b)"),
    FunctionInfo("chg(", "günlük %", "günlük yüzde değişim"),
    FunctionInfo("prev(", "önceki", "önceki kapanış değeri"),
    FunctionInfo("avg(", "ortalama", "ortalama(a ; b ; …)"),
    FunctionInfo("min(", "en küçük", "en küçük(a ; b ; …)"),
    FunctionInfo("max(", "en büyük", "en büyük(a ; b ; …)"),
    FunctionInfo("round(", "yuvarla", "yuvarla(x ; basamak)"),
    FunctionInfo("abs(", "mutlak", "mutlak değer"),
)

internal fun tokenLabel(state: AppState, t: String): String = when {
    t == "*" -> "×"
    t == "/" -> "÷"
    t == "-" -> "−"
    t == "OZ" -> "OZ"
    Tokens.isNumber(t) -> t.replace('.', ',')
    Tokens.isFunction(t) -> (functionInfos.firstOrNull { it.token == t }?.label ?: t.dropLast(1)) + " ("
    Tokens.isVariable(t) -> state.titleOf(t)
    else -> t
}

/** Formüle ad önerisi: ONS×USDTRY÷OZ → "Gram Altın", XU100÷USDTRY → "BIST 100 ($)" … */
internal fun suggestName(state: AppState, tokens: List<String>): String {
    val vars = tokens.filter { Tokens.isVariable(it) && it != "OZ" }
    if (tokens.size == 5 && tokens[1] == "*" && tokens[3] == "/" && tokens[4] == "OZ" && tokens[2] == "USDTRY") {
        val n = state.titleOf(tokens[0])
        return if (n.startsWith("Ons ")) "Gram " + n.removePrefix("Ons ") else "$n (₺/gr)"
    }
    if (tokens.size == 3 && tokens[1] == "/" && tokens[2] == "USDTRY") return state.titleOf(tokens[0]) + " ($)"
    if (tokens.size == 3 && tokens[1] == "*" && tokens[2] == "USDTRY") return state.titleOf(tokens[0]) + " (₺)"
    if (tokens.size == 3 && tokens[1] == "/" && vars.size == 2) return state.titleOf(tokens[0]) + " / " + state.titleOf(tokens[2])
    return tokens.joinToString(" ") { tokenLabel(state, it) }.take(32)
}

/** Birim önerisi: dolar kuruyla çarpılıyorsa ₺, bölünüyorsa $. */
internal fun suggestUnit(tokens: List<String>): Pair<String, String> {
    val i = tokens.indexOf("USDTRY")
    if (i > 0 && tokens[i - 1] == "/") return "$" to ""
    if (i >= 0 && (tokens.getOrNull(i - 1) == "*" || tokens.getOrNull(i + 1) == "*")) return "" to "₺"
    if (tokens.firstOrNull() == "pct(" || tokens.firstOrNull() == "chg(") return "" to "%"
    return "" to ""
}

/**
 * Ekle ekranı. Dialog penceresi yerine etkinliğin içinde tam ekran çizilir:
 * böylece gezinme çubuğu ve klavye boşlukları (insets) doğru hesaplanır.
 */
@OptIn(ExperimentalLayoutApi::class, ExperimentalFoundationApi::class)
@Composable
fun ComposerScreen(
    baseState: AppState,
    editing: Formula?,
    onClose: () -> Unit,
    onAddInstrument: (Instrument) -> Unit,
    onUndoInstrument: (Instrument) -> Unit,
    onSaveFormula: (formula: Formula, originalKey: String?, needed: List<Instrument>) -> Unit,
    onDeleteFormula: (String) -> Unit,
    searcher: suspend (String) -> List<SearchHit> = ::defaultSearch,
    initialTokens: List<String>? = null,
    initialQuery: String = "",
    autoFocus: Boolean = true,
) {
    // Formülde kullanılıp henüz listede olmayan semboller (kaydederken eklenir)
    val needed = remember { mutableStateListOf<Instrument>() }
    val state = remember(baseState, needed.toList()) {
        val missing = needed.filter { n -> baseState.instruments.none { it.key == n.key } }
        if (missing.isEmpty()) baseState else baseState.copy(instruments = baseState.instruments + missing)
    }

    val tokens = remember { mutableStateListOf<String>().apply { addAll(initialTokens ?: Tokens.tokenize(editing?.expression ?: "")) } }
    var field by remember { mutableStateOf(TextFieldValue(ZWSP + initialQuery, TextRange(ZWSP.length + initialQuery.length))) }
    val pending = field.text.removePrefix(ZWSP)
    var selected by remember { mutableStateOf<Int?>(null) }
    var showSave by remember { mutableStateOf(false) }
    var fnMenu by remember { mutableStateOf(false) }
    var manualOpen by remember { mutableStateOf(false) }

    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val focus = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    val imeVisible = WindowInsets.ime.getBottom(LocalDensity.current) > 0
    if (autoFocus && editing == null) LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }

    val formulaMode = tokens.isNotEmpty()
    val query = pending.trim()
    val isNumberQuery = query.isNotEmpty() && Tokens.parseNumber(query) != null
    val search = rememberSymbolSearch(if (isNumberQuery) "" else query, searcher)

    // Sonuçlar: önce listendekiler (formüller dahil), sonra katalog + tüm piyasalar
    val results: List<Candidate> = remember(state, query, search) { composerResults(state, query, search) }

    fun setPending(text: String) {
        field = TextFieldValue(ZWSP + text, TextRange(ZWSP.length + text.length))
    }

    /** Yazılanı parçaya çevir: sayı, bilinen anahtar ya da en iyi eşleşen sembol. */
    fun commitText(text: String): Boolean {
        val q = text.trim()
        if (q.isEmpty()) return true
        Tokens.parseNumber(q)?.let { tokens += it; return true }
        val key = Formulas.normalizeName(q)
        if (key in state.allKeys || key in Formulas.constants) { tokens += key; return true }
        // Bu sorgunun canlı sonuçları elimizdeyse onları, yoksa listendeki + katalogdaki eşleşmeleri kullan
        val pool = if (q == query) results else composerResults(state, q, SearchState.Idle)
        // Doğrudan yazılmış TradingView sembolü (BIST:ASTOR, NYSE:KO …): olduğu gibi kabul et
        val direct = if (pool.isEmpty() && Regex("^[A-Za-z0-9_]+:[A-Za-z0-9_.!]+$").matches(q)) {
            Candidate(Catalog.fromTradingView(SearchHit(q.uppercase(), q.substringAfter(':').uppercase(), null, q.substringBefore(':').uppercase(), null), state.allKeys), null, null)
        } else null
        val best = pool.firstOrNull() ?: direct ?: return false
        val k = best.instrument.key
        if (state.instrument(k) == null && state.formula(k) == null && k !in Formulas.constants) needed += best.instrument
        tokens += k
        return true
    }

    fun commitPending(): Boolean {
        val ok = commitText(pending)
        if (ok) setPending("")
        return ok
    }

    fun pushOperator(op: String) {
        if (!commitPending()) return
        selected = null
        tokens += op
    }

    fun backspace() {
        val sel = selected
        when {
            pending.isNotEmpty() -> setPending(pending.dropLast(1))
            sel != null && sel in tokens.indices -> { tokens.removeAt(sel); selected = null }
            tokens.isNotEmpty() -> tokens.removeAt(tokens.lastIndex)
        }
    }

    /** Tek "( )" tuşu: açık parantez varsa ve önünde bir değer duruyorsa kapatır, yoksa açar. */
    fun smartParen() {
        if (!commitPending()) return
        val open = tokens.count { it == "(" || Tokens.isFunction(it) } - tokens.count { it == ")" }
        val last = tokens.lastOrNull()
        val lastIsValue = last != null && (Tokens.isVariable(last) || Tokens.isNumber(last) || last == ")")
        when {
            open > 0 && lastIsValue -> tokens += ")"
            lastIsValue -> { tokens += "*"; tokens += "(" } // 2(…) → 2 × (…)
            else -> tokens += "("
        }
    }

    fun addSymbol(c: Candidate) {
        val ins = c.instrument
        if (state.isTracked(ins)) return
        onAddInstrument(ins)
        setPending("")
        scope.launch {
            snackbar.currentSnackbarData?.dismiss()
            if (snackbar.showSnackbar("✓ ${ins.name} eklendi", actionLabel = "Geri al", duration = SnackbarDuration.Short) ==
                SnackbarResult.ActionPerformed
            ) onUndoInstrument(ins)
        }
    }

    /** Sonuca dokunuldu: formül yazılıyorsa formüle girer, değilse sembol eklenir. */
    fun pick(c: Candidate) {
        val k = c.instrument.key
        // Formüllerin ve sabitlerin "eklenecek sembolü" yoktur: dokununca formül başlar
        val isFormulaOrConst = state.formula(k) != null || k in Formulas.constants
        if (formulaMode || isFormulaOrConst) {
            val ins = c.instrument
            if (state.instrument(ins.key) == null && state.formula(ins.key) == null) needed += ins
            tokens += ins.key
            setPending("")
        } else {
            addSymbol(c)
        }
    }

    /** "=" / Enter: formül varsa kaydet, yoksa en iyi sonucu sembol olarak ekle. */
    fun submit() {
        if (!formulaMode) {
            results.firstOrNull()?.let { if (!state.isTracked(it.instrument)) addSymbol(it) }
            return
        }
        if (!commitPending()) return
        if (runCatching { Parser.parse(Tokens.render(tokens)) }.isSuccess) {
            focusManager.clearFocus(); keyboard?.hide()
            showSave = true
        }
    }

    /** Klavyeden yazılan metni işle: operatör karakterleri parçalara dönüşür. */
    fun onFieldChange(v: TextFieldValue) {
        if (!v.text.startsWith(ZWSP)) { // boş alanda geri silme
            backspace()
            setPending(v.text.removePrefix(ZWSP))
            return
        }
        val raw = v.text.removePrefix(ZWSP)
        val ops = "+-*/×÷−()^;=\n"
        if (raw.none { it in ops }) { field = v; return }
        // Yazılan/yapıştırılan metni soldan sağa işle: kelimeler sembole, işaretler operatöre dönüşür
        val buf = StringBuilder()
        var submitAfter = false
        for (ch in raw) {
            if (ch !in ops) { buf.append(ch); continue }
            val word = buf.toString(); buf.clear()
            when (ch) {
                '=', '\n' -> { commitText(word); submitAfter = true }
                '(' -> { commitText(word); tokens += "(" }
                ')' -> { commitText(word); tokens += ")" }
                ';' -> { commitText(word); tokens += ";" }
                else -> if (commitText(word)) tokens += Tokens.tokenize(ch.toString()).first()
            }
        }
        setPending(buf.toString())
        if (submitAfter) submit()
    }

    // Ara sonuç (hesap makinesi gibi): yazılmakta olan kelime de en iyi eşleşmesiyle hesaba katılır;
    // yarım ifadede (ör. "Ons Altın ×") son tamamlanmış kısmın değeri gösterilir.
    val pendingToken: String? = when {
        !formulaMode || query.isEmpty() -> null
        Tokens.parseNumber(query) != null -> Tokens.parseNumber(query)
        else -> Formulas.normalizeName(query).takeIf { it in state.allKeys || it in Formulas.constants }
            ?: results.firstOrNull()?.instrument?.key?.takeIf { state.instrument(it) != null || state.formula(it) != null || it in Formulas.constants }
    }
    val expression = Tokens.render(tokens + listOfNotNull(pendingToken))
    val runningExpression = remember(expression) {
        var t = Tokens.tokenize(expression)
        while (t.isNotEmpty() && runCatching { Parser.parse(Tokens.render(t)) }.isFailure) t = t.dropLast(1)
        Tokens.render(t)
    }
    val previewKey = "_COMPOSER"
    val preview = remember(state, runningExpression) {
        if (!formulaMode || runningExpression.isBlank()) null
        else FormulaEngine(state.copy(formulas = state.formulas.filter { it.key != editing?.key } + Formula(previewKey, "", runningExpression)))
            .evaluateKey(previewKey)
            // "veri yok" gibi geçici durumlar hata değildir
            .let { if (it.error != null && it.error.contains("veri yok")) it.copy(error = null) else it }
    }
    val isPartial = runningExpression != expression || pending.isNotBlank()
    val tv = remember(state, expression) {
        if (!formulaMode) null
        else TradingView.symbolFor(state.copy(formulas = state.formulas + Formula(previewKey, "", expression)), previewKey)
    }

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface) {
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding()) {
            // ---- üst çubuk
            Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 12.dp, top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onClose) { Icon(Icons.Default.Close, "Kapat") }
                Text(
                    if (editing != null) "Formülü düzenle" else "Ekle",
                    Modifier.weight(1f), style = MaterialTheme.typography.titleLarge,
                )
                TextButton(onClick = onClose) { Text("Bitti") }
            }

            // ---- hesap makinesi ekranı
            Surface(
                Modifier.fillMaxWidth().padding(horizontal = 12.dp),
                shape = RoundedCornerShape(24.dp),
                color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
            ) {
                Column(Modifier.padding(start = 14.dp, end = 4.dp, top = 8.dp, bottom = 8.dp)) {
                    Row(verticalAlignment = Alignment.Top) {
                    FlowRow(
                        Modifier.weight(1f).padding(top = 4.dp).heightIn(min = 36.dp).clickable { runCatching { focus.requestFocus() }; keyboard?.show() },
                        horizontalArrangement = Arrangement.spacedBy(4.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        tokens.forEachIndexed { i, t ->
                            ExprChip(tokenLabel(state, t), kind(t), selected = selected == i) { selected = if (selected == i) null else i }
                        }
                        BasicTextField(
                            value = field,
                            onValueChange = ::onFieldChange,
                            modifier = Modifier.widthIn(min = 120.dp).focusRequester(focus).padding(vertical = 6.dp),
                            singleLine = true,
                            textStyle = TextStyle(fontSize = 18.sp, color = MaterialTheme.colorScheme.onSurface),
                            cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, imeAction = ImeAction.Done),
                            keyboardActions = KeyboardActions(onDone = { submit() }),
                            decorationBox = { inner ->
                                Box {
                                    if (pending.isEmpty() && tokens.isEmpty()) {
                                        Text("Sembol ara ya da formül yaz", fontSize = 18.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    inner()
                                }
                            },
                        )
                    }
                    // ⌫ ekranın yanında (hesap makinelerindeki gibi); basılı tutunca hepsini siler
                    if (tokens.isNotEmpty() || pending.isNotEmpty()) {
                        Box(
                            Modifier.size(44.dp).combinedClickable(
                                onClick = ::backspace,
                                onLongClick = { tokens.clear(); setPending(""); selected = null; needed.clear() },
                            ),
                            contentAlignment = Alignment.Center,
                        ) { Text("⌫", fontSize = 22.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                    }
                    // Büyük sonuç (hesap makinesi gibi)
                    if (formulaMode) {
                        Spacer(Modifier.height(6.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            val ch = preview?.change
                            if (preview?.error == null && ch != null) {
                                ChangeChip(Fmt.change(ch), if (ch > 0.005) 1 else if (ch < -0.005) -1 else 0)
                            }
                            Spacer(Modifier.weight(1f))
                            val (pre, suf) = suggestUnit(tokens)
                            Text(
                                when {
                                    preview == null -> " "
                                    preview.error != null -> preview.error
                                    else -> "= " + (preview.value?.let { Fmt.value(it, 2, pre, suf) } ?: "…")
                                },
                                fontSize = if (preview?.error == null) 34.sp else 14.sp,
                                fontWeight = FontWeight.Light,
                                textAlign = TextAlign.End,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                                color = when {
                                    preview?.error != null -> MaterialTheme.colorScheme.error
                                    isPartial -> MaterialTheme.colorScheme.onSurfaceVariant // ara sonuç: soluk
                                    else -> MaterialTheme.colorScheme.onSurface
                                },
                            )
                        }
                        if (tv != null && preview?.error == null) {
                            Text("TradingView: $tv", style = MaterialTheme.typography.labelSmall, fontFamily = FontFamily.Monospace,
                                color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                }
            }

            // ---- sonuçlar / öneriler
            LazyColumn(Modifier.weight(1f).fillMaxWidth(), contentPadding = PaddingValues(top = 4.dp, bottom = 8.dp)) {
                if (query.isEmpty()) {
                    if (!formulaMode) {
                        item {
                            Text(
                                "Örnek formüller",
                                Modifier.padding(start = 16.dp, top = 10.dp, bottom = 4.dp),
                                style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                val examples = listOf(
                                    listOf("ONS", "*", "USDTRY", "/", "OZ"),
                                    listOf("XU100", "/", "USDTRY"),
                                    listOf("ONS", "/", "GUMUS"),
                                    listOf("pct(", "EURUSD", ";", "1.10", ")"),
                                ).filter { ex -> ex.filter { Tokens.isVariable(it) && it != "OZ" }.all { it in state.allKeys } }
                                items(examples) { ex ->
                                    AssistChip(onClick = { tokens.clear(); tokens += ex }, label = { Text(ex.joinToString(" ") { tokenLabel(state, it) }) })
                                }
                            }
                        }
                        // Boşken: önerilen semboller
                        Category.entries.forEach { cat ->
                            val list = Catalog.all.filter { it.category == cat && !state.isTracked(it) }
                            if (list.isEmpty()) return@forEach
                            item(key = "c_${cat.name}") { SectionHeader(cat.label) }
                            items(list, key = { "k_${it.key}" }) { ins -> PickRow(Candidate(ins, null, null), added = false) { addSymbol(Candidate(ins, null, null)) } }
                        }
                        item {
                            Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                                Text(
                                    if (manualOpen) "Gelişmiş ▴" else "Gelişmiş: TCMB kuru veya Yahoo sembolü ▾",
                                    Modifier.clickable { manualOpen = !manualOpen }.padding(vertical = 8.dp),
                                    style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary,
                                )
                                if (manualOpen) ManualForm(state, { state.isTracked(it) }) { addSymbol(Candidate(it, null, null)) }
                            }
                        }
                    } else {
                        // Formül yazılırken: listendekiler hızlı erişim için
                        item { SectionHeader("Listen") }
                        val mine = state.formulas.filter { it.key != editing?.key }.map { it.key } + state.instruments.map { it.key }
                        val engine = FormulaEngine(state)
                        items(mine, key = { "m_$it" }) { k ->
                            val d = Display.item(state, engine, k)
                            val ins = state.instrument(k) ?: Instrument(k, state.titleOf(k), "ƒ " + (state.formula(k)?.expression ?: ""), com.piyasa.widget.model.Source.TRADINGVIEW, Category.WORLD)
                            PickRow(Candidate(ins, d?.value, d?.change), added = false, insert = true) { tokens += k }
                        }
                    }
                } else if (isNumberQuery) {
                    item { Hint("Sayı: ${query.replace('.', ',')} · bir işlem tuşuna basın ya da “=”") }
                } else {
                    items(results, key = { "r_${it.instrument.source}_${it.instrument.symbol}_${it.instrument.key}" }) { c ->
                        val tracked = state.isTracked(c.instrument) || state.formula(c.instrument.key) != null
                        PickRow(c, added = tracked && !formulaMode, insert = formulaMode) { pick(c) }
                    }
                    item {
                        when (search) {
                            SearchState.Idle, SearchState.Loading -> if (query.length >= 2) Hint("Tüm piyasalarda aranıyor…")
                            is SearchState.Failed -> Hint(search.message)
                            is SearchState.Done -> if (results.isEmpty()) Hint("“$query” için sonuç yok. Kod (ASELS), ad (Aselsan) ya da TradingView sembolü (BIST:ASELS) deneyin.")
                        }
                    }
                }
            }

            // ---- hesap makinesi tuş takımı (sistem klavyesi açıkken gizlenir)
            if (!imeVisible) {
                Keypad(
                    onDigit = { d -> if (pending.isNotEmpty() && Tokens.parseNumber(pending.trim()) == null) commitPending(); setPending(pending + d) },
                    onComma = {
                        if (pending.isNotEmpty() && Tokens.parseNumber(pending.trim()) != null) setPending(pending + ".")
                        else { commitPending(); tokens += ";" }
                    },
                    onOperator = ::pushOperator,
                    onParen = ::smartParen,
                    onClear = { tokens.clear(); setPending(""); selected = null; needed.clear() },
                    onEquals = ::submit,
                    onFunction = { fnMenu = true },
                    onLetters = { runCatching { focus.requestFocus() }; keyboard?.show() },
                    fnMenu = {
                        DropdownMenu(expanded = fnMenu, onDismissRequest = { fnMenu = false }) {
                            functionInfos.forEach { f ->
                                DropdownMenuItem(
                                    text = {
                                        Column {
                                            Text(f.label)
                                            Text(f.desc, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        }
                                    },
                                    onClick = { fnMenu = false; commitPending(); tokens += f.token },
                                )
                            }
                            DropdownMenuItem(text = { Text("OZ · ons → gram (31,1035)") }, onClick = { fnMenu = false; commitPending(); tokens += "OZ" })
                        }
                    },
                )
            } else {
                Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = { focusManager.clearFocus(); keyboard?.hide() }) { Text("123 · hesap makinesi") }
                }
            }
        }
        SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).navigationBarsPadding().padding(bottom = 300.dp))
    }
    }

    if (showSave) {
        SaveFormulaDialog(
            state = state,
            tokens = tokens.toList(),
            editing = editing,
            onDismiss = { showSave = false },
            onDelete = editing?.let { e -> { showSave = false; onDeleteFormula(e.key) } },
            onSave = { f ->
                showSave = false
                onSaveFormula(f, editing?.key, needed.toList())
                if (editing != null) {
                    onClose()
                } else {
                    tokens.clear(); needed.clear(); setPending("")
                    scope.launch { snackbar.showSnackbar("✓ ${f.name} kaydedildi", duration = SnackbarDuration.Short) }
                }
            },
        )
    }
}

/** Arama sonuçları: listendekiler (formüller dahil) + katalog + tüm piyasalar; tekrarsız. */
internal fun composerResults(state: AppState, query: String, search: SearchState): List<Candidate> {
    if (query.isEmpty()) return emptyList()
    val n = query.lowercase(trLocale)
    val engine = FormulaEngine(state)
    val constants = if ("oz".startsWith(n) || n.contains("gram") || n.contains("ons")) listOf(
        Candidate(Instrument("OZ", "OZ · ons → gram", "Sabit 31,1034768", com.piyasa.widget.model.Source.TRADINGVIEW, Category.WORLD), Formulas.TROY_OUNCE_GRAMS, null),
    ) else emptyList()
    val mineFormulas = state.formulas.filter { f -> f.name.lowercase(trLocale).contains(n) || f.key.lowercase().contains(n) }.map { f ->
        val d = Display.item(state, engine, f.key)
        Candidate(Instrument(f.key, f.name, "ƒ " + f.expression, com.piyasa.widget.model.Source.TRADINGVIEW, Category.WORLD), d?.value, d?.change)
    }
    val mineInstruments = state.instruments.filter { i ->
        listOfNotNull(i.name, i.key, i.symbol, i.note, Catalog.keywords[i.key]).joinToString(" ").lowercase(trLocale).contains(n)
    }.map { i ->
        val q = state.quotes[i.key]
        Candidate(i, q?.price, q?.prevClose?.let { (q.price / it - 1) * 100 })
    }
    val others = candidates(state, query, search, null).filter { c -> mineInstruments.none { it.instrument.symbol.equals(c.instrument.symbol, true) } }
    val code = com.piyasa.widget.data.source.TradingViewSource.normalizeCode(query)
    val exactFirst = (mineInstruments + mineFormulas + others).sortedByDescending {
        code != null && (it.instrument.key == code || it.instrument.symbol.substringAfter(':').equals(code, true))
    }
    return exactFirst + constants
}

private enum class Kind { VAR, NUM, OP, FUNC }

private fun kind(t: String) = when {
    Tokens.isFunction(t) -> Kind.FUNC
    Tokens.isVariable(t) -> Kind.VAR
    Tokens.isNumber(t) -> Kind.NUM
    else -> Kind.OP
}

@Composable
private fun ExprChip(label: String, kind: Kind, selected: Boolean, onClick: () -> Unit) {
    val (bg, fg) = when {
        selected -> MaterialTheme.colorScheme.error to MaterialTheme.colorScheme.onError
        kind == Kind.VAR -> MaterialTheme.colorScheme.primaryContainer to MaterialTheme.colorScheme.onPrimaryContainer
        kind == Kind.FUNC -> MaterialTheme.colorScheme.tertiaryContainer to MaterialTheme.colorScheme.onTertiaryContainer
        else -> Color.Transparent to MaterialTheme.colorScheme.onSurface
    }
    Surface(onClick = onClick, shape = RoundedCornerShape(10.dp), color = bg) {
        Text(
            label,
            Modifier.padding(horizontal = if (kind == Kind.OP || kind == Kind.NUM) 4.dp else 10.dp, vertical = 6.dp),
            color = fg,
            fontSize = if (kind == Kind.OP) 22.sp else 16.sp,
            fontWeight = if (kind == Kind.OP) FontWeight.Light else FontWeight.Medium,
            maxLines = 1,
        )
    }
}

/**
 * Tanıdık hesap makinesi düzeni (Google Hesap Makinesi gibi 4×5):
 *   C   ( )  ƒ   ÷
 *   7   8    9   ×
 *   4   5    6   −
 *   1   2    3   +
 *   abc 0    ,   =
 * ⌫ ekranın yanında durur.
 */
@Composable
private fun Keypad(
    onDigit: (String) -> Unit,
    onComma: () -> Unit,
    onOperator: (String) -> Unit,
    onParen: () -> Unit,
    onClear: () -> Unit,
    onEquals: () -> Unit,
    onFunction: () -> Unit,
    onLetters: () -> Unit,
    fnMenu: @Composable () -> Unit,
) {
    val op = MaterialTheme.colorScheme.primary
    val onOp = MaterialTheme.colorScheme.onPrimary
    val fn = MaterialTheme.colorScheme.secondaryContainer
    val onFn = MaterialTheme.colorScheme.onSecondaryContainer
    val num = MaterialTheme.colorScheme.surfaceVariant
    val onNum = MaterialTheme.colorScheme.onSurfaceVariant
    Column(
        Modifier.fillMaxWidth().padding(start = 12.dp, end = 12.dp, top = 6.dp, bottom = 8.dp),
        verticalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Key("C", fn, onFn, Modifier.weight(1f), onClick = onClear)
            Key("( )", fn, onFn, Modifier.weight(1f), onClick = onParen)
            Box(Modifier.weight(1f)) {
                Key("ƒ", fn, onFn, Modifier.fillMaxWidth(), onClick = onFunction)
                fnMenu()
            }
            Key("÷", op, onOp, Modifier.weight(1f)) { onOperator("/") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("7", "8", "9").forEach { d -> Key(d, num, onNum, Modifier.weight(1f)) { onDigit(d) } }
            Key("×", op, onOp, Modifier.weight(1f)) { onOperator("*") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("4", "5", "6").forEach { d -> Key(d, num, onNum, Modifier.weight(1f)) { onDigit(d) } }
            Key("−", op, onOp, Modifier.weight(1f)) { onOperator("-") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("1", "2", "3").forEach { d -> Key(d, num, onNum, Modifier.weight(1f)) { onDigit(d) } }
            Key("+", op, onOp, Modifier.weight(1f)) { onOperator("+") }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Key("abc", fn, onFn, Modifier.weight(1f), onClick = onLetters)
            Key("0", num, onNum, Modifier.weight(1f)) { onDigit("0") }
            Key(",", num, onNum, Modifier.weight(1f), onClick = onComma)
            Key("=", op, onOp, Modifier.weight(1f), onClick = onEquals)
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Key(
    label: String,
    bg: Color,
    fg: Color,
    modifier: Modifier = Modifier,
    onLongClick: (() -> Unit)? = null,
    onClick: () -> Unit,
) {
    Box(
        modifier
            .height(48.dp)
            .background(bg, RoundedCornerShape(24.dp))
            .combinedClickable(onClick = onClick, onLongClick = onLongClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            label,
            color = fg,
            fontSize = if (label.length <= 1) 24.sp else 18.sp,
            fontWeight = if (label.length <= 1) FontWeight.Normal else FontWeight.Medium,
        )
    }
}

@Composable
private fun SaveFormulaDialog(
    state: AppState,
    tokens: List<String>,
    editing: Formula?,
    onDismiss: () -> Unit,
    onDelete: (() -> Unit)?,
    onSave: (Formula) -> Unit,
) {
    val suggested = remember(tokens) { suggestName(state, tokens) }
    val (sp, ss) = remember(tokens) { suggestUnit(tokens) }
    var name by remember { mutableStateOf(editing?.name ?: suggested) }
    var prefix by remember { mutableStateOf(editing?.prefix ?: sp) }
    var suffix by remember { mutableStateOf(editing?.suffix ?: ss) }
    var decimals by remember { mutableIntStateOf(editing?.decimals ?: 2) }
    val expression = Tokens.render(tokens)
    val otherKeys = state.allKeys.filter { it != editing?.key }
    val key = remember(name) {
        editing?.key ?: Formulas.suggestKey(name).let { base ->
            var k = base; var n = 2
            while (k in otherKeys) { k = "${base}_$n"; n++ }
            k
        }
    }
    val value = remember(expression) {
        FormulaEngine(state.copy(formulas = state.formulas.filter { it.key != editing?.key } + Formula("_S", "", expression))).evaluateKey("_S")
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (editing == null) "Formülü kaydet" else "Formülü güncelle") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(
                    value.value?.let { Fmt.value(it, decimals, prefix, suffix) } ?: (value.error ?: "—"),
                    fontSize = 30.sp, fontWeight = FontWeight.Light,
                )
                Text(tokens.joinToString(" ") { tokenLabel(state, it) }, style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedTextField(name, { name = it.take(32) }, Modifier.fillMaxWidth(), singleLine = true, label = { Text("Ad") })
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("" to "", "" to "₺", "$" to "", "€" to "", "" to "%").forEachIndexed { i, (p, s) ->
                        FilterChip(
                            selected = prefix == p && suffix == s,
                            onClick = { prefix = p; suffix = s },
                            label = { Text(if (i == 0) "yok" else p + s) },
                        )
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Ondalık", Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium)
                    IconButton(onClick = { decimals = (decimals - 1).coerceAtLeast(0) }) { Text("−", fontSize = 22.sp) }
                    Text("$decimals", style = MaterialTheme.typography.titleMedium)
                    IconButton(onClick = { decimals = (decimals + 1).coerceAtMost(6) }) { Text("+", fontSize = 22.sp) }
                }
            }
        },
        confirmButton = {
            TextButton(enabled = name.isNotBlank(), onClick = { onSave(Formula(key, name.trim(), expression, decimals, prefix, suffix)) }) {
                Text("Kaydet")
            }
        },
        dismissButton = {
            Row {
                if (onDelete != null) TextButton(onClick = onDelete) { Text("Sil", color = MaterialTheme.colorScheme.error) }
                TextButton(onClick = onDismiss) { Text("Vazgeç") }
            }
        },
    )
}
