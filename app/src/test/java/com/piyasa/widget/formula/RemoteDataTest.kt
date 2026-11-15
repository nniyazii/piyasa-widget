package com.piyasa.widget.formula

import com.piyasa.widget.data.ReliabilityScore
import com.piyasa.widget.data.Remote
import com.piyasa.widget.model.AppState
import com.piyasa.widget.model.Condition
import com.piyasa.widget.model.Field
import com.piyasa.widget.model.Op
import com.piyasa.widget.model.ScreenListSort
import com.piyasa.widget.model.ScreenResult
import com.piyasa.widget.model.ScreenRow
import com.piyasa.widget.model.ScreenTemplates
import com.piyasa.widget.ui.Glossary
import com.piyasa.widget.ui.ListGroup
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/** Web sürümünün yayımladığı dosyaların okunması, sözlük ve liste sıralaması. */
class RemoteDataTest {
    @Test fun banksWithPhysicalSeparated() {
        val d = Remote.parseBanks("""{"generated":1794377206784,"session":true,"banks":[{"id":"ziraat","name":"Ziraat Bankası","gold":{"bid":6486.7,"ask":6617.7},"silver":{"bid":84.74,"ask":86.97}},{"id":"x","name":"Yalnız altın","gold":{"bid":1,"ask":2}}],"physical":[{"id":"fiziki-kulce","name":"Fiziki külçe altın (Altınkaynak)","gold":{"bid":6494,"ask":6550}}]}""")
        assertEquals(1794377206784, d.generated)
        assertEquals(listOf("ziraat", "x"), d.banks.map { it.id })
        assertEquals(86.97, d.banks[0].silver!!.ask, 0.0)
        assertNull(d.banks[1].silver)
        assertEquals("fiziki-kulce", d.physical.single().id)
        // Eski biçim (physical yok) da okunur
        assertTrue(Remote.parseBanks("""{"generated":1,"banks":[]}""").physical.isEmpty())
    }

    @Test fun offHoursUsesLastInSessionQuotes() {
        val night = 1794595095983 // 13 Kas 2026 Cuma 21:38 (İstanbul): mesai dışı
        assertTrue(!com.piyasa.widget.model.Costs.bankSession(night))
        assertTrue(com.piyasa.widget.model.Costs.bankSession(1794384000000)) // 11 Kas Çarşamba 11:00
        // Eski kopya (session alanı yok): zamandan anlaşılır, uyarı için işaretlenir
        assertTrue(!Remote.parseBanks("""{"generated":$night,"banks":[{"id":"z","name":"Z","gold":{"bid":6058,"ask":6934}}]}""").session)
        val d = Remote.parseBanks("""{"generated":$night,"session":false,"banks":[{"id":"z","name":"Z","gold":{"bid":6058,"ask":6934}}],"physical":[],
            "daytime":{"generated":1794580000000,"banks":[{"id":"z","name":"Z","gold":{"bid":6486,"ask":6617}}],"physical":[]}}""")
        assertEquals(6617.0, d.banks.single().gold!!.ask, 0.0) // mesai içi fiyat
        assertEquals(1794580000000, d.generated); assertEquals(night, d.offHoursAt); assertTrue(d.session)
    }

    @Test fun ratiosAndPackedDaily() {
        val r = Remote.parseRatios("""{"generated":5,"series":{"HPI":[[24319,230.1],[24320,239.38]],"GOLD":[[24322,4061.92]],"SILVER":[[24322,52.9]],"USDTRY":[[24322,50.2]]}}""")
        assertEquals(24320 to 239.38, r.hpi.last())
        assertEquals(4061.92, r.gold.single().second, 0.0)
        assertTrue(r.usM2.isEmpty() && r.xu100.isEmpty()) // eski dosyada para arzı yok
        val r2 = Remote.parseRatios("""{"generated":5,"series":{"HPI":[],"GOLD":[],"SILVER":[],"USDTRY":[],"USM2":[[24320,2.34e13]],"TRM2":[[24322,2.97e13]],"XU100":[[24322,11842.8]]}}""")
        assertEquals(2.34e13, r2.usM2.single().second, 0.0); assertEquals(24322, r2.trM2.single().first); assertEquals(11842.8, r2.xu100.single().second, 0.0)
        // [ilk gün, farklar, kapanışlar]; boş kapanış bir öncekini taşır
        val d = Remote.parseDaily("""{"bars":{"BIST:GMSTR":[20000,[1,3,1],[500.5,null,510,515.75]],"X":null}}""", listOf("BIST:GMSTR", "X", "YOK"))
        val s = d.getValue("BIST:GMSTR")
        assertEquals(listOf(20000, 20001, 20004, 20005), s.days.toList())
        assertEquals(listOf(500.5, 500.5, 510.0, 515.75), s.close.toList())
        assertEquals(setOf("BIST:GMSTR"), d.keys)
    }

    private val scoresJson = """{"generated":1,"years":3,"scores":{"[fp1]":{"id":"d_bist_pb_trend","name":"x","rel":{"score":96,"label":"Güçlü","months":36,"episodes":1596}},"[fp2]":{"id":"d_bist_trend_cheap","rel":{"score":28,"label":"Güvenilmez","months":37,"episodes":844}},"[fp3]":{"id":"d_yok","rel":{"label":"Yetersiz veri","months":2,"episodes":3}}}}"""

    @Test fun scoresOnlyForUnmodifiedTemplates() {
        val scores = Remote.parseScores(scoresJson)
        assertEquals(ReliabilityScore(96, "Güçlü", 3, 36, 1596), scores["d_bist_pb_trend"])
        assertNull(scores.getValue("d_yok").score)
        val t = ScreenTemplates.all.first { it.id == "d_bist_pb_trend" }
        assertEquals(96, Remote.scoreFor(t, scores)!!.score)
        assertEquals(96, Remote.scoreFor(t.copy(name = "Benim adım", limit = 10), scores)!!.score) // ad ve sayı skoru etkilemez
        assertNull(Remote.scoreFor(t.copy(conditions = listOf(Condition(Field.PB, Op.LT, null, 3.0))), scores)) // koşul değişti
        assertNull(Remote.scoreFor(t.copy(id = "benim"), scores))
    }

    @Test fun screensSortedByChoice() {
        val scores = Remote.parseScores(scoresJson)
        val a = ScreenTemplates.all.first { it.id == "d_bist_trend_cheap" }; val b = ScreenTemplates.all.first { it.id == "d_bist_pb_trend" }
        val c = ScreenTemplates.all.first { it.id == "d_bist_movers" }.copy(name = "Çok yükselenler")
        fun res(n: Int) = ScreenResult(0, List(n) { ScreenRow("S$it", "S$it", 1.0, 0.0) })
        val state = AppState(screens = listOf(a, b, c), screenResults = mapOf(a.id to res(6), b.id to res(12), c.id to res(1)))
        fun order(s: ScreenListSort) = ListGroup.screenOrder(state.copy(screenSort = s), scores)
        assertEquals(listOf(a.id, b.id, c.id), order(ScreenListSort.MANUAL))
        assertEquals(listOf(b.id, a.id, c.id), order(ScreenListSort.SCORE)) // 96, 28, skor yok
        assertEquals(listOf(b.id, a.id, c.id), order(ScreenListSort.MATCHES))
        assertEquals(listOf(c.id, b.id, a.id), order(ScreenListSort.NAME)) // Türkçe: Ç…, D…, T…
        assertEquals(order(ScreenListSort.SCORE), ListGroup.of(state.copy(screenSort = ScreenListSort.SCORE), scores).last().keys)
    }

    @Test fun glossaryCoversEveryFieldAndSearches() {
        val f = listOf("src/main/assets/glossary.json", "app/src/main/assets/glossary.json").map(::File).first { it.exists() }
        val groups = Glossary.parse(f.readText())
        val terms = groups.flatMap { it.terms }
        assertTrue(terms.size >= 60)
        Field.entries.forEach { assertNotNull("${it.name} sözlükte yok", Glossary.termFor(groups, it)) }
        assertEquals("rsi", Glossary.termFor(groups, Field.RSI)!!.id)
        terms.forEach { t -> t.related.forEach { r -> assertTrue("${t.id} → $r", terms.any { it.id == r }) } }
        assertEquals("RSI", terms.first { it.id == "rsi" }.shortName)
        // Kısaltma, Türkçe harf ve büyük-küçük farkı
        assertTrue(Glossary.filter(groups, "eps").flatMap { it.terms }.any { it.id == "eps-buyumesi" })
        assertEquals(listOf("piyasa-degeri"), Glossary.filter(groups, "PİYASA DEĞERİ").flatMap { it.terms }.map { it.id }.filter { it == "piyasa-degeri" })
        assertTrue(Glossary.filter(groups, "gumus sat").flatMap { it.terms }.any { it.id == "altin-gumus" })
        assertTrue(Glossary.filter(groups, "zzzz").isEmpty())
    }
}
