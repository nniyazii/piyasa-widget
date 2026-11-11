/**
 * Bankaların kendi sitelerinde yayımladığı gram altın ve gram gümüş alış/satış fiyatları.
 *   Çıktı: { generated, banks: [{ id, name, gold?: { bid, ask }, silver?: { bid, ask } }] }
 * bid = bankanın alış fiyatı (sen satarken), ask = bankanın satış fiyatı (sen alırken). TL / gram.
 * Bir banka okunamazsa atlanır; hiçbir banka gelmezse boş liste döner.
 */
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const get = async (url, init = {}) => {
  const r = await fetch(url, { ...init, headers: { 'User-Agent': UA, 'Accept-Language': 'tr-TR,tr;q=0.9', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(20_000) })
  if (!r.ok) throw new Error(`${r.status}`)
  return r.text()
}
/** "6.442,771307" → 6442.771307 */
export const trNum = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'))
const pair = (bid, ask) => (bid > 0 && ask > bid && ask / bid < 1.2 ? { bid, ask } : undefined)

/** Kuveyt Türk: sitedeki kur bileşeninin JSON kaynağı (ALT (gr), GMS (gr)) */
export function parseKuveytTurk(json) {
  const rows = JSON.parse(json)
  const of = (t) => { const x = rows.find((r) => r.Title === t); return x ? pair(Number(x.BuyRate), Number(x.SellRate)) : undefined }
  return { gold: of('ALT (gr)'), silver: of('GMS (gr)') }
}
async function kuveytTurk() {
  const base = 'https://www.kuveytturk.com.tr'
  const known = 'B83A1EF44DD940F2FEC85646BDB25EA0'
  const tryId = async (id) => { const t = await get(`${base}/ck0d84?${id}`); return t.trimStart().startsWith('[') && t.includes('ALT (gr)') ? parseKuveytTurk(t) : undefined }
  let r = await tryId(known).catch(() => undefined)
  if (!r) {
    // Bileşen kimliği değişmişse sayfadan bul
    const html = await get(`${base}/kendim-icin/yatirim-urunleri/hazine-urunleri/canli-altin-fiyatlari-ve-altin-kuru`)
    const ids = [...new Set([...html.matchAll(/ck0d84\?([0-9A-F]{32})/g)].map((m) => m[1]))]
    for (const id of ids.slice(0, 60)) { r = await tryId(id).catch(() => undefined); if (r) break }
  }
  if (!r) throw new Error('kur kaynağı bulunamadı')
  return r
}

/** Enpara: "Altın (gram) 6.442,77 TL 6.568,94 TL" ve "Gümüş (gram) …" */
export function parseEnpara(html) {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&uuml;/g, 'ü').replace(/&Uuml;/g, 'Ü').replace(/&#351;|&scedil;/g, 'ş').replace(/\s+/g, ' ')
  const of = (label) => { const m = text.match(new RegExp(label + '\\s*\\(gram\\)\\s*([\\d.]+,\\d+)\\s*TL\\s*([\\d.]+,\\d+)\\s*TL')); return m ? pair(trNum(m[1]), trNum(m[2])) : undefined }
  return { gold: of('Altın'), silver: of('Gümüş') }
}
const enpara = async () => parseEnpara(await get('https://www.enpara.com/hesaplar/doviz-ve-altin-kurlari'))

/** Akbank: kur bileşeninin JSON kaynağı, "kurTuru 8" (XAU, XAG gram/TL) */
export function parseAkbank(json) {
  const rows = JSON.parse(json).d.Data.DovizKurlari
  const of = (code) => { const x = rows.find((r) => r.AlfaKod === code); return x ? pair(Number(x.DovizAlis), Number(x.DovizSatis)) : undefined }
  return { gold: of('XAU'), silver: of('XAG') }
}
const akbank = async () => parseAkbank(await get('https://www.akbank.com/_layouts/15/Akbank/CalcTools/Ajax.aspx/GetDovizKurlari', {
  method: 'POST', body: JSON.stringify({ kurTuru: '8' }),
  headers: { 'Content-Type': 'application/json; charset=utf-8', Referer: 'https://www.akbank.com/mevduat-yatirim/yatirim/doviz/canli-doviz-kurlari' },
}))

/** Yapı Kredi: hesaplama aracının XML kaynağı, <Exchange Buy="6433,3" Sale="6633,743" …> */
export function parseYapiKredi(xml) {
  const m = xml.match(/<Exchange[^>]*\bBuy="([\d.,]+)"[^>]*\bSale="([\d.,]+)"/)
  return m ? pair(Number(m[1].replace(',', '.')), Number(m[2].replace(',', '.'))) : undefined
}
async function yapiKredi() {
  const one = (c) => get(`https://www.yapikredi.com.tr/service-data/calculate-tools/exchange?currency=${c}&tocurrency=YTL&amount=1`, {
    headers: { 'X-Requested-With': 'XMLHttpRequest', Referer: 'https://www.yapikredi.com.tr/yatirimci-kosesi/altin-bilgileri' },
  }).then(parseYapiKredi).catch(() => undefined)
  const [gold, silver] = await Promise.all([one('XAU'), one('XAG')])
  return { gold, silver }
}

/**
 * Ziraat: "Fiyatlar ve oranlar" sayfasındaki kıymetli maden tabloları (önce gişe, sonra internet kuru).
 * Mevduat hesabı satırları kullanılır: A02 ALTIN (1000/1000), G02 GUMUS (1000/1000); internet kuru tercih edilir.
 */
export function parseZiraat(html) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const last = (label) => {
    const all = [...text.matchAll(new RegExp(label + '\\s*\\(1000/1000\\)\\s*([\\d.,]+)\\s+([\\d.,]+)', 'g'))]
    const m = all[all.length - 1]
    return m ? pair(Number(m[1].replace(',', '.')), Number(m[2].replace(',', '.'))) : undefined
  }
  return { gold: last('ALTIN'), silver: last('GUMUS') }
}
const ziraat = async () => parseZiraat(await get('https://www.ziraatbank.com.tr/tr/fiyatlar-ve-oranlar'))

const SOURCES = [
  { id: 'kuveytturk', name: 'Kuveyt Türk', run: kuveytTurk },
  { id: 'enpara', name: 'Enpara', run: enpara },
  { id: 'akbank', name: 'Akbank', run: akbank },
  { id: 'yapikredi', name: 'Yapı Kredi', run: yapiKredi },
  { id: 'ziraat', name: 'Ziraat Bankası', run: ziraat },
]

export async function fetchBanks() {
  const banks = []
  await Promise.all(SOURCES.map(async (s) => {
    try {
      const r = await s.run()
      if (r.gold || r.silver) banks.push({ id: s.id, name: s.name, ...r })
    } catch (e) { console.log(`banka fiyatı alınamadı: ${s.name} (${e.message})`) }
  }))
  banks.sort((a, b) => SOURCES.findIndex((s) => s.id === a.id) - SOURCES.findIndex((s) => s.id === b.id))
  return { generated: Date.now(), banks }
}
