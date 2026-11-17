package com.piyasa.widget.ui

import com.piyasa.widget.data.OutlookEvent
import com.piyasa.widget.data.OutlookItem
import com.piyasa.widget.data.OutlookData
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.piyasa.widget.data.AdvantageData
import com.piyasa.widget.data.Remote
import com.piyasa.widget.model.Advices
import com.piyasa.widget.model.BankQuote
import com.piyasa.widget.model.Costs
import com.piyasa.widget.model.Fmt
import com.piyasa.widget.model.Metal
import com.piyasa.widget.model.Premiums
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs

private val tr = Locale.forLanguageTag("tr-TR")
private fun tl(v: Double?, d: Int = 2) = if (v == null) "—" else Fmt.number(v, d) + " ₺"
private fun pct(v: Double?, d: Int = 1) = when {
    v == null -> "—"
    else -> (if (v > 0.00005) "+" else if (v < -0.00005) "−" else "") + "%" + Fmt.number(abs(v * 100), d)
}
private fun pctAbs(v: Double, d: Int = 0) = "%" + Fmt.number(abs(v * 100), d)

/** Avantajlı fiyatlar (tam ekran katman): prim ve iskonto, banka mı fon mu, birikim önerileri. */
@Composable
fun AdvantageScreen(onClose: () -> Unit, onGlossary: (String) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val data by Remote.advantage.collectAsState()
    // Ekran açıkken dakikada bir yenile
    LaunchedEffect(Unit) { Remote.refreshOutlook(context); while (true) { Remote.refreshAdvantage(context); delay(60_000) } }
    val outlook by Remote.outlook.collectAsState()
    AdvantageContent(data, onClose, onGlossary, onRefresh = { scope.launch { Remote.refreshOutlook(context); Remote.refreshAdvantage(context) } }, outlook = outlook)
}

@Composable
internal fun AdvantageContent(data: AdvantageData, onClose: () -> Unit, onGlossary: (String) -> Unit, onRefresh: () -> Unit, initialTab: Int = 0, outlook: OutlookData? = null) {
    var tab by rememberSaveable { mutableStateOf(initialTab) }
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp, top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onClose) { Icon(Icons.Default.Close, "Kapat") }
                Column(Modifier.weight(1f)) {
                    Text("Analiz", style = MaterialTheme.typography.titleMedium)
                    Text(
                        if (data.time == 0L) "Altın, gümüş, ev, dolar, borsa"
                        else SimpleDateFormat("d MMM HH:mm", tr).format(Date(data.time)) + " itibarıyla",
                        style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (data.loading) { CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp); Spacer(Modifier.size(14.dp)) }
                else IconButton(onClick = onRefresh) { Icon(Icons.Default.Refresh, "Yenile") }
            }
            // Bir sayfa, bir soru: özet ve dört soru sayfası
            ScrollableTabRow(selectedTabIndex = tab, edgePadding = 12.dp, containerColor = MaterialTheme.colorScheme.surface, divider = { HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant) }) {
                TABS.forEachIndexed { i, t ->
                    Tab(selected = tab == i, onClick = { tab = i }, text = { Text(t, maxLines = 1, fontWeight = if (tab == i) FontWeight.SemiBold else FontWeight.Normal) })
                }
            }
            LazyColumn(Modifier.weight(1f).testTag("advantage")) {
                when (tab) {
                    0 -> if (outlook == null) item { Hint("Görünüm alınıyor… İnternet bağlantısı gerekir.") } else {
                        item { OutlookHead(outlook) }
                        item { FullAnalysisLinks() }
                        if (outlook.events.isNotEmpty()) {
                            item { SectionTitle("Yakın zamanda ne oldu; geçmişte aynı şeyden sonra ne olmuştu", "Aylık, haftalık ve günlük veride yakın zamanda gerçekleşen ve sonrasında yönü her zamankinden belirgin biçimde ayrıştırmış olaylar. Rakamlar bugünden sonra yukarıda olma oranı (parantezde her zamanki oran). Olaya dokun: mum grafikte bütün geçmiş örnekleri.") }
                            items(outlook.events.size) { i -> EventCard(outlook.events[i]) }
                            item { SectionTitle("Bugünkü durumun özeti (12 ay için)", null) }
                        }
                        items(outlook.list, key = { it.id }) { o -> OutlookCard(o) }
                        item { Text("Görüşler 12 ay içindir; değerleme, makro örüntü, benzer dönemler ve trendin birleşimidir. Soluk kanıtlar bu varlıkta geçmişte ayırt edici olmadığı için görüşe katılmaz. Ayrıntılar ve grafikler web sürümünde: Analiz › Görünüm ve Makro.", Modifier.padding(horizontal = 16.dp, vertical = 8.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                    1 -> item { Overview(data) { tab = it + 1 } }
                    2 -> {
                        item { Lead(data) }
                        items(data.rows, key = { it.pair.symbol }) { r -> PremiumItem(r, data.open) }
                        item { HowItWorks(onGlossary) }
                    }
                    3 -> if (data.rows.isNotEmpty()) item { CostCompare(data, onGlossary) } else item { Hint(data.error ?: "Fiyatlar alınıyor…") }
                    4 -> {
                        item {
                            val strong = data.advices.filter { it.strong }
                            Answer("Birikimimi neye çevirmeliyim?", if (strong.isEmpty()) "Şu an güçlü bir sinyal yok; oranlar her zamanki aralıkta." else strong.joinToString(". ") { it.action } + ".",
                                "Her oran kendi geçmiş ortancasıyla karşılaştırılır. Ortancadan uzaklaştıkça sinyal güçlenir.")
                        }
                        items(data.advices, key = { it.id.name }) { a -> AdviceCard(a, onGlossary) }
                    }
                    else -> {
                        item {
                            val cheap = data.money.filter { it.cheap }.mapNotNull { it.subject }; val dear = data.money.filterNot { it.cheap }.mapNotNull { it.subject }
                            Answer("Para arzına göre ne ucuz, ne pahalı?",
                                if (data.money.isEmpty()) "Para arzı verisi alınamadı." else listOfNotNull(cheap.takeIf { it.isNotEmpty() }?.let { "Ucuz: " + it.joinToString(", ") + "." }, dear.takeIf { it.isNotEmpty() }?.let { "Pahalı: " + it.joinToString(", ") + "." }).joinToString(" "),
                                "Para basıldıkça fiyatların da artması beklenir. Her fiyat ilgili para arzına (M2) bölünür ve kendi geçmiş ortancasıyla karşılaştırılır: ortancanın üstündeyse fiyat, basılan paradan hızlı artmıştır.")
                        }
                        items(data.money, key = { it.id.name }) { a -> AdviceCard(a, onGlossary) }
                    }
                }
                item { Text("Piyasa yatırım tavsiyesi vermez; bunlar geçmiş verilere dayalı göstergelerdir.", Modifier.padding(16.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
        }
    }
}

private val TABS = listOf("Görünüm", "Pratik", "Ürünler", "Nereden almalı", "Birikim", "Para arzı")

/** Görünüm başı: belirgin görüşler, makro tablonun kısa okuması */
@Composable
private fun OutlookHead(o: OutlookData) {
    val pro = o.list.filter { it.clear && it.tone > 0 }.map { it.short }
    val con = o.list.filter { it.clear && it.tone < 0 }.map { it.short }
    val answer = listOfNotNull(pro.takeIf { it.isNotEmpty() }?.let { "Olumlu: " + it.joinToString(", ") + "." }, con.takeIf { it.isNotEmpty() }?.let { "Olumsuz: " + it.joinToString(", ") + "." }).joinToString(" ").ifEmpty { "Hiçbir varlıkta belirgin bir yön yok." }
    Answer("Görünüm (${o.month}): son dönemde ne oldu, bundan sonrası için geçmiş ne söylüyor?", answer, if (o.analogs.isEmpty()) null else "Bugünkü tablo en çok ${o.analogs.take(3).joinToString(", ")} dönemlerine benziyor.")
    Surface(Modifier.padding(horizontal = 16.dp, vertical = 8.dp).fillMaxWidth(), color = MaterialTheme.colorScheme.surfaceVariant, shape = MaterialTheme.shapes.medium) {
        Column(Modifier.padding(14.dp)) {
            Text(o.regimeTitle, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            o.regimeLines.forEach { Text("• $it", Modifier.padding(top = 4.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
    }
}

/** Olay ve dört vade için yön olasılıkları */
@Composable
private fun EventCard(e: OutlookEvent) {
    val up = Color(0xFF0B7A4B); val down = Color(0xFFC2362F)
    val context = androidx.compose.ui.platform.LocalContext.current
    Column(Modifier.fillMaxWidth().clickable(enabled = e.id.isNotEmpty()) { WebActivity.open(context, "analiz?v=${e.id}&e=${android.net.Uri.encode(e.event)}&tf=${e.tf}") }.padding(horizontal = 16.dp, vertical = 10.dp)) {
        Text("${e.date} (${e.ago}); ${e.frame.lowercase()} veri; önceden ${e.times} kez", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(if (e.macro) "${e.text} → ${e.asset}" else e.text, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
        Row(Modifier.fillMaxWidth().padding(top = 6.dp)) {
            e.odds.forEach { o ->
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(o.label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(if (o.n < 5) "—" else o.up?.let { pctAbs(it) } ?: "—", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold,
                        color = when (o.tone) { 1 -> up; -1 -> down; else -> MaterialTheme.colorScheme.onSurface })
                    Text("(${pctAbs(o.base)})", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
                }
            }
        }
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
}

/** Tam analiz: mum grafik tezgâhı, hisse, makro ve alarmlar (web uygulaması, uygulama içinde açılır) */
@Composable
private fun FullAnalysisLinks() {
    val context = androidx.compose.ui.platform.LocalContext.current
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
        androidx.compose.material3.Button(onClick = { WebActivity.open(context, "analiz") }, modifier = Modifier.fillMaxWidth()) { Text("Mum grafikte incele: olaylar ve yön olasılıkları") }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp)) {
            listOf("Hisse" to "analiz/hisse", "Makro" to "analiz/makro", "Alarmlar" to "alarmlar").forEach { (label, path) ->
                androidx.compose.material3.OutlinedButton(onClick = { WebActivity.open(context, path) }, modifier = Modifier.weight(1f)) { Text(label, maxLines = 1) }
            }
        }
    }
}

private fun voteMark(v: Int) = when { v >= 2 -> "▲▲"; v == 1 -> "▲"; v <= -2 -> "▼▼"; v == -1 -> "▼"; else -> "–" }

/** Bir varlığın görüşü: başlık, güven, gerekçe; dokununca kanıtlar ve görüşü neyin değiştireceği */
@Composable
private fun OutlookCard(o: OutlookItem) {
    var open by rememberSaveable(o.id) { mutableStateOf(o.clear) }
    val up = Color(0xFF0B7A4B); val down = Color(0xFFC2362F)
    val tone = when (o.tone) { 1 -> up; -1 -> down; else -> MaterialTheme.colorScheme.onSurfaceVariant }
    Column(Modifier.fillMaxWidth().clickable { open = !open }.padding(horizontal = 16.dp, vertical = 12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(o.label + (o.price?.let { "  " + Fmt.number(it, if (it >= 1000) 0 else 2) } ?: ""), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(o.stance, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = tone)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(o.layers.joinToString("  ") { voteMark(it.vote) }, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (o.tone != 0) Text("güven ${o.conviction}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Text(o.why, Modifier.padding(top = 4.dp), style = MaterialTheme.typography.bodySmall)
        if (open) {
            o.layers.forEach { l ->
                val c = when { !l.counts -> MaterialTheme.colorScheme.outline; l.vote > 0 -> up; l.vote < 0 -> down; else -> MaterialTheme.colorScheme.onSurfaceVariant }
                Row(Modifier.padding(top = 10.dp)) {
                    Text(voteMark(l.vote), Modifier.width(34.dp), color = c, style = MaterialTheme.typography.labelLarge)
                    Column(Modifier.weight(1f)) {
                        Text(l.label + if (l.counts || l.vote == 0) "" else " (görüşe katılmıyor)", style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                        Text(l.text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (l.hit != null && l.base != null && l.vote != 0) Text("Sicil: bu durumdayken 12 ay sonra ${pctAbs(l.hit)} yukarıdaydı, her zaman ${pctAbs(l.base)}${l.n?.let { " ($it örnek)" } ?: ""}.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
                    }
                }
            }
            if (o.flips.isNotEmpty()) {
                Text("Görüşü ne değiştirir", Modifier.padding(top = 12.dp), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
                o.flips.forEach { Text("• $it", Modifier.padding(top = 3.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
        } else Text("Kanıtlar için dokun", Modifier.padding(top = 4.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
}

/** Sayfa başı: soru küçük, cevap büyük, altında bir cümle bağlam. */
@Composable
private fun Answer(question: String, answer: String, sub: String? = null) {
    Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 8.dp)) {
        Text(question, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(answer, Modifier.padding(top = 4.dp).testTag("answer"), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        if (sub != null) Text(sub, Modifier.padding(top = 10.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** Özet: her sorunun cevabı tek satırda; satır ilgili sayfayı açar. */
@Composable
private fun Overview(d: AdvantageData, open: (Int) -> Unit) {
    if (d.rows.isEmpty() && d.advices.isEmpty()) { Answer("Bugün ne yapmalı?", d.error ?: "Fiyatlar alınıyor…"); return }
    val all = d.advices + d.money
    val strong = all.count { it.strong } + d.buys.size
    Answer("Bugün ne yapmalı?", if (strong > 0) "Bugün $strong güçlü sinyal var." else "Bugün güçlü bir sinyal yok.",
        "Her sorunun cevabı aşağıda tek satırda; güçlü sinyaller işaretli. Gerekçesi için satıra dokun.")
    val cert = d.rows.firstOrNull { it.pair.symbol == "BIST:ALTIN" }?.premium
    fun best(metal: Metal): Costs.Outcome? {
        val rows = Costs.routes(metal, d.banks).map { Costs.evaluate(it, Costs.Scenario(100_000.0, 1.0, 0.3, 0.001)) }.sortedByDescending { it.net }
        return rows.firstOrNull { !(it.route.kind == Costs.Kind.CERT && (cert ?: 0.0) > 0.02) } ?: rows.firstOrNull()
    }
    val nearest = d.rows.filter { it.premium != null }.minByOrNull { it.premium!! }
    OverviewGroup("Altın ve gümüş ürünleri")
    OverviewRow("Değerinin altında işlem gören var mı?",
        when { !d.open -> "Sinyal seans içinde verilir"; d.buys.isNotEmpty() -> d.buys.joinToString(", ") { it.pair.code }; else -> "Şu an yok" },
        when { !d.open -> "BIST kapalı"; d.buys.isNotEmpty() -> "al sinyali"; nearest != null -> "en yakını ${nearest.pair.code} (${pct(nearest.premium)})"; else -> null },
        d.buys.isNotEmpty()) { open(1) }
    best(Metal.GOLD)?.let { OverviewRow("Altını nereden almalı?", it.route.name, "masraf ${pctAbs(it.cost / 100_000)}", false) { open(2) } }
    best(Metal.SILVER)?.let { OverviewRow("Gümüşü nereden almalı?", it.route.name, "masraf ${pctAbs(it.cost / 100_000)}", false) { open(2) } }
    if (d.advices.isNotEmpty()) {
        OverviewGroup("Birikim")
        listOf(Advices.Id.HOME_GOLD to "Altınım var; ev alayım mı?", Advices.Id.HOME_USD to "Dolarım var; ev alayım mı?", Advices.Id.GOLD_SILVER to "Altın mı, gümüş mü?").forEach { (id, q) ->
            all.firstOrNull { it.id == id }?.let { a -> OverviewRow(q, a.action, if (a.strong) "güçlü sinyal" else "zayıf sinyal", a.strong) { open(3) } }
        }
    }
    if (d.money.isNotEmpty()) {
        OverviewGroup("Para arzına göre")
        d.money.forEach { a -> OverviewRow(a.subject ?: "", a.action, if (a.strong) "güçlü sinyal" else "zayıf sinyal", a.strong) { open(4) } }
    }
}

@Composable
private fun OverviewGroup(title: String) {
    Text(title, Modifier.padding(start = 16.dp, end = 16.dp, top = 22.dp, bottom = 2.dp), style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
private fun OverviewRow(question: String, answer: String, note: String?, strong: Boolean, onClick: () -> Unit) {
    val accent = MaterialTheme.colorScheme.tertiary
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(question, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (strong) { Box(Modifier.size(7.dp).background(accent, androidx.compose.foundation.shape.CircleShape)); Spacer(Modifier.width(8.dp)) }
                Text(answer, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            if (note != null) Text(note, style = MaterialTheme.typography.labelSmall, fontWeight = if (strong) FontWeight.SemiBold else FontWeight.Normal, color = if (strong) accent else MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.outline)
    }
    HorizontalDivider(Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
}

@Composable
private fun Lead(d: AdvantageData) {
    val buys = d.buys
    Answer(
        "Altın ve gümüş ürünleri değerinin altında mı?",
        when {
            d.rows.isEmpty() -> d.error ?: "Fiyatlar alınıyor…"
            !d.open -> "BIST şu an kapalı; sinyal seans içinde verilir."
            buys.isNotEmpty() -> buys.joinToString(", ") { it.pair.code } + (if (buys.size == 1) " içindeki madenin değerinin altında." else " içlerindeki madenin değerinin altında.")
            else -> "Şu an değerinin altında işlem gören yok."
        },
        "Borsadaki altın ve gümüş ürünleri, içlerindeki madenin değerinden pahalıya (primli) ya da ucuza (iskontolu) işlem görebilir." +
            (if (!d.open) " Farklar son kapanışa göredir; maden fiyatı o zamandan beri değişti." else ""),
    )
    if (d.error != null && d.rows.isNotEmpty()) Text("${d.error}; son bilinen değerler gösteriliyor.", Modifier.padding(horizontal = 16.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
}

@Composable
private fun PremiumItem(r: Premiums.Row, open: Boolean) {
    val context = LocalContext.current
    Row(
        Modifier.fillMaxWidth().clickable { openUrl(context, "https://www.tradingview.com/chart/?symbol=${r.pair.symbol}") }.padding(horizontal = 16.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(r.pair.code, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
            Text(r.pair.name, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                if (r.grams == null) "Geçmiş verisi bekleniyor"
                else "İçindeki değer ${tl(r.fair)} · ${if (r.fixed) "" else "≈ "}${Fmt.number(r.grams, if (r.grams < 1) 4 else 2).trimEnd('0').trimEnd(',')} ${r.pair.metal.unit}",
                style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(tl(r.price), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
            Text(
                pct(r.premium) + if (r.fixed) " gram altına göre" else " olağana göre",
                style = MaterialTheme.typography.labelSmall,
                color = if ((r.premium ?: 1.0) <= 0) directionColor(1) else MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(3.dp))
            StatusChip(r, open)
        }
    }
    HorizontalDivider(Modifier.padding(horizontal = 16.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f))
}

@Composable
private fun StatusChip(r: Premiums.Row, open: Boolean) {
    val (text, dir) = when {
        r.signal == Premiums.Signal.UNKNOWN -> (if (r.price == null) "Fiyat yok" else "Bilinmiyor") to 0
        !open -> "BIST kapalı" to 0
        r.signal == Premiums.Signal.BUY -> "Al sinyali" to 1
        r.signal == Premiums.Signal.HIGH -> "Pahalı" to -1
        else -> (if (r.fixed) "Primli" else "Her zaman") to 0
    }
    Pill(text, dir)
}

@Composable
internal fun Pill(text: String, direction: Int) {
    val c = directionColor(direction)
    Box(Modifier.background(if (direction == 0) MaterialTheme.colorScheme.surfaceVariant else c.copy(alpha = 0.16f), RoundedCornerShape(7.dp)).padding(horizontal = 8.dp, vertical = 2.dp)) {
        Text(text, fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, color = if (direction == 0) MaterialTheme.colorScheme.onSurfaceVariant else c, maxLines = 1)
    }
}

@Composable
private fun SectionTitle(title: String, note: String? = null) {
    Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 22.dp, bottom = 4.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        if (note != null) Text(note, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Choice(options: List<String>, selected: Int, onSelect: (Int) -> Unit) {
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        options.forEachIndexed { i, label ->
            SegmentedButton(selected = i == selected, onClick = { onSelect(i) }, shape = SegmentedButtonDefaults.itemShape(i, options.size), icon = {}) {
                Text(label, maxLines = 1, fontSize = 13.sp)
            }
        }
    }
}

@Composable
private fun NumberInput(label: String, value: String, modifier: Modifier, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value, onValueChange = { s -> onChange(s.filter { it.isDigit() || it == ',' || it == '.' || it == '-' }.take(12)) },
        label = { Text(label, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }, singleLine = true, modifier = modifier,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
    )
}
private fun String.num(): Double? = replace(',', '.').toDoubleOrNull()

private val YEARS = listOf(0.5, 1.0, 3.0, 5.0)

/** Banka mı, fon mu? Aynı parayla alıp bir süre sonra satmanın tüm masrafları. */
@Composable
private fun CostCompare(d: AdvantageData, onGlossary: (String) -> Unit) {
    var metalIx by rememberSaveable { mutableStateOf(0) }
    var yearIx by rememberSaveable { mutableStateOf(1) }
    var amount by rememberSaveable { mutableStateOf("100000") }
    var growth by rememberSaveable { mutableStateOf("30") }
    var commission by rememberSaveable { mutableStateOf("1") }
    var ownBid by rememberSaveable { mutableStateOf("") }
    var ownAsk by rememberSaveable { mutableStateOf("") }
    val metal = if (metalIx == 0) Metal.GOLD else Metal.SILVER
    val name = if (metal == Metal.GOLD) "altın" else "gümüş"
    val s = Costs.Scenario((amount.num() ?: 0.0).coerceAtLeast(0.0), YEARS[yearIx], (growth.num() ?: 0.0) / 100, (commission.num() ?: 0.0).coerceAtLeast(0.0) / 1000)
    val own = ownBid.num()?.let { b -> ownAsk.num()?.let { a -> BankQuote(b, a) } }
    val ownInvalid = own != null && !(own.ask > own.bid && own.ask / own.bid < 1.2)
    val certPremium = d.rows.firstOrNull { it.pair.symbol == "BIST:ALTIN" }?.premium
    val rows = remember(d.banks, metal, s, own) { Costs.routes(metal, d.banks, own).map { Costs.evaluate(it, s) }.sortedByDescending { it.net } }
    // Sertifika primliyken masrafı düşük görünse de prim riski taşır: öneride sayılmaz
    val best = rows.firstOrNull { !(it.route.kind == Costs.Kind.CERT && (certPremium ?: 0.0) > 0.02) } ?: rows.first()
    val fund = rows.first { it.route.kind == Costs.Kind.FUND }
    val bank = rows.first { it.route.kind == Costs.Kind.BANK }
    val even = remember(fund.route, bank.route, s) { Costs.breakEven(fund.route, bank.route, s) }
    val span = if (YEARS[yearIx] == 0.5) "6 ay" else "${YEARS[yearIx].toInt()} yıl"

    Answer(if (metal == Metal.GOLD) "Altını nereden almalı?" else "Gümüşü nereden almalı?", "${best.route.name}. Elinde ${tl(best.net, 0)} kalır; toplam masraf ${tl(best.cost, 0)}.",
        "Aynı parayla $name alıp bir süre sonra satarsan, her yolun toplam masrafı ve elinde kalan tutar.")
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Choice(listOf("Altın", "Gümüş"), metalIx) { metalIx = it }
        Choice(listOf("6 ay", "1 yıl", "3 yıl", "5 yıl"), yearIx) { yearIx = it }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            NumberInput("Tutar (₺)", amount, Modifier.weight(1.3f)) { amount = it }
            NumberInput("Yıllık artış %", growth, Modifier.weight(1f)) { growth = it }
            NumberInput("Komisyon ‰", commission, Modifier.weight(1f)) { commission = it }
        }
        Text(
            if (even == null) (if (fund.net >= bank.net) "Bu sürede fon, ${bank.route.name} karşısında her artış oranında önde." else "Bu sürede ${bank.route.name}, fon karşısında her artış oranında önde.")
            else {
                val fundBelow = Costs.evaluate(fund.route, s.copy(annualGrowth = even - 0.01)).net > Costs.evaluate(bank.route, s.copy(annualGrowth = even - 0.01)).net
                "Banka ile fon arasında başa baş noktası yıllık ${pctAbs(even)} artış: ${if (fundBelow) "altında fon, üstünde banka" else "altında banka, üstünde fon"} daha avantajlı. Fonun vergisi kazançla büyür, bankanın makası sabittir."
            },
            Modifier.padding(top = 6.dp).testTag("cost-lead"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    Column(Modifier.padding(top = 6.dp)) { rows.forEach { CostRow(it, it === best) } }
    Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (metal == Metal.GOLD && certPremium != null && certPremium > 0.01) {
            Text(
                "ALTIN.S1’in masrafı en düşük, ama şu an gram altının ${pctAbs(certPremium, 1)} üstünde işlem görüyor. Hesap bu primin satarken de aynı kalacağını varsayar; prim kapanırsa sertifika o kadar kaybettirir. Bu yüzden öneride sayılmadı.",
                style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        val fmt = SimpleDateFormat("d MMM HH:mm", tr)
        if (d.banks?.session == false) {
            Text("Banka fiyatları mesai dışında okundu (${fmt.format(Date(d.banks.generated))}). Bankalar mesai dışında ve hafta sonu makası belirgin biçimde açar; hafta içi 09:30–17:30 arasında makaslar çok daha dardır.",
                style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
        }
        if (d.banks?.offHoursAt != null) {
            Text("Şu an banka mesaisi dışında; karşılaştırma mesai içindeki son fiyatlarla (${fmt.format(Date(d.banks.generated))}) yapıldı. Şu an alırsan makas daha geniş olur.",
                style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text("Bankan ya da kuyumcun listede yoksa (ör. İş Bankası) gram $name alış ve satış fiyatını gir:", style = MaterialTheme.typography.bodySmall)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            NumberInput("Bankanın alışı (₺)", ownBid, Modifier.weight(1f)) { ownBid = it }
            NumberInput("Bankanın satışı (₺)", ownAsk, Modifier.weight(1f)) { ownAsk = it }
        }
        if (ownInvalid) Text("Satış fiyatı alıştan yüksek olmalı (bankanın sana sattığı fiyat).", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
        Text(
            buildString {
                append("Banka: makas")
                append(if (d.banks?.banks?.any { it.quote(metal) != null } == true) " (bankaların sitelerinde yayımladığı fiyatlar" + (d.banks.generated.takeIf { it > 0 }?.let { ", " + SimpleDateFormat("d MMM HH:mm", tr).format(Date(it)) } ?: "") + ")" else " (canlı fiyat alınamadı; her yönde %1,3 varsayıldı)")
                append(" ve alımda binde 2 BSMV. Fiziki: yalnızca makas; saklama ve çalınma riski hesapta yok. Fon: komisyon (+%5 BSMV), borsa makası (%0,1), yıllık gider (%0,47) ve kazançtan %17,5 stopaj. Oranlar Kasım 2026 itibarıyladır; bankandan ve aracı kurumundan doğrula.")
            },
            style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text("Makas, BSMV ve stopaj nedir?", Modifier.clickable { onGlossary("masraflar") }.padding(vertical = 4.dp),
            style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
    }
}

@Composable
private fun CostRow(o: Costs.Outcome, best: Boolean) {
    val r = o.route
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 7.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.width(3.dp).height(38.dp).background(if (best) directionColor(1) else Color.Transparent, RoundedCornerShape(2.dp)))
        Spacer(Modifier.width(9.dp))
        Column(Modifier.weight(1f)) {
            Text(r.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
            val parts = listOfNotNull(
                o.spread.takeIf { it > 0.5 }?.let { "makas ${tl(it, 0)}" }, o.buyTax.takeIf { it > 0.5 }?.let { "BSMV ${tl(it, 0)}" },
                o.commission.takeIf { it > 0.5 }?.let { "komisyon ${tl(it, 0)}" }, o.fee.takeIf { it > 0.5 }?.let { "yönetim ${tl(it, 0)}" },
                o.gainTax.takeIf { it > 0.5 }?.let { "stopaj ${tl(it, 0)}" },
            )
            Text(parts.joinToString(" · ").ifEmpty { "masraf yok" }, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.width(8.dp))
        Column(horizontalAlignment = Alignment.End) {
            Text(tl(o.net, 0), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, color = if (best) directionColor(1) else MaterialTheme.colorScheme.onSurface)
            Text("masraf ${tl(o.cost, 0)}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun AdviceCard(a: Advices.Advice, onGlossary: (String) -> Unit) {
    val money = a.subject != null
    val home = !money && a.id != Advices.Id.GOLD_SILVER
    val what = if (a.id == Advices.Id.HOME_GOLD) "altın" else "dolar"
    val accent = if (a.strong) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.onSurfaceVariant
    OutlinedCard(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 5.dp)) {
        Column(Modifier.padding(14.dp)) {
            Text(a.title, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(a.action, Modifier.weight(1f, fill = false), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Spacer(Modifier.width(8.dp))
                Box(Modifier.background(accent.copy(alpha = 0.14f), RoundedCornerShape(6.dp)).padding(horizontal = 7.dp, vertical = 2.dp)) {
                    Text(if (a.strong) "Güçlü sinyal" else "Zayıf sinyal", fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, color = accent)
                }
            }
            Spacer(Modifier.height(6.dp))
            Text(
                if (money) "${a.subject}, ${a.basis} uzun dönem ortancasının ${pctAbs(a.vsMedian)} ${if (a.vsMedian < 0) "altında" else "üstünde"}. Geçmişte bugünkünden ${if (a.cheap) "pahalı" else "ucuz"} olduğu ayların oranı ${pctAbs(if (a.cheap) 1 - a.percentile else a.percentile)}. Yani ${if (a.subject!!.startsWith("BIST")) a.subject else a.subject.lowercase(tr)} ${if (a.cheap) "ucuz" else "pahalı"}${if (a.id == Advices.Id.M2_USDTRY) (if (a.cheap) ", TL pahalı" else ", TL ucuz") else ""}."
                else if (home) "Ev, $what cinsinden uzun dönem ortancasının ${pctAbs(a.vsMedian)} ${if (a.vsMedian < 0) "altında" else "üstünde"}. Geçmişte bugünkünden ${if (a.cheap) "pahalı" else "ucuz"} olduğu ayların oranı ${pctAbs(if (a.cheap) 1 - a.percentile else a.percentile)}."
                else "1 ons altın ${Fmt.number(a.value, 1)} ons gümüş ediyor; son 20 yılın ortancası ${Fmt.number(a.median, 1)}. Rasyo ${if (a.cheap) "düşükken altın gümüşe" else "yüksekken gümüş altına"} göre ucuzdur.",
                style = MaterialTheme.typography.bodySmall,
            )
            Spacer(Modifier.height(12.dp))
            RangeBar(a, if (a.strong) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.onSurface)
            Row(Modifier.fillMaxWidth().padding(top = 4.dp)) {
                Text(if (money) "ucuz" else if (home) "ev ucuz" else "altın ucuz (${Fmt.number(a.min, 0)})", Modifier.weight(1f), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(if (money) "pahalı" else if (home) "ev pahalı" else "gümüş ucuz (${Fmt.number(a.max, 0)})", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.End)
            }
            Spacer(Modifier.height(6.dp))
            Text(
                "${Advices.monthLabel(a.since)} sonrası ${a.months} ay." + (a.m2Month?.let { " Para arzı en son ${Advices.monthLabel(it)} için açıklandı." } ?: "") + (a.hpiMonth?.let { m -> " Konut endeksi en son ${Advices.monthLabel(m)} için açıklandı" + (a.hpiGap?.takeIf { it > 0 }?.let { "; $it aylık artış tahminle eklendi" } ?: "") + "." } ?: ""),
                style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text("Nasıl hesaplanıyor?", Modifier.clickable { onGlossary(if (money) "para-arzi" else if (home) "ev-altin" else "altin-gumus") }.padding(top = 6.dp),
                style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
        }
    }
}

/** Geçmiş aralık: açık zemin en düşük–en yüksek, koyu bant orta %50, çizgi ortanca, nokta bugün. */
@Composable
private fun RangeBar(a: Advices.Advice, dot: Color) {
    val track = MaterialTheme.colorScheme.surfaceVariant
    val band = MaterialTheme.colorScheme.outlineVariant
    val med = MaterialTheme.colorScheme.onSurfaceVariant
    val bg = MaterialTheme.colorScheme.surface
    val span = a.max - a.min
    fun pos(v: Double) = (if (span > 0) ((v - a.min) / span).coerceIn(0.0, 1.0) else 0.5).toFloat()
    Canvas(Modifier.fillMaxWidth().height(16.dp).padding(horizontal = 6.dp)) {
        val h = 8.dp.toPx(); val y = (size.height - h) / 2
        drawRoundRect(track, Offset(0f, y), Size(size.width, h), CornerRadius(h / 2))
        drawRect(band, Offset(pos(a.p25) * size.width, y), Size((pos(a.p75) - pos(a.p25)) * size.width, h))
        drawRect(med, Offset(pos(a.median) * size.width - 1.dp.toPx(), 0f), Size(2.dp.toPx(), size.height))
        val c = Offset(pos(a.value) * size.width, size.height / 2)
        drawCircle(bg, 8.dp.toPx(), c); drawCircle(dot, 6.dp.toPx(), c)
    }
}

@Composable
private fun HowItWorks(onGlossary: (String) -> Unit) {
    var open by rememberSaveable { mutableStateOf(false) }
    Column(Modifier.padding(horizontal = 16.dp, vertical = 14.dp)) {
        Row(Modifier.clickable { open = !open }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Info, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.width(6.dp))
            Text("Nasıl hesaplanıyor, nelere dikkat etmeli", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
        }
        if (open) {
            listOf(
                "Gram fiyatı = ons fiyatı ($) × Dolar/TL ÷ 31,1035. Ons ve kur anlıktır; BIST fiyatları 15 dakika gecikmelidir.",
                "ALTIN.S1 her zaman 0,01 gram altındır; fark doğrudan gram altına göredir. Sertifika çoğu zaman primlidir; gram altının altına indiği günler seyrektir ve al sinyali bu durumda verilir.",
                "Fonlarda (GLDTR, ZGOLD, ISGLK, GMSTR) bir payın karşılığı olan maden miktarı sabit değildir: GMSTR’nin bir payı yaklaşık 6 gram gümüşe denktir ve bu miktar yılda yaklaşık %2 azalır. “Her zaman” miktar son 20 işlem gününün ortancasıdır; fon bunun en az %2 altına indiğinde al sinyali, %2 üstüne çıktığında “pahalı” yazar.",
                "Sinyal, ürünün madene göre ucuzladığını söyler; madenin kendisinin yükseleceğini söylemez.",
                "BIST kapalıyken sinyal verilmez. Resmî tatiller bilinmediği için tatil günlerinde fark yanıltıcı olabilir.",
                "Konut endeksi Türkiye ortalamasıdır ve yaklaşık iki ay gecikmeyle açıklanır; şehir, semt ve tek tek evler çok farklı olabilir. Öneriler alım masraflarını, kirayı ve kredi faizini hesaba katmaz.",
                "Para arzına göre: M2, dolaşımdaki para ile mevduatın toplamıdır. Türkiye M2’si döviz mevduatını da TL karşılığıyla içerir; kur yükselince M2 de büyür, bu yüzden dolar ve altın bu ölçüyle olduğundan biraz ucuz görünür. Bu bir değerleme göstergesidir, zamanlama sinyali değildir.",
                "Piyasa yatırım tavsiyesi vermez.",
            ).forEach { Text("• $it", Modifier.padding(vertical = 3.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            Text("Prim ve iskonto nedir?", Modifier.clickable { onGlossary("prim-iskonto") }.padding(vertical = 6.dp), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
        }
    }
}

/** Ana listedeki giriş kartı: sinyal sayısı ve öneriler bir bakışta. */
@Composable
fun AdvantageCard(d: AdvantageData, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.width(3.dp).height(44.dp).background(MaterialTheme.colorScheme.tertiary, RoundedCornerShape(2.dp)))
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text("Analiz", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
            Text(
                when {
                    d.rows.isEmpty() -> d.error ?: "Altın ve gümüşte prim, iskonto ve birikim önerileri"
                    !d.open -> "BIST kapalı; sinyal seans içinde verilir"
                    d.buys.isNotEmpty() -> d.buys.joinToString(", ") { it.pair.code } + ": değerinin altında"
                    else -> "Şu an değerinin altında olan yok"
                },
                style = MaterialTheme.typography.labelSmall, color = if (d.buys.isNotEmpty()) directionColor(1) else MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            if (d.advices.isNotEmpty()) {
                Text(d.advices.joinToString(" · ") { it.action }, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        if (d.rows.isNotEmpty()) {
            Spacer(Modifier.width(8.dp))
            Surface(shape = RoundedCornerShape(8.dp), color = MaterialTheme.colorScheme.tertiaryContainer) {
                Text("${d.buys.size}", Modifier.padding(horizontal = 10.dp, vertical = 4.dp), color = MaterialTheme.colorScheme.onTertiaryContainer, fontWeight = FontWeight.Bold)
            }
        }
    }
}
