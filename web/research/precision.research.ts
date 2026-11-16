/**
 * Yüksek isabetli dip kurulumları arayışı (evren düzeyinde, zaman ayrımlı).
 * Her hissenin günlük verisinde aday "kurulumlar" işaretlenir; sonuç iki ölçütle ölçülür:
 *   hit   21 işlem günü sonra fiyat yukarıda mı
 *   win   fiyat önce +B'ye mi ulaştı, önce −B'ye mi (B = hissenin 21 günlük olağan oynaklığı): "yükseliş başladı mı"
 * Eğitim: 2023 sonuna kadar; sınama: 2024 başından itibaren (takvimle ayrılır, hisseler arası sızıntı olmasın).
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { indicators, marketOf, rsiSeries, type Bars } from '../src/core/signals'

const DIR = process.env.DATA ?? 'research/out/full'
const CUT = Date.UTC(2024, 0, 1) / 1000
const H = 21
function unpack(p: [number, number[], number[]]): Bars { const t: number[] = []; let cur = p[0]; for (let i = 0; i < p[2].length; i++) { if (i > 0) cur += p[1][i - 1] * 60; t.push(cur) }; return { t, c: p[2] } }
const load = (tf: string) => { const out = new Map<string, Bars>(); for (const f of readdirSync(`${DIR}/${tf}`)) for (const [s, p] of Object.entries(JSON.parse(readFileSync(`${DIR}/${tf}/${f}`, 'utf8')).bars as Record<string, [number, number[], number[]]>)) out.set(s, unpack(p)); return out }

it('yüksek isabetli kurulumlar', () => {
  const daily = load('D')
  // Piyasa durumu: endeks 200 günlük ortalamasının üstünde mi (gün → doğru/yanlış)
  const regime = (sym: string) => { const b = daily.get(sym); const m = new Map<number, boolean>(); if (!b) return m; let sum = 0; for (let i = 0; i < b.c.length; i++) { sum += b.c[i]; if (i >= 200) sum -= b.c[i - 200]; if (i >= 199) m.set(Math.floor(b.t[i] / 86400), b.c[i] > sum / 200) }; return m }
  const REG = { TR: regime('BIST:XU100'), US: regime('SP:SPX') }
  const idxClose = (sym: string) => { const b = daily.get(sym)!; return new Map(b.t.map((t, i) => [Math.floor(t / 86400), b.c[i]])) }
  const IDX = { TR: idxClose('BIST:XU100'), US: idxClose('SP:SPX') }
  type Agg = { n: number; hit: number; win: number; res: number; ret: number; stocks: Set<string>; rn: number; rhit: number; rret: number; n63: number; hit63: number }
  const zero = (): Agg => ({ n: 0, hit: 0, win: 0, res: 0, ret: 0, stocks: new Set(), rn: 0, rhit: 0, rret: 0, n63: 0, hit63: 0 })
  const agg = new Map<string, Agg>()
  const add = (k: string, sym: string, r: number, w: number, rel?: number, r63?: number) => { const a = agg.get(k) ?? zero(); if (rel != null) { a.rn++; if (rel > 0) a.rhit++; a.rret += rel }; if (r63 != null) { a.n63++; if (r63 > 0) a.hit63++ }; a.n++; if (r > 0) a.hit++; if (w > 0) a.win++; if (w !== 0) a.res++; a.ret += r; a.stocks.add(sym); agg.set(k, a) }
  for (const [sym, b] of daily) {
    const m = marketOf(sym)
    if (!m || /:(XU\d+|ALTIN|GLDTR|GMSTR|ZGOLD|ISGLK)$/.test(sym) || b.c.length < 400) continue
    const c = b.c, n = c.length, s = indicators(c)
    // Haftalık ölçekte RSI: 5 günde bir örneklenmiş kapanışlardan, her gün için
    const wr = new Array<number>(n).fill(NaN)
    for (let off = 0; off < 5; off++) { const idx: number[] = []; for (let i = off; i < n; i += 5) idx.push(i); const r = rsiSeries(idx.map((i) => c[i])).rsi; idx.forEach((i, k) => { wr[i] = r[k] }) }
    // 21 günlük olağan oynaklık (önceki 100 günün günlük getirilerinden)
    const vol = new Array<number>(n).fill(NaN)
    { let sum = 0, sq = 0; const r = (i: number) => Math.log(c[i] / c[i - 1]); for (let i = 1; i < n; i++) { sum += r(i); sq += r(i) ** 2; if (i > 100) { sum -= r(i - 100); sq -= r(i - 100) ** 2 }; if (i >= 100) vol[i] = Math.sqrt(Math.max(1e-10, sq / 100 - (sum / 100) ** 2)) * Math.sqrt(H) } }
    const last: Record<string, number> = {}
    for (let i = 260; i + H < n; i++) {
      if (Number.isNaN(s.d200[i]) || Number.isNaN(vol[i])) continue
      const ret = c[i + H] / c[i] - 1
      const i0 = IDX[m].get(Math.floor(b.t[i] / 86400)), i1 = IDX[m].get(Math.floor(b.t[i + H] / 86400))
      const rel = i0 && i1 ? ret - (i1 / i0 - 1) : undefined
      const r63 = i + 63 < n ? c[i + 63] / c[i] - 1 : undefined
      // Engel: önce +B mi, önce −B mi (B = olağan 21 günlük hareket)
      const B = Math.max(0.03, vol[i]); let win = 0
      for (let j = i + 1; j <= i + H; j++) { const x = c[j] / c[i] - 1; if (x >= B) { win = 1; break }; if (x <= -B) { win = -1; break } }
      const period = b.t[i] < CUT ? 'egitim' : 'sinama'
      const up = s.sma50[i] > s.sma200[i], mk = REG[m].get(Math.floor(b.t[i] / 86400))
      const rsi = s.rsi[i], rsiP = s.rsi[i - 1]
      // Son 10 günde RSI'ın gördüğü en düşük değer, son 5 günün getirisi
      let lowR = 100; for (let j = i - 10; j < i; j++) if (s.rsi[j] < lowR) lowR = s.rsi[j]
      const conf = [rsi <= 30, s.bb[i] <= -2, s.dd[i] <= -0.25, s.d200[i] <= -0.1, s.roc[i] <= -2].filter(Boolean).length
      const day = c[i] / c[i - 1] - 1, dvol = vol[i] / Math.sqrt(H)
      const setups: Record<string, boolean> = {
        'taban (her gün)': true,
        'RSI 30 altına indi': rsi <= 30 && rsiP > 30,
        'RSI 30 altından yukarı döndü (dönüş)': rsiP <= 30 && rsi > 30,
        'RSI 25 altından yukarı döndü': rsiP <= 25 && rsi > 25,
        'RSI ≤30 görüldü, bugün güçlü yükseliş günü (>1σ)': lowR <= 30 && day > dvol && rsiP <= 40,
        'RSI ≤25 görüldü, bugün güçlü yükseliş günü': lowR <= 25 && day > dvol && rsiP <= 35,
        'haftalık RSI ≤35 + günlük RSI 30 dönüşü': wr[i] <= 35 && rsiP <= 30 && rsi > 30,
        'haftalık RSI ≤30': wr[i] <= 30 && !(wr[i - 5] <= 30),
        'haftalık RSI ≤30 + güçlü yükseliş günü': wr[i] <= 30 && day > dvol,
        '2 gösterge birlikte (ilk gün)': conf >= 2 && day < 0,
        '3 gösterge birlikte': conf >= 3,
        '3 gösterge + güçlü yükseliş günü': conf >= 3 && day > dvol,
        '4 gösterge birlikte': conf >= 4,
        'zirveden ≥%35 + RSI 30 dönüşü': s.dd[i] <= -0.35 && rsiP <= 30 && rsi > 30,
        'zirveden ≥%25 + güçlü yükseliş günü + RSI≤40': s.dd[i] <= -0.25 && day > dvol && rsiP <= 40,
        'sert düşüş 3σ sonrası ilk yükseliş günü': s.roc[i - 1] <= -3 && day > 0,
        '200 ort. %20 altı + RSI 30 dönüşü': s.d200[i] <= -0.2 && rsiP <= 30 && rsi > 30,
      }
      for (const [name, on] of Object.entries(setups)) {
        if (!on) continue
        // Aynı kurulum aynı hissede 21 gün içinde yeniden sayılmaz (taban hariç)
        if (name !== 'taban (her gün)') { if (i - (last[name] ?? -99) < H) continue; last[name] = i }
        for (const ctx of ['hepsi', up ? 'hisse yükselen trendde' : 'hisse düşen trendde', mk == null ? '' : mk ? 'endeks 200 üstünde' : 'endeks 200 altında', up && mk ? 'hisse ve endeks yükselen' : '']) if (ctx) add(`${m}|${name}|${ctx}|${period}`, sym, ret, win, rel, r63)
      }
    }
  }
  const pc = (x: number) => (x * 100).toFixed(0).padStart(3)
  const out: string[] = []
  for (const m of ['TR', 'US']) for (const ctx of ['hepsi', 'hisse yükselen trendde', 'hisse düşen trendde', 'endeks 200 üstünde', 'endeks 200 altında', 'hisse ve endeks yükselen']) {
    out.push(`\n== ${m} | ${ctx}   (eğitim → sınama: n, 21 gün sonra yukarıda %, önce +B'ye ulaşan %, ortalama getiri)`)
    const names = [...new Set([...agg.keys()].filter((k) => k.startsWith(`${m}|`) && k.split('|')[2] === ctx).map((k) => k.split('|')[1]))]
    for (const name of names) {
      const a = agg.get(`${m}|${name}|${ctx}|egitim`), t = agg.get(`${m}|${name}|${ctx}|sinama`)
      if (!a || !t || t.n < 40) continue
      const f = (x: Agg) => `n ${String(x.n).padStart(7)} yukarı ${pc(x.hit / x.n)} | endeksi geçti ${pc(x.rhit / Math.max(1, x.rn))} (${(x.rret / Math.max(1, x.rn) * 100).toFixed(1).padStart(5)}%) | 63g yukarı ${pc(x.hit63 / Math.max(1, x.n63))}`
      out.push(`  ${name.padEnd(52)} ${f(a)}  →  ${f(t)}  (${t.stocks.size} hisse)`)
    }
  }
  console.log(out.join('\n'))
  writeFileSync('research/out/precision.txt', out.join('\n'))
})
