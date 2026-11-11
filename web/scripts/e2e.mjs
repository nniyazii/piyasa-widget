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
    console.log('✗', name, '\n   ', e.message.split('\n')[0])
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
  if ((await page.locator('.bt-table').first().locator('tbody tr').count()) !== 4) throw new Error('ufuk tablosu eksik')
  await page.locator('.bt-chart svg path.list').waitFor()
  await page.locator('.rel-panel .rel-score').waitFor()
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
