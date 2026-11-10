package com.piyasa.widget.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Shader
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.ColorFilter
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.Action
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.lazy.LazyColumn
import androidx.glance.appwidget.lazy.itemsIndexed
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.compose.ui.graphics.Color
import androidx.glance.color.ColorProvider
import androidx.glance.unit.ColorProvider as GColor
import com.piyasa.widget.R
import com.piyasa.widget.config.WidgetConfigActivity
import com.piyasa.widget.data.Actions
import com.piyasa.widget.data.appStore
import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.Display
import com.piyasa.widget.model.DisplayItem
import com.piyasa.widget.model.WidgetConfig
import com.piyasa.widget.model.WidgetTheme
import com.piyasa.widget.model.ChangeStyle
import com.piyasa.widget.model.FormulaEngine
import com.piyasa.widget.ui.MainActivity
import com.piyasa.widget.work.RefreshWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** @param previewConfig yalnızca önizleme/test için: widget kimliğinden bağımsız sabit yapılandırma. */
class PiyasaWidget(private val previewConfig: WidgetConfig? = null) : GlanceAppWidget() {

    // Exact: düzen gerçek widget boyutuna göre (bant / liste / çift sütun, satır kapasitesi) seçilir.
    override val sizeMode: SizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val appWidgetId = runCatching { GlanceAppWidgetManager(context).getAppWidgetId(id) }.getOrDefault(-1)
        val initial = context.appStore.data.first()
        provideContent {
            val state by context.appStore.data.collectAsState(initial)
            WidgetContent(state, previewConfig ?: state.widgetConfig(appWidgetId), appWidgetId)
        }
    }
}

class PiyasaWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = PiyasaWidget()

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        RefreshWorker.runNow(context)
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        super.onDeleted(context, appWidgetIds)
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                Actions.removeWidgets(context.applicationContext, appWidgetIds)
            } finally {
                pending.finish()
            }
        }
    }
}

class RefreshAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        context.appStore.updateData { it.copy(refreshing = true) }
        RefreshWorker.runNow(context)
    }
}

// ------------------------------------------------------------------ stil

/** Bir widget örneğinin görünümü: renkler (tema + opaklık), yazı ölçeği, satır aralığı. */
private class WStyle(private val cfg: WidgetConfig) {
    private fun pick(day: Long, night: Long, alpha: Float = 1f): GColor {
        val d = Color(day).let { if (alpha < 1f) it.copy(alpha = it.alpha * alpha) else it }
        val n = Color(night).let { if (alpha < 1f) it.copy(alpha = it.alpha * alpha) else it }
        return when (cfg.theme) {
            WidgetTheme.SYSTEM -> ColorProvider(day = d, night = n)
            WidgetTheme.LIGHT -> ColorProvider(day = d, night = d)
            WidgetTheme.DARK -> ColorProvider(day = n, night = n)
        }
    }

    val bg = pick(0xFFFAFBFC, 0xFF111519, cfg.opacity.coerceIn(0.2f, 1f))
    val text = pick(0xFF0E141B, 0xFFF1F4F7)
    val muted = pick(0xFF6B7785, 0xFF8B95A1)
    val divider = pick(0x120E141B, 0x14FFFFFF)
    val up = pick(0xFF0E9F6E, 0xFF34D399)
    val down = pick(0xFFE02D3C, 0xFFFB7185)
    val pillUp = pick(0x1F0E9F6E, 0x2634D399)
    val pillDown = pick(0x1FE02D3C, 0x26FB7185)
    val pillFlat = pick(0x146B7785, 0x1A8B95A1)
    val section = pick(0xFF3B5BDB, 0xFF91A7FF)

    val scale = cfg.textScale.coerceIn(0.7f, 1.6f)
    val pad = cfg.density.padding
    val changeStyle = cfg.changeStyle
    val theme = cfg.theme

    fun sp(v: Float) = (v * scale).sp
    fun forDirection(d: Int) = when (d) { 1 -> up; -1 -> down; else -> muted }
    fun pillFor(d: Int) = when (d) { 1 -> pillUp; -1 -> pillDown; else -> pillFlat }

    /** Mini grafik rengi (bitmap için düz renk): tema zorlanmışsa o, değilse sistem gece modu. */
    fun sparkColor(context: Context, d: Int): Int {
        val night = when (theme) {
            WidgetTheme.DARK -> true
            WidgetTheme.LIGHT -> false
            WidgetTheme.SYSTEM -> (context.resources.configuration.uiMode and
                android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES
        }
        val argb = when (d) {
            1 -> if (night) 0xFF34D399 else 0xFF0E9F6E
            -1 -> if (night) 0xFFFB7185 else 0xFFE02D3C
            else -> if (night) 0xFF8B95A1 else 0xFF6B7785
        }
        return argb.toInt()
    }
}

/** Satıra dokununca TradingView (uygulama yüklüyse uygulamada) açılır; çevrilemeyen kalemde uygulama açılır. */
private fun rowAction(item: DisplayItem, fallback: Action): Action {
    val url = item.tvUrl ?: return fallback
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return androidx.glance.appwidget.action.actionStartActivity(intent)
}

/** Widget satırları: bölüm başlığı ya da (çift sütunda iki) gösterge. */
private sealed interface Line {
    data class Header(val title: String) : Line
    data class Items(val items: List<DisplayItem>) : Line
    /** Dinamik liste boşsa/taranmadıysa kısa açıklama. */
    data class Note(val text: String) : Line
}

private fun buildLines(state: AppState, cfg: WidgetConfig, twoColumns: Boolean): List<Line> {
    val engine = FormulaEngine(state)
    val out = mutableListOf<Line>()
    val pending = mutableListOf<DisplayItem>()
    fun flush() {
        if (pending.isEmpty()) return
        if (twoColumns) pending.chunked(2).forEach { out += Line.Items(it) } else pending.forEach { out += Line.Items(listOf(it)) }
        pending.clear()
    }
    for (k in cfg.keys) {
        when {
            WidgetConfig.isSection(k) -> {
                flush()
                out += Line.Header(WidgetConfig.sectionTitle(k))
            }
            // Dinamik liste: başlık + ilk N sonuç (her yenilemede değişir)
            WidgetConfig.isScreen(k) -> {
                val scr = state.screen(WidgetConfig.screenId(k)) ?: continue
                flush()
                out += Line.Header(scr.name)
                val r = state.screenResults[scr.id]
                val rows = r?.rows.orEmpty().take(cfg.screenRows.coerceIn(1, 20))
                if (rows.isEmpty()) {
                    out += Line.Note(
                        when {
                            r == null -> "Taranıyor…"
                            r.error != null -> r.error
                            else -> "Şu an eşleşen yok"
                        },
                    )
                } else {
                    rows.forEach { pending += Display.screenRowItem(it) }
                    flush()
                }
            }
            else -> Display.item(state, engine, k)?.let { pending += it }
        }
    }
    flush()
    // Arkasında gösterge olmayan başlıkları at
    return out.filterIndexed { i, l -> l !is Line.Header || out.getOrNull(i + 1).let { it is Line.Items || it is Line.Note } }
}

// ------------------------------------------------------------------ içerik

@Composable
private fun WidgetContent(state: AppState, cfg: WidgetConfig, appWidgetId: Int) {
    val context = LocalContext.current
    val size = LocalSize.current
    val st = WStyle(cfg)

    val configIntent = Intent(context, WidgetConfigActivity::class.java)
        .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    val openConfig = androidx.glance.appwidget.action.actionStartActivity(configIntent)
    val openApp = actionStartActivity<MainActivity>()

    val stripMode = size.height.value < 100f * st.scale.coerceAtLeast(1f)
    val twoColumns = !stripMode && size.width.value >= 330f * st.scale && cfg.itemKeys.size > 3
    val lines = buildLines(state, cfg, twoColumns)

    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            // Yuvarlak köşeli maske, seçilen renk ve opaklıkla boyanır (tüm Android sürümlerinde yuvarlak).
            .background(ImageProvider(R.drawable.widget_mask), colorFilter = ColorFilter.tint(st.bg))
            .cornerRadius(20.dp),
    ) {
        when {
            lines.none { it is Line.Items || it is Line.Note } -> EmptyState(st, openConfig)
            stripMode -> Strip(st, lines.filterIsInstance<Line.Items>().flatMap { it.items }, size.width.value, openApp)
            else -> ListLayout(st, state, cfg, lines, twoColumns, size.width.value, size.height.value, openApp)
        }
    }
}

@Composable
private fun EmptyState(st: WStyle, onClick: Action) {
    Column(
        modifier = GlanceModifier.fillMaxSize().padding(12.dp).clickable(onClick),
        verticalAlignment = Alignment.CenterVertically,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Piyasa", style = TextStyle(color = st.text, fontSize = st.sp(13f), fontWeight = FontWeight.Bold))
        Text("Göstergeleri seçmek için dokun", style = TextStyle(color = st.muted, fontSize = st.sp(10f)))
    }
}

/** 1 satır yüksekliğinde: yan yana kutucuklar (kayan bant görünümü). */
@Composable
private fun Strip(st: WStyle, items: List<DisplayItem>, widthDp: Float, onClick: Action) {
    val count = (widthDp / (105f * st.scale)).toInt().coerceIn(1, items.size)
    Row(
        modifier = GlanceModifier.fillMaxSize().padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        items.take(count).forEachIndexed { i, item ->
            if (i > 0) {
                Spacer(GlanceModifier.width(8.dp))
                Box(GlanceModifier.width(1.dp).height(26.dp).background(st.divider)) {}
                Spacer(GlanceModifier.width(8.dp))
            }
            Column(modifier = GlanceModifier.defaultWeight().clickable(rowAction(item, onClick))) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        item.title,
                        style = TextStyle(color = st.muted, fontSize = st.sp(10f), fontWeight = FontWeight.Medium),
                        maxLines = 1,
                        modifier = GlanceModifier.defaultWeight(),
                    )
                    if (st.changeStyle != ChangeStyle.HIDDEN) {
                        Spacer(GlanceModifier.width(4.dp))
                        Text(
                            item.changeText,
                            style = TextStyle(color = st.forDirection(item.direction), fontSize = st.sp(10f), fontWeight = FontWeight.Bold),
                            maxLines = 1,
                        )
                    }
                }
                Text(
                    item.valueText,
                    style = TextStyle(color = st.text, fontSize = st.sp(15f), fontWeight = FontWeight.Bold),
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
private fun ListLayout(
    st: WStyle,
    state: AppState,
    cfg: WidgetConfig,
    lines: List<Line>,
    twoColumns: Boolean,
    widthDp: Float,
    heightDp: Float,
    openApp: Action,
) {
    val compact = widthDp < 200f * st.scale
    // Büyük yazıda yer kalmazsa mini grafik otomatik gizlenir (isimler kesilmesin).
    val showSpark = cfg.showSpark && !compact && !twoColumns && widthDp >= 290f * st.scale
    val showSubtitle = cfg.showSubtitle && !compact
    val items = lines.filterIsInstance<Line.Items>().flatMap { it.items }

    // Sığıyorsa düz Column (kaydırma yok, daha hızlı); sığmıyorsa kaydırılabilir liste.
    val itemHeight = when {
        compact -> 34f * st.scale + 2 * st.pad
        showSubtitle -> 28f * st.scale + 2 * st.pad
        else -> 17f * st.scale + 2 * st.pad + 1
    }.let { it.coerceAtLeast(if (st.changeStyle == ChangeStyle.PILL) 19f * st.scale + 2 * st.pad else 0f) }
    val headerHeight = 20f * st.scale
    val topHeight = if (cfg.showHeader) 26f * st.scale.coerceAtLeast(1f) + 2f else 0f
    val needed = lines.sumOf { (if (it is Line.Items) itemHeight else headerHeight).toDouble() }
    val fits = needed <= heightDp - 12f - topHeight && lines.size <= 10
    // Değer sütunu sabit genişlikte ve sağa hizalı: grafikler ve rozetler alt alta hizalanır.
    val charDp = (if (twoColumns) 6.4f else 7.6f) * st.scale
    val valueWidth = (items.maxOfOrNull { it.valueText.length } ?: 4) * charDp + 4f

    Column(modifier = GlanceModifier.fillMaxSize().padding(start = 12.dp, end = 8.dp, top = 8.dp, bottom = 4.dp)) {
        if (cfg.showHeader) {
            Header(st, state, cfg, openApp)
            Spacer(GlanceModifier.height(2.dp))
        }
        val body: @Composable (Int, Line) -> Unit = { index, line ->
            when (line) {
                is Line.Header -> SectionTitle(st, line.title, first = index == 0)
                is Line.Items -> RowLine(
                    st, line.items, last = index == lines.lastIndex || lines.getOrNull(index + 1) is Line.Header,
                    twoColumns, showSpark, showSubtitle, compact, valueWidth, openApp,
                )
                is Line.Note -> Text(
                    line.text,
                    style = TextStyle(color = st.muted, fontSize = st.sp(10f)),
                    maxLines = 1,
                    modifier = GlanceModifier.fillMaxWidth().padding(vertical = 3.dp).clickable(openApp),
                )
            }
        }
        if (fits) {
            Column(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
                lines.forEachIndexed { i, l -> body(i, l) }
            }
        } else {
            LazyColumn(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
                itemsIndexed(lines, itemId = { i, _ -> i.toLong() }) { i, l -> body(i, l) }
            }
        }
    }
}

@Composable
private fun SectionTitle(st: WStyle, title: String, first: Boolean) {
    Column(modifier = GlanceModifier.fillMaxWidth().padding(top = if (first) 0.dp else 6.dp, bottom = 1.dp, end = 4.dp)) {
        Text(
            title.uppercase(Locale.forLanguageTag("tr-TR")),
            style = TextStyle(color = st.section, fontSize = st.sp(9.5f), fontWeight = FontWeight.Bold),
            maxLines = 1,
        )
    }
}

@Composable
private fun RowLine(
    st: WStyle,
    row: List<DisplayItem>,
    last: Boolean,
    twoColumns: Boolean,
    showSpark: Boolean,
    showSubtitle: Boolean,
    compact: Boolean,
    valueWidth: Float,
    openApp: Action,
) {
    Column(modifier = GlanceModifier.fillMaxWidth().padding(end = 4.dp)) {
        Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            row.forEachIndexed { i, item ->
                if (i > 0) {
                    Spacer(GlanceModifier.width(8.dp))
                    Box(GlanceModifier.width(1.dp).height((20f * st.scale).dp).background(st.divider)) {}
                    Spacer(GlanceModifier.width(8.dp))
                }
                val click = GlanceModifier.defaultWeight().clickable(rowAction(item, openApp))
                if (compact && !twoColumns) {
                    NarrowRow(st, item, click)
                } else {
                    ItemRow(st, item, showSpark, showSubtitle, compact = twoColumns, valueWidth = valueWidth, modifier = click)
                }
            }
            if (twoColumns && row.size == 1) {
                Spacer(GlanceModifier.width(17.dp))
                Spacer(GlanceModifier.defaultWeight())
            }
        }
        if (!last) {
            Box(GlanceModifier.fillMaxWidth().height(1.dp).background(st.divider)) {}
        }
    }
}

@Composable
private fun Header(st: WStyle, state: AppState, cfg: WidgetConfig, openApp: Action) {
    val status = when {
        state.refreshing -> "Güncelleniyor…"
        state.lastRefresh == 0L -> "—"
        else -> SimpleDateFormat("HH:mm", Locale.forLanguageTag("tr-TR")).format(Date(state.lastRefresh))
    }
    val warn = state.lastError != null && !state.refreshing
    Row(modifier = GlanceModifier.fillMaxWidth().height((24f * st.scale.coerceAtLeast(1f)).dp), verticalAlignment = Alignment.CenterVertically) {
        Text(
            cfg.title.uppercase(Locale.forLanguageTag("tr-TR")),
            style = TextStyle(color = st.muted, fontSize = st.sp(10f), fontWeight = FontWeight.Bold),
            maxLines = 1,
            modifier = GlanceModifier.defaultWeight().clickable(openApp),
        )
        if (cfg.showTime) {
            Text(
                if (warn) "! $status" else status,
                style = TextStyle(color = if (warn) st.down else st.muted, fontSize = st.sp(10f)),
                maxLines = 1,
            )
        }
        Box(
            modifier = GlanceModifier.size(26.dp, 24.dp).clickable(actionRunCallback<RefreshAction>()),
            contentAlignment = Alignment.Center,
        ) {
            Image(
                provider = ImageProvider(R.drawable.ic_refresh),
                contentDescription = "Yenile",
                modifier = GlanceModifier.size((14f * st.scale).dp),
                colorFilter = ColorFilter.tint(st.muted),
            )
        }
    }
}

/** Dar widget (2 hücre): ad + değişim üstte, değer altta. */
@Composable
private fun NarrowRow(st: WStyle, item: DisplayItem, modifier: GlanceModifier) {
    Column(modifier = modifier.padding(vertical = (st.pad - 2).coerceAtLeast(1).dp)) {
        Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                item.title,
                style = TextStyle(color = st.muted, fontSize = st.sp(10f), fontWeight = FontWeight.Medium),
                maxLines = 1,
                modifier = GlanceModifier.defaultWeight(),
            )
            if (st.changeStyle != ChangeStyle.HIDDEN) {
                Spacer(GlanceModifier.width(4.dp))
                Text(
                    item.changeText,
                    style = TextStyle(color = st.forDirection(item.direction), fontSize = st.sp(10f), fontWeight = FontWeight.Bold),
                    maxLines = 1,
                )
            }
        }
        Text(
            item.valueText,
            style = TextStyle(color = st.text, fontSize = st.sp(14f), fontWeight = FontWeight.Bold),
            maxLines = 1,
        )
    }
}

@Composable
private fun ItemRow(
    st: WStyle,
    item: DisplayItem,
    showSpark: Boolean,
    showSubtitle: Boolean,
    compact: Boolean,
    valueWidth: Float,
    modifier: GlanceModifier,
) {
    val context = LocalContext.current
    Row(
        modifier = modifier.padding(vertical = (if (showSubtitle) st.pad - 1 else st.pad).coerceAtLeast(1).dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = GlanceModifier.defaultWeight()) {
            Text(
                item.title,
                style = TextStyle(color = st.text, fontSize = st.sp(if (compact) 11f else 12f), fontWeight = FontWeight.Medium),
                maxLines = 1,
            )
            if (showSubtitle) {
                Text(
                    item.error ?: item.subtitle,
                    style = TextStyle(color = st.muted, fontSize = st.sp(9f)),
                    maxLines = 1,
                )
            }
        }
        if (showSpark) {
            // Grafiği olmayan satırlarda (formüller) da yer ayrılır ki sütunlar kaymasın.
            val sw = (40f * st.scale).toInt()
            val sh = (16f * st.scale).toInt()
            val bmp = if (item.spark.size >= 2) Sparkline.render(context, item.spark, sw, sh, st.sparkColor(context, item.direction)) else null
            if (bmp != null) {
                Image(provider = ImageProvider(bmp), contentDescription = null, modifier = GlanceModifier.size(sw.dp, sh.dp))
            } else {
                Spacer(GlanceModifier.size(sw.dp, sh.dp))
            }
            Spacer(GlanceModifier.width(4.dp))
        }
        Text(
            item.valueText,
            style = TextStyle(
                color = st.text,
                fontSize = st.sp(if (compact) 12f else 13f),
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.End,
            ),
            maxLines = 1,
            modifier = GlanceModifier.width(valueWidth.dp),
        )
        when (st.changeStyle) {
            ChangeStyle.PILL -> {
                Spacer(GlanceModifier.width(6.dp))
                Box(
                    modifier = GlanceModifier
                        .width(((if (compact) 48f else 56f) * st.scale).dp)
                        .background(ImageProvider(R.drawable.pill_mask), colorFilter = ColorFilter.tint(st.pillFor(item.direction)))
                        .padding(vertical = 2.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        item.changeText,
                        style = TextStyle(
                            color = st.forDirection(item.direction),
                            fontSize = st.sp(10f),
                            fontWeight = FontWeight.Bold,
                            textAlign = TextAlign.Center,
                        ),
                        maxLines = 1,
                    )
                }
            }
            ChangeStyle.TEXT -> {
                Text(
                    item.changeText,
                    style = TextStyle(color = st.forDirection(item.direction), fontSize = st.sp(10.5f), fontWeight = FontWeight.Bold, textAlign = TextAlign.End),
                    maxLines = 1,
                    modifier = GlanceModifier.width(((if (compact) 48f else 54f) * st.scale).dp),
                )
            }
            ChangeStyle.HIDDEN -> Unit
        }
    }
}

// ------------------------------------------------------------------ mini grafik

object Sparkline {
    fun render(context: Context, values: List<Double>, widthDp: Int, heightDp: Int, color: Int): Bitmap? {
        if (values.size < 2) return null
        val density = context.resources.displayMetrics.density
        val w = (widthDp * density).toInt().coerceAtLeast(2)
        val h = (heightDp * density).toInt().coerceAtLeast(2)
        val min = values.min()
        val max = values.max()
        val range = (max - min).takeIf { it > 0 } ?: 1.0
        val stroke = 1.4f * density
        val pad = stroke
        fun x(i: Int) = pad + (w - 2 * pad) * i / (values.size - 1).toFloat()
        fun y(v: Double) = (pad + (h - 2 * pad) * (1 - (v - min) / range)).toFloat()

        val line = Path().apply {
            moveTo(x(0), y(values[0]))
            for (i in 1 until values.size) lineTo(x(i), y(values[i]))
        }
        val fill = Path(line).apply {
            lineTo(x(values.lastIndex), h.toFloat())
            lineTo(x(0), h.toFloat())
            close()
        }
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        canvas.drawPath(fill, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.FILL
            shader = LinearGradient(0f, 0f, 0f, h.toFloat(),
                (color and 0x00FFFFFF) or 0x40000000, color and 0x00FFFFFF, Shader.TileMode.CLAMP)
        })
        canvas.drawPath(line, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = stroke
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
            this.color = color
        })
        return bmp
    }
}
