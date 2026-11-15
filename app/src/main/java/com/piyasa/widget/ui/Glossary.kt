package com.piyasa.widget.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.piyasa.widget.data.AppJson
import com.piyasa.widget.model.Field
import kotlinx.serialization.Serializable
import java.text.Normalizer
import java.util.Locale

/** Sözlük terimi; içerik web sürümüyle ortak (assets/glossary.json, kaynak: web/src/core/glossary.ts). */
@Serializable
data class Term(
    val id: String,
    val term: String,
    val aka: List<String> = emptyList(),
    val short: String,
    val body: List<String> = emptyList(),
    val formula: List<String> = emptyList(),
    val example: String? = null,
    val inApp: String? = null,
    val related: List<String> = emptyList(),
    val fields: List<String> = emptyList(),
) {
    /** Dizinde kısa ad: "RSI (göreceli güç endeksi)" → "RSI" */
    val shortName: String get() = term.replace(Regex("\\s*\\(.*\\)$"), "")
}

@Serializable
data class TermGroup(val id: String, val title: String, val terms: List<Term>)

object Glossary {
    @Volatile private var cached: List<TermGroup>? = null

    fun parse(json: String): List<TermGroup> = AppJson.decodeFromString(json)

    fun load(context: android.content.Context): List<TermGroup> = cached ?: runCatching {
        parse(context.assets.open("glossary.json").bufferedReader().use { it.readText() })
    }.getOrDefault(emptyList()).also { cached = it }

    /** Tarama alanını anlatan terim (koşullardan sözlüğe geçiş için). */
    fun termFor(groups: List<TermGroup>, field: Field): Term? = groups.asSequence().flatMap { it.terms }.firstOrNull { field.name in it.fields }

    /** Türkçe harf ve büyük-küçük farkı gözetmeyen arama anahtarı. */
    fun fold(s: String): String = Normalizer.normalize(
        s.lowercase(Locale.forLanguageTag("tr-TR")).replace('ı', 'i').replace('ş', 's').replace('ğ', 'g').replace('ç', 'c').replace('ö', 'o').replace('ü', 'u'),
        Normalizer.Form.NFD,
    ).replace(Regex("\\p{M}+"), "")

    fun matches(t: Term, query: String): Boolean {
        val hay = fold((listOf(t.term) + t.aka + t.short).joinToString(" "))
        return fold(query.trim()).split(Regex("\\s+")).all { it in hay }
    }

    fun filter(groups: List<TermGroup>, query: String): List<TermGroup> =
        if (query.isBlank()) groups else groups.map { g -> g.copy(terms = g.terms.filter { matches(it, query) }) }.filter { it.terms.isNotEmpty() }
}

/** Terimler sözlüğü (tam ekran katman). [target] verilirse o terime kaydırılır. */
@Composable
fun GlossaryScreen(target: String?, onClose: () -> Unit) {
    val context = LocalContext.current
    val all = remember { Glossary.load(context) }
    GlossaryContent(all, target, onClose)
}

@Composable
internal fun GlossaryContent(all: List<TermGroup>, target: String?, onClose: () -> Unit) {
    var query by rememberSaveable { mutableStateOf("") }
    var focus by rememberSaveable { mutableStateOf(target?.takeIf { it.isNotEmpty() }) }
    val groups = remember(all, query) { Glossary.filter(all, query) }
    val byId = remember(all) { all.flatMap { it.terms }.associateBy { it.id } }
    val listState = rememberLazyListState()
    // Liste sırası: her grupta bir başlık, ardından terimler
    val index = remember(groups) {
        val m = HashMap<String, Int>(); var i = 0
        groups.forEach { g -> i++; g.terms.forEach { t -> m[t.id] = i++ } }
        m
    }
    LaunchedEffect(focus, groups) { focus?.let { id -> index[id]?.let { listState.scrollToItem(it) } } }

    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding()) {
            Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 12.dp, top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onClose) { Icon(Icons.Default.Close, "Kapat") }
                OutlinedTextField(
                    value = query, onValueChange = { query = it; focus = null }, singleLine = true,
                    placeholder = { Text("Terim ara: RSI, F/K, piyasa değeri…") },
                    leadingIcon = { Icon(Icons.Default.Search, null) },
                    trailingIcon = { if (query.isNotEmpty()) IconButton(onClick = { query = "" }) { Icon(Icons.Default.Clear, "Aramayı temizle") } },
                    modifier = Modifier.weight(1f).testTag("glossary-search"),
                )
            }
            if (groups.isEmpty()) {
                Hint("Bu aramayla eşleşen terim yok. Kısaltmayı ya da başka bir adını dene (ör. EPS, ROE, EBITDA).")
            }
            LazyColumn(Modifier.weight(1f).testTag("glossary"), state = listState) {
                groups.forEach { g ->
                    item(key = "g_" + g.id) { SectionHeader(g.title) }
                    g.terms.forEach { t ->
                        item(key = t.id) { TermEntry(t, highlighted = t.id == focus, byId = byId) { id -> query = ""; focus = id } }
                    }
                }
                item { Box(Modifier.height(24.dp)) }
            }
        }
    }
}

@Composable
private fun TermEntry(t: Term, highlighted: Boolean, byId: Map<String, Term>, onOpen: (String) -> Unit) {
    Column(
        Modifier.fillMaxWidth()
            .background(if (highlighted) MaterialTheme.colorScheme.tertiaryContainer.copy(alpha = 0.35f) else androidx.compose.ui.graphics.Color.Transparent)
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Text(t.term, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        if (t.aka.isNotEmpty()) Text("Diğer adları: " + t.aka.joinToString(", "), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(t.short, Modifier.padding(top = 6.dp), style = MaterialTheme.typography.bodyMedium)
        if (t.formula.isNotEmpty()) {
            Row(Modifier.padding(top = 8.dp).height(androidx.compose.foundation.layout.IntrinsicSize.Min)) {
                Box(Modifier.width(3.dp).fillMaxHeight().background(MaterialTheme.colorScheme.tertiary, RoundedCornerShape(2.dp)))
                Column(Modifier.padding(start = 10.dp)) {
                    t.formula.forEach { Text(it, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold) }
                }
            }
        }
        t.body.forEach { Text(it, Modifier.padding(top = 6.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        t.example?.let { Labeled("Örnek.", it) }
        t.inApp?.let { Labeled("Piyasa’da.", it) }
        if (t.related.isNotEmpty()) {
            Row(Modifier.padding(top = 6.dp)) {
                Text("İlgili: ", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                t.related.mapNotNull { byId[it] }.forEachIndexed { i, r ->
                    Text((if (i > 0) ", " else "") + r.shortName, Modifier.clickable { onOpen(r.id) }, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                }
            }
        }
    }
    HorizontalDivider(Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
}

@Composable
private fun Labeled(label: String, text: String) {
    Text(
        androidx.compose.ui.text.buildAnnotatedString {
            pushStyle(androidx.compose.ui.text.SpanStyle(fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurface)); append("$label "); pop()
            append(text)
        },
        Modifier.padding(top = 6.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}
