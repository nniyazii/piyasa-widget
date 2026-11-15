package com.piyasa.widget.ui

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
import androidx.compose.material3.Surface
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
    LaunchedEffect(Unit) { while (true) { Remote.refreshAdvantage(context); delay(60_000) } }
    AdvantageContent(data, onClose, onGlossary, onRefresh = { scope.launch { Remote.refreshAdvantage(context) } })
}

@Composable
internal fun AdvantageContent(data: AdvantageData, onClose: () -> Unit, onGlossary: (String) -> Unit, onRefresh: () -> Unit) {
    Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.surface) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            Row(Modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp, top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onClose) { Icon(Icons.Default.Close, "Kapat") }
                Column(Modifier.weight(1f)) {
                    Text("Avantajlı fiyatlar", style = MaterialTheme.typography.titleMedium)
                    Text(
                        if (data.time == 0L) "Prim ve iskonto, birikim önerileri"
                        else SimpleDateFormat("d MMM HH:mm", tr).format(Date(data.time)) + " itibarıyla",
                        style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                if (data.loading) { CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp); Spacer(Modifier.size(14.dp)) }
                else IconButton(onClick = onRefresh) { Icon(Icons.Default.Refresh, "Yenile") }
            }
            LazyColumn(Modifier.weight(1f).testTag("advantage")) {
                item { Lead(data) }
                items(data.rows, key = { it.pair.symbol }) { r -> PremiumItem(r, data.open) }
                if (data.rows.isNotEmpty()) item { CostCompare(data, onGlossary) }
                if (data.advices.isNotEmpty()) {
                    item { SectionTitle("Birikim önerileri", "Bugünkü oran, kendi geçmişinin ortancasıyla karşılaştırılır. Ortancadan uzaklaştıkça sinyal güçlenir.") }
                    items(data.advices, key = { it.id.name }) { a -> AdviceCard(a, onGlossary) }
                }
                if (data.money.isNotEmpty()) {
                    item { SectionTitle("Para arzına göre", "Her fiyat ilgili para arzına (M2) bölünür ve kendi geçmiş ortancasıyla karşılaştırılır: ortancanın üstündeyse fiyat para arzından hızlı artmıştır.") }
                    items(data.money, key = { it.id.name }) { a -> AdviceCard(a, onGlossary) }
                }
                item { HowItWorks(onGlossary) }
            }
        }
    }
}

@Composable
private fun Lead(d: AdvantageData) {
    val buys = d.buys
    Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
        Text(
            "Altın ve gümüşe dayalı borsa ürünleri, içlerindeki madenin değerinden pahalıya (primli) ya da ucuza (iskontolu) işlem görebilir.",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            when {
                d.rows.isEmpty() -> d.error ?: "Fiyatlar alınıyor…"
                !d.open -> "BIST şu an kapalı. Farklar son kapanış fiyatına göredir; maden fiyatı o zamandan beri değiştiği için sinyal verilmez."
                buys.isNotEmpty() -> buys.joinToString(", ") { it.pair.code } + (if (buys.size == 1) " içindeki değerin altında: al sinyali." else " içlerindeki değerin altında: al sinyali.")
                else -> "Şu an değerinin altında işlem gören yok."
            },
            style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium,
        )
        if (d.error != null && d.rows.isNotEmpty()) Text("${d.error}; son bilinen değerler gösteriliyor.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
    }
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
        else -> (if (r.fixed) "Primli" else "Olağan") to 0
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

    SectionTitle("Banka mı, fon mu?", "Aynı parayla $name alıp bir süre sonra satarsan, her yolun toplam masrafı ve elinde kalan tutar.")
    Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Choice(listOf("Altın", "Gümüş"), metalIx) { metalIx = it }
        Choice(listOf("6 ay", "1 yıl", "3 yıl", "5 yıl"), yearIx) { yearIx = it }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            NumberInput("Tutar (₺)", amount, Modifier.weight(1.3f)) { amount = it }
            NumberInput("Yıllık artış %", growth, Modifier.weight(1f)) { growth = it }
            NumberInput("Komisyon ‰", commission, Modifier.weight(1f)) { commission = it }
        }
        Text(
            buildString {
                append(name.replaceFirstChar { it.titlecase(tr) })
                append(if (s.annualGrowth >= 0) " yılda ${pctAbs(s.annualGrowth)} artarsa" else " yılda ${pctAbs(s.annualGrowth)} düşerse")
                append(" en avantajlı yol: ${best.route.name}. ${tl(s.amount, 0)} yatırıp $span sonra satınca elinde ${tl(best.net, 0)} kalır; toplam masraf ${tl(best.cost, 0)}. ")
                if (even == null) append(if (fund.net >= bank.net) "Bu sürede fon, ${bank.route.name} karşısında her artış oranında önde." else "Bu sürede ${bank.route.name}, fon karşısında her artış oranında önde.")
                else {
                    val fundBelow = Costs.evaluate(fund.route, s.copy(annualGrowth = even - 0.01)).net > Costs.evaluate(bank.route, s.copy(annualGrowth = even - 0.01)).net
                    append("Başa baş noktası yıllık ${pctAbs(even)} artış: ${if (fundBelow) "altında fon, üstünde banka" else "altında banka, üstünde fon"} daha avantajlı.")
                }
            },
            Modifier.padding(top = 6.dp).testTag("cost-lead"), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium,
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
                "Fonlarda (GLDTR, ZGOLD, ISGLK, GMSTR) bir payın karşılığı olan maden miktarı sabit değildir: GMSTR’nin bir payı yaklaşık 6 gram gümüşe denktir ve bu miktar yılda yaklaşık %2 azalır. “Olağan” miktar son 20 işlem gününün ortancasıdır; fon bunun en az %2 altına indiğinde al sinyali, %2 üstüne çıktığında “pahalı” yazar.",
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
            Text("Avantajlı fiyatlar", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
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
