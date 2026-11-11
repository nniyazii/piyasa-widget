import { describe, expect, it } from 'vitest'
import { parseEnpara, parseKuveytTurk, trNum } from './banks.mjs'

describe('banka fiyatları', () => {
  it('Türkçe sayı', () => { expect(trNum('6.442,771307')).toBeCloseTo(6442.771307, 6) })
  it('Kuveyt Türk JSON', () => {
    const r = parseKuveytTurk('[{"Title":"USD","BuyRate":49.6,"SellRate":50.6},{"Title":"ALT (gr)","BuyRate":6456.00811,"SellRate":6625.70494},{"Title":"GMS (gr)","BuyRate":84.62072,"SellRate":86.86096}]')
    expect(r.gold).toEqual({ bid: 6456.00811, ask: 6625.70494 })
    expect(r.silver).toEqual({ bid: 84.62072, ask: 86.86096 })
  })
  it('Enpara sayfası', () => {
    const r = parseEnpara('<td>Altın (gram)</td><td>6.442,771307 TL</td><td>6.568,947109 TL</td><td>Altın (gram)/USD</td><td>129,6</td><td>Gümüş (gram)</td><td>84,598772 TL</td> <td>87,797207 TL</td>')
    expect(r.gold.bid).toBeCloseTo(6442.771307, 6)
    expect(r.gold.ask).toBeCloseTo(6568.947109, 6)
    expect(r.silver).toEqual({ bid: 84.598772, ask: 87.797207 })
  })
  it('anlamsız fiyat çifti atılır', () => {
    expect(parseKuveytTurk('[{"Title":"ALT (gr)","BuyRate":6600,"SellRate":6500}]').gold).toBeUndefined()
  })
})
