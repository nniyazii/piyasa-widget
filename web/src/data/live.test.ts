/**
 * Gerçek TradingView / Yahoo'ya karşı (varsayılan çalıştırmada atlanır): LIVE=1 npx vitest run src/data/live.test.ts
 * Sunucudaki /api vekili, testte doğrudan Yahoo'ya yönlendirilir.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { defaultInstruments } from '../core/catalog'
import { SCREEN_TEMPLATES } from '../core/screener'
import { runScreen } from './screens'
import { quotes, search } from './tv'

const live = !!process.env.LIVE
const d = live ? describe : describe.skip

beforeAll(() => {
  if (!live) return
  const real = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === 'api/health') return new Response(JSON.stringify({ ok: true, yahoo: true }))
    if (url.startsWith('api/yahoo/chart/')) {
      return real('https://query1.finance.yahoo.com/v8/finance/chart/' + url.slice('api/yahoo/chart/'.length), {
        headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' },
      })
    }
    return real(input, init)
  }) as typeof fetch
})

d('canlı veri', () => {
  it('varsayılan listenin fiyatları', async () => {
    const ins = defaultInstruments()
    const q = await quotes(ins)
    const missing = ins.filter((i) => !q[i.key]).map((i) => i.key)
    console.log('fiyatı gelmeyen:', missing, 'USDTRY', q.USDTRY)
    expect(missing.length).toBeLessThanOrEqual(1)
    expect(q.USDTRY.prevClose).toBeGreaterThan(0)
    expect(q.XU100.delayed).toBe(true)
  }, 30_000)

  it('zor aramalar', async () => {
    for (const [query, want] of [['ALTIN.S1', 'BIST:ALTIN'], ['gmstr.f', 'BIST:GMSTR'], ['trhpi', 'ECONOMICS:TRHPI'], ['aselsan', 'BIST:ASELS'], ['apple', 'NASDAQ:AAPL']] as const) {
      const hits = await search(query)
      console.log(query, '→', hits.slice(0, 3).map((h) => h.symbol))
      expect(hits.slice(0, 5).map((h) => h.symbol), query).toContain(want)
    }
  }, 60_000)

  it('her hazır liste çalışır', async () => {
    const instruments = [...defaultInstruments()]
    const empty: string[] = []
    for (const s of SCREEN_TEMPLATES) {
      const r = await runScreen(s, { instruments })
      console.log(`[${s.name}] taranan=${r.scanned} eşleşen=${r.rows.length} hata=${r.error ?? '-'} ${r.rows.slice(0, 3).map((x) => x.name).join(', ')}`)
      expect(r.error, s.name).toBeUndefined()
      if (!r.rows.length && s.universe !== 'MY_LIST') empty.push(s.name)
    }
    expect(empty.length, empty.join(', ')).toBeLessThanOrEqual(1)
  }, 300_000)
})
