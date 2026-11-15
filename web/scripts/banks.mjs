/** Banka altın/gümüş fiyatlarını yazar:  node scripts/banks.mjs [ÇIKTI=dist/data/banks.json] [ÖNCEKİ KOPYANIN ADRESİ] */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fetchBanks } from '../server/banks.mjs'

const out = process.argv[2] ?? 'dist/data/banks.json'
// Önceki kopya: mesai dışındayken mesai içindeki son fiyatları taşımak için
const prev = process.argv[3] ? await fetch(process.argv[3]).then((x) => (x.ok ? x.json() : undefined)).catch(() => undefined) : undefined
const r = await fetchBanks(prev)
if (!r.banks.length) { console.log('Hiçbir banka okunamadı; dosya yazılmadı'); process.exit(1) }
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify(r))
console.log(`${r.session ? 'mesai içi' : 'mesai dışı'}${r.daytime ? `, mesai içi son fiyatlar: ${new Date(r.daytime.generated).toISOString()}` : ''}`)
console.log([...r.banks, ...r.physical].map((b) => `${b.name}: altın ${b.gold ? b.gold.bid.toFixed(0) + '/' + b.gold.ask.toFixed(0) : '—'}, gümüş ${b.silver ? b.silver.bid.toFixed(2) + '/' + b.silver.ask.toFixed(2) : '—'}`).join('\n'))
