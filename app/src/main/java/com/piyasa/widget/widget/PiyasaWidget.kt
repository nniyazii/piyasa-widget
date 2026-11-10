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
import com.piyasa.widget.R
import com.piyasa.widget.config.WidgetConfigActivity
import com.piyasa.widget.data.Actions
import com.piyasa.widget.data.appStore
import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.Display
import com.piyasa.widget.model.DisplayItem
import com.piyasa.widget.model.WidgetConfig
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

// ------------------------------------------------------------------ renkler

private object WColors {
    // Gündüz / gece renkleri (res/values*/colors.xml ile aynı)
    val text = ColorProvider(day = Color(0xFF0E141B), night = Color(0xFFF1F4F7))
    val muted = ColorProvider(day = Color(0xFF6B7785), night = Color(0xFF8B95A1))
    val divider = ColorProvider(day = Color(0x120E141B), night = Color(0x14FFFFFF))
    val up = ColorProvider(day = Color(0xFF0E9F6E), night = Color(0xFF34D399))
    val down = ColorProvider(day = Color(0xFFE02D3C), night = Color(0xFFFB7185))

    fun forDirection(d: Int) = when (d) { 1 -> up; -1 -> down; else -> muted }
}

/** Satıra dokununca TradingView (uygulama yüklüyse uygulamada) açılır; çevrilemeyen kalemde uygulama açılır. */
private fun rowAction(item: DisplayItem, fallback: Action): Action {
    val url = item.tvUrl ?: return fallback
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return androidx.glance.appwidget.action.actionStartActivity(intent)
}

private fun pillFor(d: Int) = when (d) {
    1 -> R.drawable.pill_up
    -1 -> R.drawable.pill_down
    else -> R.drawable.pill_flat
}

// ------------------------------------------------------------------ içerik

@Composable
private fun WidgetContent(state: AppState, cfg: WidgetConfig, appWidgetId: Int) {
    val context = LocalContext.current
    val size = LocalSize.current
    val items = Display.build(state, cfg.keys)

    val configIntent = Intent(context, WidgetConfigActivity::class.java)
        .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    val openConfig = androidx.glance.appwidget.action.actionStartActivity(configIntent)
    val openApp = actionStartActivity<MainActivity>()

    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(ImageProvider(R.drawable.widget_bg))
            .cornerRadius(20.dp),
    ) {
        when {
            items.isEmpty() -> EmptyState(openConfig)
            size.height < 100.dp -> Strip(items, size.width.value, openApp)
            else -> ListLayout(state, cfg, items, size.width.value, size.height.value, openApp)
        }
    }
}

@Composable
private fun EmptyState(onClick: Action) {
    Column(
        modifier = GlanceModifier.fillMaxSize().padding(12.dp).clickable(onClick),
        verticalAlignment = Alignment.CenterVertically,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Piyasa", style = TextStyle(color = WColors.text, fontSize = 13.sp, fontWeight = FontWeight.Bold))
        Text("Göstergeleri seçmek için dokun", style = TextStyle(color = WColors.muted, fontSize = 10.sp))
    }
}

/** 1 satır yüksekliğinde: yan yana kutucuklar (kayan bant görünümü). */
@Composable
private fun Strip(items: List<DisplayItem>, widthDp: Float, onClick: Action) {
    val count = (widthDp / 105f).toInt().coerceIn(1, items.size)
    Row(
        modifier = GlanceModifier.fillMaxSize().padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        items.take(count).forEachIndexed { i, item ->
            if (i > 0) {
                Spacer(GlanceModifier.width(8.dp))
                Box(GlanceModifier.width(1.dp).height(26.dp).background(WColors.divider)) {}
                Spacer(GlanceModifier.width(8.dp))
            }
            Column(modifier = GlanceModifier.defaultWeight().clickable(rowAction(item, onClick))) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        item.title,
                        style = TextStyle(color = WColors.muted, fontSize = 10.sp, fontWeight = FontWeight.Medium),
                        maxLines = 1,
                        modifier = GlanceModifier.defaultWeight(),
                    )
                    Spacer(GlanceModifier.width(4.dp))
                    Text(
                        item.changeText,
                        style = TextStyle(color = WColors.forDirection(item.direction), fontSize = 10.sp, fontWeight = FontWeight.Bold),
                        maxLines = 1,
                    )
                }
                Text(
                    item.valueText,
                    style = TextStyle(color = WColors.text, fontSize = 15.sp, fontWeight = FontWeight.Bold),
                    maxLines = 1,
                )
            }
        }
    }
}

@Composable
private fun ListLayout(
    state: AppState,
    cfg: WidgetConfig,
    items: List<DisplayItem>,
    widthDp: Float,
    heightDp: Float,
    openApp: Action,
) {
    val compact = widthDp < 200f
    val twoColumns = widthDp >= 330f && items.size > 3
    val showSpark = cfg.showSpark && !compact && !twoColumns
    val showSubtitle = cfg.showSubtitle && !compact
    val rows: List<List<DisplayItem>> = if (twoColumns) items.chunked(2) else items.map { listOf(it) }

    // Sığıyorsa düz Column (kaydırma yok, daha hızlı); sığmıyorsa kaydırılabilir liste.
    val rowHeight = when {
        compact -> 42f
        showSubtitle -> 36f
        else -> 29f
    }
    val capacity = ((heightDp - 8f - 4f - 26f) / rowHeight).toInt()
    val fits = rows.size <= capacity && rows.size <= 10
    // Değer sütunu sabit genişlikte ve sağa hizalı: grafikler ve rozetler alt alta hizalanır.
    val charDp = if (twoColumns) 6.4f else 7.6f
    val valueWidth = (items.maxOf { it.valueText.length } * charDp + 4f).coerceIn(40f, 110f)

    Column(modifier = GlanceModifier.fillMaxSize().padding(start = 12.dp, end = 8.dp, top = 8.dp, bottom = 4.dp)) {
        Header(state, cfg.title, openApp)
        Spacer(GlanceModifier.height(2.dp))
        if (fits) {
            Column(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
                rows.forEachIndexed { index, row ->
                    RowLine(row, index == rows.lastIndex, twoColumns, showSpark, showSubtitle, compact, valueWidth, openApp)
                }
            }
        } else {
            LazyColumn(modifier = GlanceModifier.fillMaxWidth().defaultWeight()) {
                itemsIndexed(rows, itemId = { i, _ -> i.toLong() }) { index, row ->
                    RowLine(row, index == rows.lastIndex, twoColumns, showSpark, showSubtitle, compact, valueWidth, openApp)
                }
            }
        }
    }
}

@Composable
private fun RowLine(
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
                    Box(GlanceModifier.width(1.dp).height(22.dp).background(WColors.divider)) {}
                    Spacer(GlanceModifier.width(8.dp))
                }
                val click = GlanceModifier.defaultWeight().clickable(rowAction(item, openApp))
                if (compact && !twoColumns) {
                    NarrowRow(item, click)
                } else {
                    ItemRow(
                        item = item,
                        showSpark = showSpark,
                        showSubtitle = showSubtitle,
                        compact = twoColumns,
                        valueWidth = valueWidth,
                        modifier = click,
                    )
                }
            }
            if (twoColumns && row.size == 1) {
                Spacer(GlanceModifier.width(17.dp))
                Spacer(GlanceModifier.defaultWeight())
            }
        }
        if (!last) {
            Box(GlanceModifier.fillMaxWidth().height(1.dp).background(WColors.divider)) {}
        }
    }
}

@Composable
private fun Header(state: AppState, title: String, openApp: Action) {
    val status = when {
        state.refreshing -> "Güncelleniyor…"
        state.lastRefresh == 0L -> "—"
        else -> SimpleDateFormat("HH:mm", Locale.forLanguageTag("tr-TR")).format(Date(state.lastRefresh))
    }
    val warn = state.lastError != null && !state.refreshing
    Row(modifier = GlanceModifier.fillMaxWidth().height(24.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(
            title.uppercase(Locale.forLanguageTag("tr-TR")),
            style = TextStyle(color = WColors.muted, fontSize = 10.sp, fontWeight = FontWeight.Bold),
            maxLines = 1,
            modifier = GlanceModifier.defaultWeight().clickable(openApp),
        )
        Text(
            if (warn) "! $status" else status,
            style = TextStyle(color = if (warn) WColors.down else WColors.muted, fontSize = 10.sp),
            maxLines = 1,
        )
        Box(
            modifier = GlanceModifier.size(26.dp, 24.dp).clickable(actionRunCallback<RefreshAction>()),
            contentAlignment = Alignment.Center,
        ) {
            Image(
                provider = ImageProvider(R.drawable.ic_refresh),
                contentDescription = "Yenile",
                modifier = GlanceModifier.size(14.dp),
                colorFilter = ColorFilter.tint(WColors.muted),
            )
        }
    }
}

/** Dar widget (2 hücre): ad + değişim üstte, değer altta. */
@Composable
private fun NarrowRow(item: DisplayItem, modifier: GlanceModifier) {
    Column(modifier = modifier.padding(vertical = 3.dp)) {
        Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                item.title,
                style = TextStyle(color = WColors.muted, fontSize = 10.sp, fontWeight = FontWeight.Medium),
                maxLines = 1,
                modifier = GlanceModifier.defaultWeight(),
            )
            Spacer(GlanceModifier.width(4.dp))
            Text(
                item.changeText,
                style = TextStyle(color = WColors.forDirection(item.direction), fontSize = 10.sp, fontWeight = FontWeight.Bold),
                maxLines = 1,
            )
        }
        Text(
            item.valueText,
            style = TextStyle(color = WColors.text, fontSize = 14.sp, fontWeight = FontWeight.Bold),
            maxLines = 1,
        )
    }
}

@Composable
private fun ItemRow(
    item: DisplayItem,
    showSpark: Boolean,
    showSubtitle: Boolean,
    compact: Boolean,
    valueWidth: Float,
    modifier: GlanceModifier,
) {
    val context = LocalContext.current
    Row(
        modifier = modifier.padding(vertical = if (showSubtitle) 4.dp else 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = GlanceModifier.defaultWeight()) {
            Text(
                item.title,
                style = TextStyle(color = WColors.text, fontSize = if (compact) 11.sp else 12.sp, fontWeight = FontWeight.Medium),
                maxLines = 1,
            )
            if (showSubtitle) {
                Text(
                    item.error ?: item.subtitle,
                    style = TextStyle(color = WColors.muted, fontSize = 9.sp),
                    maxLines = 1,
                )
            }
        }
        if (showSpark) {
            // Grafiği olmayan satırlarda (formüller) da yer ayrılır ki sütunlar kaymasın.
            val bmp = if (item.spark.size >= 2) Sparkline.render(context, item.spark, 40, 16, item.direction) else null
            if (bmp != null) {
                Image(provider = ImageProvider(bmp), contentDescription = null, modifier = GlanceModifier.size(40.dp, 16.dp))
            } else {
                Spacer(GlanceModifier.size(40.dp, 16.dp))
            }
            Spacer(GlanceModifier.width(4.dp))
        }
        Text(
            item.valueText,
            style = TextStyle(
                color = WColors.text,
                fontSize = if (compact) 12.sp else 13.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.End,
            ),
            maxLines = 1,
            modifier = GlanceModifier.width(valueWidth.dp),
        )
        Spacer(GlanceModifier.width(6.dp))
        Box(
            modifier = GlanceModifier
                .width(if (compact) 48.dp else 56.dp)
                .background(ImageProvider(pillFor(item.direction)))
                .padding(vertical = 2.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                item.changeText,
                style = TextStyle(
                    color = WColors.forDirection(item.direction),
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                ),
                maxLines = 1,
            )
        }
    }
}

// ------------------------------------------------------------------ mini grafik

object Sparkline {
    fun render(context: Context, values: List<Double>, widthDp: Int, heightDp: Int, direction: Int): Bitmap? {
        if (values.size < 2) return null
        val density = context.resources.displayMetrics.density
        val w = (widthDp * density).toInt().coerceAtLeast(2)
        val h = (heightDp * density).toInt().coerceAtLeast(2)
        val color = context.getColor(
            when (direction) { 1 -> R.color.widget_up; -1 -> R.color.widget_down; else -> R.color.widget_muted },
        )
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
