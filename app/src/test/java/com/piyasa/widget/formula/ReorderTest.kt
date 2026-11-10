package com.piyasa.widget.formula

import com.piyasa.widget.data.AppJson
import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.Reorder
import com.piyasa.widget.model.ScreenTemplates
import com.piyasa.widget.model.WidgetConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test

class ReorderTest {
    @Test fun moveAndSubsetKeepOtherPositions() {
        assertEquals(listOf("b", "c", "a", "d"), Reorder.move(listOf("a", "b", "c", "d"), 0, 2))
        assertEquals(listOf("a", "d", "b", "c"), Reorder.move(listOf("a", "b", "c", "d"), 3, 1))
        val l = listOf("a", "b", "c")
        assertSame(l, Reorder.move(l, 0, 5))
        // Tek kategorinin (x'ler) sırası değişir, araya serpilmiş diğerleri yerinde kalır
        val list = listOf("x1", "y1", "x2", "y2", "x3")
        assertEquals(listOf("x3", "y1", "x1", "y2", "x2"), Reorder.subset(list, listOf("x3", "x1", "x2")) { it })
        // Bilinmeyen anahtar yok sayılır; eksik verilenler kalan konumları sırayla doldurmaz, yerinde kalır
        assertEquals(listOf("x2", "y1", "x1", "y2", "x3"), Reorder.subset(list, listOf("zz", "x2", "x1")) { it })
    }

    @Test fun pinnedScreenWidgetPreset() {
        val scr = ScreenTemplates.all.first { it.id == "d_my_pe_half" }
        val cfg = WidgetConfig.forScreen(scr)
        assertEquals(scr.name, cfg.title)
        assertEquals(listOf(WidgetConfig.screenEntry(scr.id)), cfg.keys)
        assertEquals(10, cfg.screenRows)
        // Sabitleme isteği geri çağrıya JSON olarak taşınır
        assertEquals(cfg, AppJson.decodeFromString(WidgetConfig.serializer(), AppJson.encodeToString(WidgetConfig.serializer(), cfg)))
        assertEquals(listOf("USDTRY", "EURTRY"), WidgetConfig.forGroup("Döviz", listOf("USDTRY", "EURTRY")).keys)
    }

    @Test fun stalePinRequestDoesNotLeakIntoLaterWidgets() {
        val cfg = WidgetConfig(title = "Döviz", keys = listOf("USDTRY"))
        val s = AppState(pendingWidget = cfg, pendingWidgetAt = 1_000_000L)
        assertEquals(cfg, s.pendingWidget(now = 1_000_000L + 60_000))
        assertNull(s.pendingWidget(now = 1_000_000L + 10 * 60_000))
    }
}
