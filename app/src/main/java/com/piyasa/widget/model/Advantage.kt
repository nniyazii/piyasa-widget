package com.piyasa.widget.model

import java.time.DayOfWeek
import java.time.Instant
import java.time.ZoneId
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/**
 * Avantajlı fiyatlar: web sürümündeki (web/src/core/premium.ts, advice.ts, costs.ts) hesapların aynısı.
 *   1) Prim ve iskonto: altın/gümüş borsa ürünleri içlerindeki madenin değerine göre nerede?
 *   2) Birikim önerileri: ev/altın, ev/dolar, altın/gümüş oranı kendi geçmiş ortancasına göre.
 *   3) Banka mı, fon mu: aynı parayla alıp satmanın tüm masrafları.
 */
const val OZ = 31.1034768

/** Günlük kapanış serisi (epoch gün, UTC). */
class DailySeries(val days: IntArray, val close: DoubleArray)

enum class Metal(val symbol: String, val label: String, val unit: String) {
    GOLD("OANDA:XAUUSD", "gram altın", "gr altın"),
    SILVER("TVC:SILVER", "gram gümüş", "gr gümüş"),
}

data class PremiumPair(val symbol: String, val code: String, val name: String, val metal: Metal, val grams: Double? = null)

object Premiums {
    const val USDTRY = "FX:USDTRY"
    const val FUND_BUY = -0.02
    const val FUND_HIGH = 0.02
    const val TYPICAL_DAYS = 20

    val pairs = listOf(
        PremiumPair("BIST:ALTIN", "ALTIN.S1", "Darphane Altın Sertifikası", Metal.GOLD, 0.01),
        PremiumPair("BIST:GLDTR", "GLDTR.F", "Altın Fonu (GoldIST)", Metal.GOLD),
        PremiumPair("BIST:ZGOLD", "ZGOLD.F", "Ziraat Altın Katılım Fonu", Metal.GOLD),
        PremiumPair("BIST:ISGLK", "ISGLK.F", "İş Portföy Altın Katılım Fonu", Metal.GOLD),
        PremiumPair("BIST:GMSTR", "GMSTR.F", "Gümüş Fonu", Metal.SILVER),
    )

    /** Canlı fiyat ve geçmiş için gereken tüm semboller. */
    val symbols: List<String> = pairs.map { it.symbol } + Metal.entries.map { it.symbol } + USDTRY

    enum class Signal { BUY, NORMAL, HIGH, UNKNOWN }

    data class Row(
        val pair: PremiumPair,
        val price: Double?,
        /** 1 gram madenin TL değeri */
        val gram: Double?,
        /** Pay başına gram: sabit ya da olağan */
        val grams: Double?,
        val fixed: Boolean,
        /** İçindeki madenin değeri (TL) */
        val fair: Double?,
        /** fiyat ÷ değer − 1 */
        val premium: Double?,
        val signal: Signal,
    )

    private fun at(s: DailySeries, day: Int): Double? {
        var lo = 0; var hi = s.days.size - 1; var r = -1
        while (lo <= hi) { val m = (lo + hi) ushr 1; if (s.days[m] <= day) { r = m; lo = m + 1 } else hi = m - 1 }
        return if (r < 0 || day - s.days[r] > 4) null else s.close[r]
    }

    /** Pay başına olağan maden miktarı: son [days] işlem gününde (kapanış ÷ gram fiyatı) ortancası. */
    fun typicalGrams(fund: DailySeries?, metalUsd: DailySeries?, usdTry: DailySeries?, days: Int = TYPICAL_DAYS): Double? {
        if (fund == null || metalUsd == null || usdTry == null) return null
        val r = ArrayList<Double>()
        var i = fund.days.size - 1
        while (i >= 0 && r.size < days) {
            val m = at(metalUsd, fund.days[i]); val fx = at(usdTry, fund.days[i])
            if (m != null && fx != null && m > 0 && fx > 0 && fund.close[i] > 0) r += fund.close[i] / (m * fx / OZ)
            i--
        }
        if (r.size < min(10, days)) return null
        r.sort()
        return if (r.size % 2 == 1) r[(r.size - 1) / 2] else (r[r.size / 2 - 1] + r[r.size / 2]) / 2
    }

    fun row(pair: PremiumPair, price: Double?, metalUsd: Double?, usdTry: Double?, typical: Double? = null): Row {
        val fixed = pair.grams != null
        val grams = pair.grams ?: typical
        val gram = if (metalUsd != null && usdTry != null && metalUsd > 0 && usdTry > 0) metalUsd * usdTry / OZ else null
        val fair = if (gram != null && grams != null) gram * grams else null
        val premium = if (price != null && fair != null && fair > 0) price / fair - 1 else null
        val signal = when {
            premium == null -> Signal.UNKNOWN
            fixed -> if (premium <= 0) Signal.BUY else Signal.NORMAL
            premium <= FUND_BUY -> Signal.BUY
            premium >= FUND_HIGH -> Signal.HIGH
            else -> Signal.NORMAL
        }
        return Row(pair, price, gram, grams, fixed, fair, premium, signal)
    }

    /** BIST pay piyasası açık mı (hafta içi 10:00–18:30, İstanbul; veriler 15 dk gecikmeli). Tatiller bilinmez. */
    fun bistOpen(now: Instant = Instant.now()): Boolean {
        val t = now.atZone(ZoneId.of("Europe/Istanbul"))
        if (t.dayOfWeek == DayOfWeek.SATURDAY || t.dayOfWeek == DayOfWeek.SUNDAY) return false
        val min = t.hour * 60 + t.minute
        return min in 10 * 60..18 * 60 + 30
    }
}

// ------------------------------------------------------------------ birikim önerileri

/** Aylık seri: (yıl × 12 + ay, kapanış) */
typealias Monthly = List<Pair<Int, Double>>

class RatioData(val generated: Long, val hpi: Monthly, val gold: Monthly, val silver: Monthly, val usdTry: Monthly)

object Advices {
    enum class Id { HOME_GOLD, HOME_USD, GOLD_SILVER }

    data class Advice(
        val id: Id,
        val title: String,
        val action: String,
        /** Oran ortancanın altında mı (paydaki ucuz) */
        val cheap: Boolean,
        val strong: Boolean,
        val value: Double,
        val median: Double,
        val p25: Double,
        val p75: Double,
        val min: Double,
        val max: Double,
        /** Geçmiş ayların ne kadarında oran bugünkünden düşüktü (0–1) */
        val percentile: Double,
        val vsMedian: Double,
        val since: Int,
        val months: Int,
        val hpiMonth: Int? = null,
        val hpiGap: Int? = null,
    )

    private val MONTHS = listOf("Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara")
    fun monthLabel(m: Int) = "${MONTHS[m % 12]} ${m / 12}"
    fun monthOf(now: Instant): Int = now.atZone(ZoneId.of("UTC")).let { it.year * 12 + it.monthValue - 1 }

    private fun quantile(s: List<Double>, p: Double): Double {
        val i = p * (s.size - 1); val lo = kotlin.math.floor(i).toInt(); val hi = kotlin.math.ceil(i).toInt()
        return s[lo] + (s[hi] - s[lo]) * (i - lo)
    }

    fun ratioSeries(a: Monthly, b: Monthly, f: (Double, Double) -> Double = { x, y -> x / y }): Monthly {
        val m = b.toMap()
        return a.mapNotNull { (k, x) -> m[k]?.takeIf { it > 0 && x > 0 }?.let { k to f(x, it) } }
    }

    data class HpiNow(val value: Double, val month: Int, val gap: Int)

    /** Konut endeksi gecikmeli açıklanır: son değer, son 3 ayın ortalama artışıyla bugünkü aya taşınır (en çok 4 ay). */
    fun hpiNow(hpi: Monthly, nowMonth: Int): HpiNow? {
        if (hpi.size < 4) return null
        val (month, last) = hpi.last()
        val g = (last / hpi[hpi.size - 4].second).pow(1.0 / 3)
        val gap = max(0, min(4, nowMonth - month))
        return HpiNow(last * g.pow(gap), month, gap)
    }

    private fun build(id: Id, title: String, hist: Monthly, value: Double, cheapAction: String, dearAction: String, hpi: HpiNow? = null): Advice? {
        if (hist.size < 24 || !(value > 0)) return null
        val s = hist.map { it.second }.sorted()
        val median = quantile(s, 0.5); val p25 = quantile(s, 0.25); val p75 = quantile(s, 0.75)
        val cheap = value < median
        return Advice(
            id, title, if (cheap) cheapAction else dearAction, cheap, value <= p25 || value >= p75,
            value, median, p25, p75, s.first(), s.last(),
            s.count { it < value }.toDouble() / s.size, value / median - 1,
            hist.first().first, hist.size, hpi?.month, hpi?.gap,
        )
    }

    private fun gramTl(ozUsd: Double, usdTry: Double) = ozUsd * usdTry / OZ

    /** Üç öneri; canlı fiyat yoksa serilerin son ayı kullanılır. Altın/gümüş için son [gsYears] yıl. */
    fun all(d: RatioData, gold: Double? = null, silver: Double? = null, usdTry: Double? = null, now: Instant = Instant.now(), gsYears: Int = 20): List<Advice> {
        val g = gold ?: d.gold.lastOrNull()?.second
        val sv = silver ?: d.silver.lastOrNull()?.second
        val fx = usdTry ?: d.usdTry.lastOrNull()?.second
        val h = hpiNow(d.hpi, monthOf(now))
        val out = ArrayList<Advice?>()
        if (h != null && g != null && fx != null) {
            val gramHist = ratioSeries(d.gold, d.usdTry, ::gramTl)
            out += build(Id.HOME_GOLD, "Altın biriktiren için: ev mi, altın mı?", ratioSeries(d.hpi, gramHist), h.value / gramTl(g, fx), "Altın boz, ev al", "Altın biriktir", h)
            out += build(Id.HOME_USD, "Dolar biriktiren için: ev mi, dolar mı?", ratioSeries(d.hpi, d.usdTry), h.value / fx, "Dolar boz, ev al", "Dolar biriktir", h)
        }
        if (g != null && sv != null) {
            out += build(Id.GOLD_SILVER, "Altın mı, gümüş mü?", ratioSeries(d.gold, d.silver).takeLast(gsYears * 12), g / sv, "Gümüş sat, altın al", "Altın sat, gümüş al")
        }
        return out.filterNotNull()
    }
}

// ------------------------------------------------------------------ banka mı, fon mu

data class BankQuote(val bid: Double, val ask: Double)
data class BankEntry(val id: String, val name: String, val gold: BankQuote? = null, val silver: BankQuote? = null) {
    fun quote(metal: Metal) = if (metal == Metal.GOLD) gold else silver
}
/**
 * [session]: fiyatlar banka mesaisinde mi okundu (değilse makaslar olağandan geniştir).
 * [offHoursAt]: mesai dışındayken karşılaştırma mesai içindeki son fiyatlarla yapılıyorsa canlı okuma zamanı.
 */
class BanksData(val generated: Long, val banks: List<BankEntry>, val physical: List<BankEntry>, val session: Boolean = true, val offHoursAt: Long? = null)

/**
 * Masraf modeli. Oranlar (Kasım 2026, bireysel yatırımcı): banka hesabında alımda binde 2 BSMV; altın/gümüş
 * fonlarında kazançtan %17,5 stopaj (9 Temmuz 2025 sonrası alım); Darphane sertifikasında %0; fiziki alımda
 * vergi yok; aracı kurum komisyonu üzerinden %5 BSMV.
 */
object Costs {
    const val BANK_BSMV = 0.002
    const val FUND_TAX = 0.175
    const val COMMISSION_BSMV = 0.05
    /** Varsayımlar: borsada alış-satış farkının yarısı; fonların yıllık gideri (GLDTR için yayımlanan %0,47) */
    const val EXCHANGE_SPREAD = 0.001
    const val FUND_FEE = 0.0047

    /** Banka mesaisi (hafta içi 09:30–17:30, İstanbul): makaslar bu saatlerde dardır, dışında belirgin biçimde açılır. */
    fun bankSession(ms: Long): Boolean {
        val t = Instant.ofEpochMilli(ms).atZone(ZoneId.of("Europe/Istanbul"))
        if (t.dayOfWeek == DayOfWeek.SATURDAY || t.dayOfWeek == DayOfWeek.SUNDAY) return false
        return t.hour * 60 + t.minute in 9 * 60 + 30..17 * 60 + 30
    }

    enum class Kind { BANK, PHYSICAL, FUND, CERT }

    data class Route(
        val id: String, val name: String, val kind: Kind,
        val buySpread: Double, val sellSpread: Double,
        val buyTax: Double = 0.0, val commission: Boolean = false, val annualFee: Double = 0.0, val gainTax: Double = 0.0,
    )

    data class Scenario(val amount: Double, val years: Double, val annualGrowth: Double, val commission: Double)

    data class Outcome(
        val route: Route, val ideal: Double, val net: Double,
        val spread: Double, val buyTax: Double, val commission: Double, val fee: Double, val gainTax: Double,
    ) {
        val cost get() = ideal - net
    }

    fun evaluate(route: Route, s: Scenario): Outcome {
        val c = if (route.commission) s.commission * (1 + COMMISSION_BSMV) else 0.0
        val ideal = s.amount * (1 + s.annualGrowth).pow(s.years)
        var v = ideal
        fun drop(factor: Double): Double { val before = v; v *= factor; return before - v }
        val spreadBuy = drop(1 / (1 + route.buySpread))
        val buyTax = drop(1 / (1 + route.buyTax))
        val comBuy = drop(1 / (1 + c))
        val fee = drop((1 - route.annualFee).pow(s.years))
        val spreadSell = drop(1 - route.sellSpread)
        val comSell = drop(1 - c)
        val gainTax = route.gainTax * max(0.0, v - s.amount)
        v -= gainTax
        return Outcome(route, ideal, v, spreadBuy + spreadSell, buyTax, comBuy + comSell, fee, gainTax)
    }

    fun bank(id: String, name: String, q: BankQuote): Route {
        val mid = (q.bid + q.ask) / 2
        return Route(id, name, Kind.BANK, q.ask / mid - 1, 1 - q.bid / mid, buyTax = BANK_BSMV)
    }
    fun physical(id: String, name: String, q: BankQuote) = bank(id, name, q).copy(kind = Kind.PHYSICAL, buyTax = 0.0)
    fun fund(id: String, name: String) = Route(id, name, Kind.FUND, EXCHANGE_SPREAD, EXCHANGE_SPREAD, commission = true, annualFee = FUND_FEE, gainTax = FUND_TAX)
    fun cert(id: String, name: String) = Route(id, name, Kind.CERT, EXCHANGE_SPREAD, EXCHANGE_SPREAD, commission = true)

    /** İki yolun eşitlendiği yıllık artış; aralıkta kesişme yoksa null. */
    fun breakEven(a: Route, b: Route, s: Scenario, from: Double = -0.5, to: Double = 5.0): Double? {
        fun diff(g: Double) = evaluate(a, s.copy(annualGrowth = g)).net - evaluate(b, s.copy(annualGrowth = g)).net
        var lo = from; var hi = to; var fl = diff(lo); val fh = diff(hi)
        if (fl == 0.0) return lo
        if (fl * fh > 0) return null
        repeat(60) { val mid = (lo + hi) / 2; val fm = diff(mid); if (fl * fm <= 0) hi = mid else { lo = mid; fl = fm } }
        return (lo + hi) / 2
    }

    /** Karşılaştırılan yollar: bankalar (ya da tipik makas), fiziki, fon, (altında) sertifika. */
    fun routes(metal: Metal, data: BanksData?, own: BankQuote? = null): List<Route> {
        val live = data?.banks.orEmpty().mapNotNull { b -> b.quote(metal)?.let { bank(b.id, b.name, it) } }
        val mine = own?.takeIf { it.ask > it.bid && it.ask / it.bid < 1.2 }?.let { listOf(bank("kendi", "Kendi bankam", it)) }.orEmpty()
        val banks = if (live.isEmpty() && mine.isEmpty()) listOf(bank("banka", "Banka (tipik makas)", BankQuote(98.7, 101.3))) else mine + live
        val phys = data?.physical.orEmpty().mapNotNull { b ->
            b.quote(metal)?.let { physical(b.id, if (metal == Metal.GOLD) b.name else b.name.replace("gram altın", "gümüş"), it) }
        }
        return banks + phys +
            (if (metal == Metal.GOLD) fund("fon", "Altın fonu (GLDTR, ZGOLD, ISGLK)") else fund("fon", "Gümüş fonu (GMSTR)")) +
            (if (metal == Metal.GOLD) listOf(cert("sertifika", "Altın sertifikası (ALTIN.S1)")) else emptyList())
    }
}
