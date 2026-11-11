/**
 * Bankaların kendi sitelerinde yayımladığı gram altın ve gram gümüş alış/satış fiyatları.
 *   Çıktı: { generated, banks: [{ id, name, gold?: { bid, ask }, silver?: { bid, ask } }] }
 * bid = bankanın alış fiyatı (sen satarken), ask = bankanın satış fiyatı (sen alırken). TL / gram.
 * Bir banka okunamazsa atlanır; hiçbir banka gelmezse boş liste döner.
 */
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const get = async (url) => {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'tr-TR,tr;q=0.9' }, signal: AbortSignal.timeout(20_000) })
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

const SOURCES = [
  { id: 'kuveytturk', name: 'Kuveyt Türk', run: kuveytTurk },
  { id: 'enpara', name: 'Enpara', run: enpara },
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
