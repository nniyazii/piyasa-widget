/** Mum grafik verisi: aylık, haftalık, günlük açılış/yüksek/düşük/kapanış (data/candles/{KOD}.json). */
export type Candle = [t: number, o: number, h: number, l: number, c: number]
export type CandleTf = 'M' | 'W' | 'D'
export type Candles = Partial<Record<CandleTf, Candle[]>>

const cache = new Map<string, Promise<Candles | undefined>>()
const raw = (id: string) => {
  if (!cache.has(id)) cache.set(id, fetch(`data/candles/${id}.json`, { cache: 'no-cache' }).then((r) => (r.ok ? (r.json() as Promise<Candles>) : undefined)).catch(() => undefined))
  return cache.get(id)!
}
/** Her mumu, o mumun zamanındaki (yoksa önceki son) kur kapanışıyla çevirir */
function convert(a: Candle[] | undefined, fx: Candle[] | undefined, f: (p: number, x: number) => number): Candle[] | undefined {
  if (!a || !fx?.length) return undefined
  const out: Candle[] = []
  let k = 0
  for (const b of a) {
    while (k + 1 < fx.length && fx[k + 1][0] <= b[0] + 43200) k++
    if (fx[k][0] > b[0] + 43200) continue
    const x = fx[k][4]
    out.push([b[0], f(b[1], x), f(b[2], x), f(b[3], x), f(b[4], x)])
  }
  return out
}
/** Varlığın mumları; gram altın ve dolar bazında BIST, Dolar/TL kuruyla türetilir (yaklaşık: her mum kur kapanışıyla çevrilir) */
export async function loadCandles(id: string): Promise<Candles | undefined> {
  if (id === 'GAUTRY' || id === 'XU100USD') {
    const [a, fx] = await Promise.all([raw(id === 'GAUTRY' ? 'GOLD' : 'XU100'), raw('USDTRY')])
    if (!a || !fx) return undefined
    const f = id === 'GAUTRY' ? (p: number, x: number) => (p * x) / 31.1035 : (p: number, x: number) => p / x
    return { M: convert(a.M, fx.M, f), W: convert(a.W, fx.W, f), D: convert(a.D, fx.D, f) }
  }
  return raw(id)
}
