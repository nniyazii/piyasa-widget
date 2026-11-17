/**
 * Uçtan uca akış testi (gerçek tarayıcı, gerçek TradingView verisi).
 *   npm run build && npx vite preview --port 4173 &   sonra:   node scripts/e2e.mjs [http://localhost:4173]
 * Playwright gerekir (npx playwright install chromium) ya da sistemde kurulu olmalı.
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const BASE = process.argv[2] ?? 'http://localhost:4173'
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined

const browser = await chromium.launch({ proxy })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: !!proxy, locale: 'tr-TR' })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(BASE) && !r.url().includes('/api/health') && !(r.status() === 404 && r.url().includes('/api/yahoo/'))) errors.push(`${r.status()} ${r.url()}`) })
page.on('console', (m) => { if (/Failed to load resource/.test(m.text())) return; if (m.type() === 'error' && !/tradingview|sw\.js|favicon|preload/i.test(m.text())) errors.push(m.text()) })

let failed = 0
async function step(name, fn) {
  try {
    await fn()
    console.log('✓', name)
  } catch (e) {
    failed++
    console.log('✗', name, '\n   ', e.message.split('\n').slice(0, process.env.E2E_VERBOSE ? 6 : 1).join('\n    '))
    await page.screenshot({ path: `e2e-fail-${failed}.png` }).catch(() => {})
  }
}
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('piyasa.state.v1') || '{}'))
const row = (title) => page.locator('.row', { has: page.locator('.row-title .t', { hasText: new RegExp(`^${title}$`) }) })

await page.goto(BASE + '/', { waitUntil: 'networkidle' })

await step('fiyatlar gelir', async () => {
  await page.waitForFunction(() => [...document.querySelectorAll('.row')].some((r) => r.textContent.includes('Dolar/TL') && /\d,\d{4}/.test(r.textContent)), null, { timeout: 15000 })
})

await step('arama: "aselsan" → listeye eklenir', async () => {
  await page.keyboard.press('/')
  await page.keyboard.type('aselsan')
  await page.locator('.result', { hasText: 'BIST:ASELS' }).first().waitFor({ timeout: 10000 })
  await page.keyboard.press('Enter')
  await page.locator('.toast', { hasText: 'listeye eklendi' }).waitFor()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await row('Aselsan').waitFor()
})

await step('formül: "xu100/dolar" → kaydedilir ve ayrıntısı açılır', async () => {
  await page.keyboard.press('/')
  await page.keyboard.type('xu100/dolar', { delay: 30 })
  await page.waitForTimeout(500)
  await page.keyboard.press('Enter') // "dolar" → Dolar/TL
  await page.locator('.composer-result .eq').waitFor()
  await page.keyboard.press('Enter') // kaydet penceresi
  const name = page.locator('#f-name')
  await name.waitFor()
  await name.fill('BIST dolar bazında')
  await page.keyboard.press('Enter')
  await page.locator('.detail h2', { hasText: 'BIST dolar bazında' }).waitFor()
  const s = await state()
  const f = s.formulas.find((x) => x.name === 'BIST dolar bazında')
  if (!f || f.expression !== 'XU100 / USDTRY' || f.prefix !== '$') throw new Error('formül yanlış: ' + JSON.stringify(f))
  await page.keyboard.press('Escape')
})

await step('sürükle-bırak: Gram Altın iki satır aşağı', async () => {
  const before = (await state()).formulas.map((f) => f.key)
  const box = await row('Gram Altın').boundingBox()
  await page.mouse.move(box.x + 200, box.y + box.height / 2)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) { await page.mouse.move(box.x + 200, box.y + box.height / 2 + (box.height * 2.3 * i) / 12); await page.waitForTimeout(16) }
  await page.mouse.up()
  await page.waitForTimeout(400)
  const after = (await state()).formulas.map((f) => f.key)
  if (after.indexOf('GRAM_ALTIN') < 2 || before.length !== after.length) throw new Error(`sıra değişmedi: ${after.join(',')}`)
})

await step('kaldır ve geri al', async () => {
  await row('Aselsan').click({ button: 'right' })
  await page.locator('.menu button', { hasText: 'Listeden kaldır' }).click()
  await page.locator('.toast', { hasText: 'kaldırıldı' }).locator('button', { hasText: 'Geri al' }).click()
  await row('Aselsan').waitFor()
})

await step('pano: yeni pano oluştur, Dolar/TL ekle', async () => {
  await page.goto(BASE + '/#/panolar')
  await page.locator('.page-head .btn.primary', { hasText: 'Yeni pano' }).click()
  await page.locator('#b-title').fill('Sabah')
  await page.locator('.dialog .result', { hasText: 'Dolar/TL' }).first().click()
  await page.locator('.dialog-foot .btn.primary', { hasText: 'Kaydet' }).click()
  await page.locator('.card h3', { hasText: 'Sabah' }).waitFor()
  await page.locator('.card', { hasText: 'Sabah' }).locator('.card-row', { hasText: 'Dolar/TL' }).waitFor()
})

await step('dinamik liste: şablondan oluştur, sonuç tablosu gelir', async () => {
  await page.goto(BASE + '/#/listeler')
  await page.locator('.page-head .btn.primary', { hasText: 'Yeni liste' }).click()
  await page.locator('.dialog .chip', { hasText: 'Aşırı satılmış BIST devleri' }).click()
  await page.locator('#s-name').fill('Benim aşırı satılmışlarım')
  await page.locator('.preview-pane .note', { hasText: 'eşleşme' }).waitFor({ timeout: 20000 })
  await page.locator('.dialog-foot .btn.primary', { hasText: 'Kaydet' }).click()
  await page.locator('.page-head h1', { hasText: 'Benim aşırı satılmışlarım' }).waitFor()
  await page.locator('.result-table tbody tr, .empty').first().waitFor({ timeout: 20000 })
})

await step('geçmişte test: aşırı satılmış BIST devleri, 1 yıl', async () => {
  await page.goto(BASE + '/#/listeler/d_bist_oversold_big')
  await page.locator('a.btn', { hasText: 'Geçmişte test et' }).click()
  await page.locator('.bt-controls .btn.primary').click()
  await page.locator('.bt-lead, .empty').first().waitFor({ timeout: 180000 })
  const lead = await page.locator('.bt-lead').textContent()
  if (!/kez listeye girdi/.test(lead ?? '')) throw new Error('özet yok: ' + lead)
  await page.locator('.rel-panel .rel-score').waitFor()
  const tab = (t) => page.locator('.bt-tabs button', { hasText: t }).click()
  await tab('Sonrası')
  if ((await page.locator('.bt-table').first().locator('tbody tr').count()) !== 4) throw new Error('ufuk tablosu eksik')
  await tab('Koşullar')
  await page.locator('.bt-table tbody tr').first().waitFor()
  await tab('Girişler')
  await page.locator('.bt-table tbody tr').first().waitFor()
  await tab('Portföy')
  await page.locator('.bt-chart svg path.list').waitFor()
  // Portföy biçimi: 3 ay tut
  const before = await page.locator('.bt-chart svg path.list').getAttribute('d')
  await page.locator('.segmented button', { hasText: '3 ay tut' }).click()
  if ((await page.locator('.bt-chart svg path.list').getAttribute('d')) === before) throw new Error('3 ay tut eğrisi değişmedi')
})

await step('güvenilirlik: kendi testin listede rozet olarak görünür', async () => {
  await page.goto(BASE + '/#/listeler/d_bist_oversold_big')
  await page.locator('.rel-line .rel-badge').waitFor({ timeout: 10000 })
  await page.goto(BASE + '/#/listeler')
  await page.locator('.screen-item', { hasText: 'aşırı satılmış' }).first().locator('.rel-badge').waitFor()
})

await step('listem: az hisse → geniş evrende dene, koşul tablosu', async () => {
  await page.goto(BASE + '/#/listeler/d_my_pe_half/test')
  await page.locator('.bt-controls .btn.primary').click()
  await page.locator('.bt-try').waitFor({ timeout: 120000 })
  await page.locator('.bt-sect table, details.bt-how table').last().locator('tbody tr').nth(1).waitFor({ state: 'attached' })
  await page.locator('.bt-try .btn', { hasText: 'Tüm BIST' }).click()
  await page.locator('.bt-lead').waitFor({ timeout: 180000 })
  if (!/kez listeye girdi/.test((await page.locator('.bt-lead').textContent()) ?? '')) throw new Error('BIST’te giriş yok')
})

await step('hepsini tara: ilerleme ve sonuç bildirimi', async () => {
  await page.goto(BASE + '/#/listeler')
  await page.waitForTimeout(2500) // açılıştaki otomatik tarama sürerken de basış yok sayılmamalı
  const btn = page.locator('.page-head .btn.ghost')
  await btn.click()
  await page.locator('.page-head .btn.ghost', { hasText: 'Taranıyor' }).waitFor({ timeout: 3000 })
  await page.locator('.toast', { hasText: /liste tarandı/ }).waitFor({ timeout: 90000 })
  await page.locator('.screen-tools .note', { hasText: 'Son tarama' }).waitFor()
})

await step('sıralama: listeler ada göre, sonuçlar fiyata göre', async () => {
  await page.locator('.screen-tools .segmented button', { hasText: /^Ad$/ }).click()
  const names = await page.locator('.screen-list .screen-item h3').evaluateAll((els) => els.map((e) => e.childNodes[0].textContent.trim()))
  const sorted = [...names].sort((a, b) => a.localeCompare(b, 'tr'))
  if (names.join('|') !== sorted.join('|')) throw new Error('ada göre sıralı değil: ' + names.slice(0, 3).join(', '))
  await page.locator('.screen-tools .segmented button', { hasText: 'Sıram' }).click()
  await page.goto(BASE + '/#/listeler/d_us_quality')
  await page.locator('.result-table tbody tr').nth(2).waitFor({ timeout: 30000 })
  await page.locator('.result-table .sort', { hasText: 'Fiyat' }).click()
  const prices = await page.locator('.result-table tbody tr td:nth-child(3)').evaluateAll((els) => els.map((e) => parseFloat(e.textContent.replace(/[^0-9,]/g, '').replace(',', '.'))))
  if (prices.some((p, i) => i && p > prices[i - 1])) throw new Error('fiyata göre azalan değil: ' + prices.slice(0, 4).join(', '))
})

await step('analiz: özet, ürünler, nereden almalı, birikim, para arzı', async () => {
  await page.goto(BASE + '/#/listeler')
  await page.locator('.nav a', { hasText: 'Analiz' }).click()
  // Özet: soru → cevap satırları; satır ilgili sayfaya götürür
  // Açılış: Görünüm (grafik tezgâhı); altında pratik sorular
  await page.locator('.an-tabs a', { hasText: 'Olaylar' }).click()
  await page.locator('.an-row').nth(5).waitFor({ timeout: 20000 })
  await page.locator('.an-row', { hasText: 'Değerinin altında' }).click()
  await page.locator('.prem-table tbody tr').nth(4).waitFor({ timeout: 20000 })
  const cell = (code, n) => page.locator('.prem-table tbody tr', { hasText: code }).locator('td').nth(n).textContent()
  if (!/0,01 gr altın/.test(await cell('ALTIN.S1', 2))) throw new Error('sertifika içeriği: ' + (await cell('ALTIN.S1', 2)))
  if (!/[+−]?%\d/.test(await cell('ALTIN.S1', 3))) throw new Error('sertifika farkı yok')
  if (!/gr gümüş/.test(await cell('GMSTR.F', 2))) throw new Error('GMSTR içeriği: ' + (await cell('GMSTR.F', 2)))
  if (!/Al sinyali|Her zaman|Pahalı|Primli|BIST kapalı/.test(await cell('GMSTR.F', 4))) throw new Error('durum yok')
  // Nereden almalı: cümle biçiminde senaryo, çubuklu liste; gümüşe geçince fon satırı değişir
  const go = (t) => page.locator('.an-tabs a', { hasText: t }).click()
  await go('Nereden almalı')
  await page.locator('.cost-row').nth(1).waitFor()
  const list = () => page.locator('.cost-list').innerText()
  if (!/stopaj %17,5/.test(await list())) throw new Error('fon satırı yok')
  if (!/Fiziki külçe altın/.test(await list())) throw new Error('fiziki satır yok')
  const before = await page.locator('.cost .an-answer').innerText()
  await page.locator('.cost-say select').first().selectOption('silver')
  if (!/GMSTR/.test(await list())) throw new Error('gümüş fonu yok')
  await page.locator('.cost-say input').nth(1).fill('5')
  if ((await page.locator('.cost .an-answer').innerText()) === before) throw new Error('cevap değişmedi')
  await page.locator('.cost-say select').first().selectOption('gold')
  await page.locator('.cost-say input').nth(1).fill('30')
  // Satıra dokununca kalem kalem döküm
  await page.locator('.cost-row', { hasText: 'Altın fonu' }).locator('summary').click()
  if (!/Stopaj/.test(await page.locator('.cost-row', { hasText: 'Altın fonu' }).locator('.cost-parts').innerText())) throw new Error('döküm yok')
  // Kendi bankam: elle girilen alış/satış listeye satır olarak girer
  await page.locator('.cost-own summary').click()
  await page.locator('.cost-own input').nth(0).fill('6500')
  await page.locator('.cost-own input').nth(1).fill('6540')
  await page.locator('.cost-row', { hasText: 'Kendi bankam' }).waitFor()
  await page.locator('.cost-own input').nth(0).fill('')
  await page.locator('.cost-own input').nth(1).fill('')
  // Birikim: ev/altın, ev/dolar, altın/gümüş
  await go('Birikim')
  await page.locator('.vd').nth(2).waitFor({ timeout: 20000 })
  const acts = await page.locator('.adv-act').evaluateAll((els) => els.map((e) => e.childNodes[0].textContent))
  const ok = [/Altın boz, ev al|Altın biriktir/, /Dolar boz, ev al|Dolar biriktir/, /Altın sat, gümüş al|Gümüş sat, altın al/]
  ok.forEach((re, i) => { if (!re.test(acts[i] ?? '')) throw new Error('öneri ' + (i + 1) + ': ' + acts[i]) })
  // Para arzına göre: beş değerleme
  await go('Para arzı')
  await page.locator('.vd').nth(4).waitFor({ timeout: 20000 })
  const money = await page.locator('.adv-act').evaluateAll((els) => els.map((e) => e.childNodes[0].textContent))
  for (const s of ['Dolar (al|sat)', 'Altın (al|sat)', 'Gram altın (al|sat)', 'BIST (al|sat)', 'Ev (al|için bekle)']) if (!money.some((t) => new RegExp('^' + s).test(t))) throw new Error('para arzı kartı yok: ' + s + ' | ' + money.join(' ¦ '))
})

await step('dip ve tepe: düşüşün sertliği, pazar geneli, geçmiş sonuçlar, panik dönemleri', async () => {
  await page.goto(BASE + '/#/analiz?v=NASDAQ:NVDA')
  await page.locator('.ex-gauge').nth(1).waitFor({ timeout: 40000 })
  if (!/NVDA/.test(await page.locator('.tn-answer').textContent())) throw new Error('cevap: ' + (await page.locator('.tn-answer').textContent()))
  if (!/hisselerin %[\d,]+’i aşırı satılmış/.test(await page.locator('.ex-gauge').nth(1).innerText())) throw new Error('pazar genişliği yok')
  // Sınama cümlesi ve tablo: 2021 sonrası ve öncesi, her zamanki oranla
  const say = await page.locator('.ex-evidence .tn-say').first().textContent()
  if (!/10 seferin \d+ tanesinde yukarıdaydı; herhangi bir günde alınsaydı 10 seferin \d+/.test(say)) throw new Error('sınama cümlesi: ' + say)
  if (await page.locator('.ex-evidence tbody tr').count() !== 2) throw new Error('iki dönem satırı bekleniyordu')
  if (await page.locator('.ex-years > div').count() < 3) throw new Error('yıl yıl döküm yok')
  // Panik dönemleri, tek başına düşüş uyarısı, tepe notu, grafik
  if (await page.locator('.ex-ep tbody tr').count() < 5) throw new Error('panik dönemleri eksik')
  await page.locator('.ex-alone').waitFor()
  // Strateji sınaması: eğri, üç portföy, sonuç cümlesi
  await page.locator('.ex-strategy .ex-curve svg path.ex-line').nth(1).waitFor({ timeout: 10000 })
  if (await page.locator('.ex-strat tbody tr').count() !== 3) throw new Error('üç portföy satırı bekleniyordu')
  if (!/S&P 500/.test(await page.locator('.ex-verdict').textContent())) throw new Error('strateji sonucu: ' + (await page.locator('.ex-verdict').textContent()))
  await page.locator('.ex-top', { hasText: 'güvenilir bir işaret yok' }).waitFor()
  await page.locator('.cc-plot canvas').first().waitFor({ timeout: 10000 })
  // Makro varlık: genişlik yok, kendi geçmişi
  await page.locator('.wb-assets .chip', { hasText: 'Altın' }).first().click()
  await page.waitForFunction(() => /v=GOLD/.test(location.hash), null, { timeout: 5000 })
  await page.locator('.tn-answer', { hasText: 'Altın' }).waitFor({ timeout: 20000 })
  if (await page.locator('.ex-gauge').count() !== 1) throw new Error('makroda tek gösterge bekleniyordu')
  // BIST: dolar bazında, BIST sınaması
  await page.locator('.st-search input').fill('thyao')
  await page.locator('.st-hits button', { hasText: 'THYAO' }).first().click()
  await page.locator('.tn-answer', { hasText: 'THYAO' }).waitFor({ timeout: 40000 })
  if (!/dolar bazında/.test(await page.locator('.cc-ohlc b').first().textContent())) throw new Error('BIST dolar bazında değil')
  if (!/BIST hisseleri/.test(await page.locator('.ex-evidence .tn-say').first().textContent())) throw new Error('BIST sınaması kullanılmadı')
})

await step('görünüm: tek cümlelik sonuç, vade kutuları, mum grafik, ayrıntı kapalı', async () => {
  const tfBtn = (t) => page.locator('.wb-pick .segmented button', { hasText: t })
  await page.goto(BASE + '/#/analiz/olaylar?v=GOLD')
  await page.locator('.wb .cc-plot canvas').first().waitFor({ timeout: 40000 })
  if ((await page.locator('.wb-assets .chip[aria-pressed=true]').textContent()) !== 'Altın') throw new Error('seçili varlık Altın değil')
  // Olay seç: düz cümle (kaç seferin kaçında yukarıda, her zaman), sonuç etiketi ve dört vade kutusu
  await tfBtn('Haftalık').click()
  await page.locator('.wb-pick select').selectOption('trend-down')
  const say = await page.locator('.wb-say').textContent()
  if (!/tanesinde fiyat.*sonra daha yukarıdaydı\. Karşılaştırma: .* 10 seferin \d+ tanesinde/.test(say)) throw new Error('sonuç cümlesi: ' + say)
  if (!/Her zamankinden (farksız|belirgin iyi|belirgin kötü)|Örnek az/.test(await page.locator('.wb-verdict').textContent())) throw new Error('sonuç etiketi yok')
  if (await page.locator('.wb-hzs button').count() !== 4) throw new Error('dört vade kutusu bekleniyordu')
  // Vade kutusuna dokun: cümle o vadeye geçer
  await page.locator('.wb-hzs button').nth(3).click()
  if (!/1 yıl sonra/.test(await page.locator('.wb-say').textContent())) throw new Error('vade değişmedi')
  // Ayrıntı kapalı gelir; açınca yüzdeler, aralık ve her seferin sonucu
  if (await page.locator('.wb-more[open]').count()) throw new Error('ayrıntı açık geldi')
  await page.locator('.wb-more > summary').click()
  if (!/aralık \d+–\d+/.test(await page.locator('.wb-more .wb-odds').innerText())) throw new Error('güven aralığı görünmüyor')
  const dots = page.locator('.wb-strip circle.sc-mark')
  if (await dots.count() < 3) throw new Error('dağılım şeridi boş')
  await dots.first().click()
  await page.locator('.wb-picked', { hasText: 'sonrası' }).waitFor({ timeout: 3000 })
  // Zaman dilimi: günlükte vadeler değişir, RSI paneli var; aylıkta makro olaylar listeye girer
  await tfBtn('Günlük').click()
  await page.locator('.wb-hzs button', { hasText: '1 hafta sonra' }).waitFor({ timeout: 5000 })
  if (await page.locator('.cc-rsi:not(.hidden) canvas').count() < 1) throw new Error('RSI paneli yok')
  await tfBtn('Aylık').click()
  await page.locator('.wb-pick select optgroup[label="Makro durumların başlaması"] option').first().waitFor({ state: 'attached', timeout: 10000 })
  // Varlık değiştir
  await page.locator('.wb-assets .chip', { hasText: 'Petrol' }).click()
  await page.locator('.wb-assets .chip[aria-pressed=true]', { hasText: 'Petrol' }).waitFor({ timeout: 10000 })
  await page.locator('.cc-ohlc b', { hasText: 'petrol' }).first().waitFor({ timeout: 10000 })
  // Varlıklar arası liste: satıra dokununca tezgâh o olaya geçer
  const rows = page.locator('.an-group > button.ev-row')
  if (await rows.count()) {
    const what = await rows.first().locator('.what b').textContent()
    await rows.first().click()
    await page.waitForFunction((w) => w === document.querySelector('.wb-name')?.textContent, what, { timeout: 5000 })
  }
  // Makro tablo ve 12 aylık görüş kapalı ayrıntıda durur
  await page.locator('.ov-state > details > summary').click()
  await page.locator('.ov-table tbody tr').nth(5).waitFor({ timeout: 10000 })
})

await step('kendi olayım: tanımla, grafikte gör, sil', async () => {
  await page.goto(BASE + '/#/analiz/olaylar?v=GOLD')
  await page.locator('.wb .cc-plot canvas').first().waitFor({ timeout: 40000 })
  await page.locator('.wb .st-alarm button', { hasText: 'Kendi olayını tanımla' }).click()
  await page.locator('.wb-composer input[aria-label="Düzey"]').first().fill('35')
  await page.locator('.wb-composer button', { hasText: 'Kaydet ve göster' }).click()
  await page.locator('.wb-name', { hasText: '35' }).waitFor({ timeout: 5000 })
  if (!/kez oldu|Önceki/.test(await page.locator('.wb-say').textContent())) throw new Error('özel olay hiç gerçekleşmemiş')
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('piyasa.olaylar.v1')).length)
  if (stored !== 1) throw new Error('özel olay kaydedilmedi')
  await page.locator('.wb .st-alarm button', { hasText: 'Bu olayı sil' }).click()
  if (await page.evaluate(() => JSON.parse(localStorage.getItem('piyasa.olaylar.v1')).length) !== 0) throw new Error('silinmedi')
})

await step('analiz: hisse seç, mum grafik, pazar geneli kanıt, güçlü kurulumlar', async () => {
  await page.goto(BASE + '/#/analiz')
  await page.locator('.an-tabs a', { hasText: 'Hisse' }).click()
  await page.locator('.an-tabs a[aria-current=page]', { hasText: 'Hisse' }).waitFor({ timeout: 5000 })
  await page.locator('.ex-gauges').waitFor({ state: 'detached', timeout: 5000 })
  await page.locator('.st-search input').fill('thyao')
  await page.locator('.st-hits button', { hasText: 'THYAO' }).first().click()
  await page.locator('.wb .cc-plot canvas').first().waitFor({ timeout: 40000 })
  if (!/analiz\/hisse\/BIST(:|%3A)THYAO/.test(page.url())) throw new Error('adres: ' + page.url())
  // BIST varsayılan olarak dolar bazında; TL'ye geçilebilir
  if (!/dolar bazında/.test(await page.locator('.cc-ohlc b').first().textContent())) throw new Error('grafik dolar bazında değil')
  await page.locator('.wb-head .segmented button', { hasText: 'TL' }).click()
  await page.waitForFunction(() => !/dolar bazında/.test(document.querySelector('.cc-ohlc b')?.textContent ?? 'dolar bazında'), null, { timeout: 20000 })
  await page.locator('.wb-head .segmented button', { hasText: 'Dolar bazında' }).click()
  await page.waitForFunction(() => /dolar bazında/.test(document.querySelector('.cc-ohlc b')?.textContent ?? ''), null, { timeout: 20000 })
  // Olay seç: hissedeki sonuç ve pazar genelindeki sonuç yan yana
  await page.locator('.wb-pick select').selectOption('rsi-30')
  await page.locator('.wb-more > summary').click()
  await page.locator('.wb-market', { hasText: 'BIST hisselerinin tamamında' }).waitFor({ timeout: 10000 })
  if (await page.locator('.wb-market .ev-odds').count() !== 4) throw new Error('pazar geneli dört vade bekleniyordu')
  if (!/Üç dönemde/.test(await page.locator('.wb-market .note').textContent())) throw new Error('dönem dökümü yok')
  // Güçlü kurulumlar bölümü: BIST'te kanıtlanmış kurulum yok
  // Güçlü kurulumlar tek satırlık özetle kapalı durur (cevap veriye bağlıdır)
  if (!/Güçlü kurulumlar: .*kurulum/.test(await page.locator('.wb-setups > summary').textContent())) throw new Error('kurulum özeti: ' + (await page.locator('.wb-setups > summary').textContent()))
  // Yalnızca kısa kodla ya da başka borsa koduyla gelen sembol kopyadaki karşılığına yönlenir
  await page.goto(BASE + '/#/analiz/hisse/nvda')
  await page.waitForFunction(() => /hisse\/NASDAQ(:|%3A)NVDA/.test(location.hash), null, { timeout: 30000 })
  await page.locator('.wb .cc-plot canvas').first().waitFor({ timeout: 40000 })
  await page.goto(BASE + '/#/analiz/hisse/BCBA:NVDA')
  await page.waitForFunction(() => /hisse\/NASDAQ(:|%3A)NVDA/.test(location.hash), null, { timeout: 30000 })
  // Kopyada hiç olmayan sembol: açık bir açıklama
  await page.goto(BASE + '/#/analiz/hisse/XETR:YOKBOYLE')
  await page.locator('.an-answer', { hasText: 'kopyada yok' }).waitFor({ timeout: 30000 })
  // ABD: güçlü kurulumlar, üç dönemin sonucu
  await page.goto(BASE + '/#/analiz/hisse/NASDAQ:AAPL')
  await page.locator('.wb .cc-plot canvas').first().waitFor({ timeout: 40000 })
  await page.locator('.wb-pick select').selectOption('rsi-30')
  await page.locator('.wb-more > summary').click()
  await page.locator('.wb-market', { hasText: 'ABD hisselerinin tamamında' }).waitFor({ timeout: 10000 })
  const us = page.locator('.wb-setups')
  if (!(await page.locator('.wb-setups[open]').count())) await us.locator('> summary').click()
  await us.locator('.st-sig .st-periods').nth(2).waitFor({ timeout: 20000 })
  if (await us.locator('.st-sig .st-periods').first().locator('> div').count() !== 3) throw new Error('üç dönem bekleniyordu')
})

await step('alarmlar: fiyat, avantajlı fiyat, olay ve güçlü kurulum kur; çalan alarm bildirilir', async () => {
  await page.goto(BASE + '/#/alarmlar')
  await page.locator('.an-answer', { hasText: 'Henüz alarm yok' }).waitFor({ timeout: 10000 })
  // Fiyat: zaten ötesinde olan düzey hemen çalar ve kapanır
  await page.locator('.al-new .st-search input').fill('thyao')
  await page.locator('.al-new .st-hits button', { hasText: 'THYAO' }).first().click()
  await page.locator('.al-say input').fill('1000000')
  await page.locator('.al-go .note', { hasText: 'alarm hemen çalar' }).waitFor({ timeout: 10000 })
  await page.locator('.al-go .btn').click()
  await page.locator('.al-row.done', { hasText: 'THYAO' }).waitFor({ timeout: 20000 })
  await page.locator('.al-log li', { hasText: 'altına indi' }).waitFor({ timeout: 5000 })
  // Avantajlı fiyat
  await page.locator('.al-new button', { hasText: 'Avantajlı fiyat' }).first().click()
  await page.locator('.al-go .btn').click()
  await page.locator('.al-row', { hasText: 'değerinin altına inerse' }).waitFor({ timeout: 5000 })
  // Olay: grafik tezgâhındaki bağlantı formu hazır doldurur (varlık, zaman dilimi, olay)
  await page.goto(BASE + '/#/analiz/olaylar?v=GOLD')
  await page.locator('.wb .cc-plot canvas').first().waitFor({ timeout: 40000 })
  await page.locator('.wb-pick .segmented button', { hasText: 'Haftalık' }).click()
  await page.locator('.wb-pick select').selectOption('trend-down')
  await page.locator('.wb > .st-alarm a', { hasText: 'haber ver' }).click()
  await page.locator('.al-say select[aria-label="Olay"]').waitFor({ timeout: 5000 })
  if (await page.locator('.al-say select[aria-label="Olay"]').inputValue() !== 'trend-down') throw new Error('olay hazır gelmedi')
  if (await page.locator('.al-say select[aria-label="Varlık"]').inputValue() !== 'GOLD') throw new Error('varlık hazır gelmedi')
  await page.locator('.al-go .btn').click()
  await page.locator('.al-row', { hasText: 'haftalık veride' }).waitFor({ timeout: 5000 })
  // Kontrol edilir: durum metni gelir, hata olmaz
  await page.waitForFunction(() => { const r = [...document.querySelectorAll('.al-row')].find((x) => x.textContent.includes('haftalık veride')); return r && /son kez|gerçekleşti|hiç olmadı/.test(r.textContent) }, null, { timeout: 30000 })
  // Güçlü kurulum
  await page.goto(BASE + '/#/alarmlar?tur=sinyal&s=NASDAQ:AAPL')
  await page.locator('.al-say', { hasText: 'AAPL' }).waitFor({ timeout: 5000 })
  await page.locator('.al-go .btn').click()
  await page.locator('.al-row', { hasText: 'kurulumu oluşursa' }).waitFor({ timeout: 5000 })
  if (await page.locator('.al-row').count() !== 4) throw new Error('4 alarm bekleniyordu')
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('piyasa.alarms.v1')).alarms.map((a) => a.type).sort().join())
  if (saved !== 'event,premium,price,signal') throw new Error('kayıt: ' + saved)
  // Sil
  await page.locator('.al-row', { hasText: 'değerinin altına inerse' }).locator('.icon-btn').click()
  if (await page.locator('.al-row').count() !== 3) throw new Error('silinmedi')
})

await step('mobil: analiz sayfalarında yatay taşma yok', async () => {
  const m = await ctx.newPage()
  await m.setViewportSize({ width: 390, height: 800 })
  for (const h of ['analiz?v=GOLD', 'analiz?v=BIST:THYAO', 'analiz?v=NASDAQ:NVDA', 'analiz/olaylar?v=GOLD', 'analiz/hisse/BIST:THYAO', 'analiz/makro', 'alarmlar?tur=olay&s=GOLD&e=rsi-30&tf=W']) {
    await m.goto(BASE + '/#/' + h)
    await m.waitForTimeout(3500)
    const over = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    if (over > 1) throw new Error(`${h}: ${over}px taşıyor`)
  }
  await m.close()
})

await step('sözlük: koşul çipinden terime, arama', async () => {
  await page.goto(BASE + '/#/listeler/d_bist_oversold_big')
  await page.locator('.conds a', { hasText: 'RSI' }).click()
  await page.locator('#t-rsi').waitFor()
  if (!page.url().includes('/sozluk/rsi')) throw new Error('adres: ' + page.url())
  await page.fill('.gloss-search input', 'piyasa değeri')
  await page.locator('#t-piyasa-degeri').waitFor()
  if ((await page.locator('.term').count()) > 5) throw new Error('arama süzmedi')
})

await step('ayarlar: koyu tema', async () => {
  await page.goto(BASE + '/#/ayarlar')
  await page.locator('.segmented button', { hasText: 'Koyu' }).click()
  const t = await page.evaluate(() => document.documentElement.dataset.theme)
  if (t !== 'dark') throw new Error('tema: ' + t)
  await page.locator('.segmented button', { hasText: 'Sistem' }).click()
})

await step('tam ekran pano', async () => {
  await page.goto(BASE + '/#/pano/b_borsalar')
  await page.locator('.kiosk h1', { hasText: 'Borsalar' }).waitFor()
  await page.locator('.kiosk .card-row').first().waitFor()
})

await step('konsol hatası yok', async () => {
  if (errors.length) throw new Error(errors.slice(0, 5).join(' | '))
})

await browser.close()
console.log(failed ? `\n${failed} adım başarısız` : '\nTüm adımlar geçti')
process.exit(failed ? 1 : 0)
