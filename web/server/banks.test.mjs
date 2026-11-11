import { describe, expect, it } from 'vitest'
import { parseAltinkaynak, parseAkbank, parseEnpara, parseKuveytTurk, parseYapiKredi, parseZiraat, trNum } from './banks.mjs'

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
  it('Akbank JSON', () => {
    const r = parseAkbank('{"d":{"Data":{"DovizKurlari":[{"AlfaKod":"USD","DovizAlis":"48.857","DovizSatis":"51.357"},{"AlfaKod":"XAU","DovizAlis":"6380.715","DovizSatis":"6602.215"},{"AlfaKod":"XAG","DovizAlis":"83.874","DovizSatis":"86.674"}]}}}')
    expect(r).toEqual({ gold: { bid: 6380.715, ask: 6602.215 }, silver: { bid: 83.874, ask: 86.674 } })
  })
  it('Yapı Kredi XML', () => {
    expect(parseYapiKredi('<ExchangeItems><Exchange Code="YTL" Buy="6433,3" Sale="6633,743" ChangeRaitoDaily="0,47" /></ExchangeItems>')).toEqual({ bid: 6433.3, ask: 6633.743 })
    expect(parseYapiKredi('<ExchangeItems />')).toBeUndefined()
  })
  it('Ziraat: mevduat hesabı satırı, internet kuru (ikinci tablo)', () => {
    const t = (a, b, g) => `<tr><td>A01*</td><td>ALTIN (995/1000)</td><td>6451,06</td><td>6587,91</td></tr><tr><td>A02**</td><td>ALTIN (1000/1000)</td><td>${a}</td><td>${b}</td></tr><tr><td>G02**</td><td>GUMUS (1000/1000)</td><td>${g}</td><td>87,0</td></tr>`
    const r = parseZiraat(t('6483,48722', '6621,015737', '84,699615') + t('6486,728964', '6617,705229', '84,741965'))
    expect(r.gold).toEqual({ bid: 6486.728964, ask: 6617.705229 })
    expect(r.silver).toEqual({ bid: 84.741965, ask: 87.0 })
  })
  it('Altınkaynak: gram, külçe, gümüş', () => {
    const r = parseAltinkaynak('[{"Alis":"6.494","Satis":"6.550","Kod":"CH_T"},{"Alis":"6.500","Satis":"6.619","Kod":"GA"},{"Alis":"79,78","Satis":"92,87","Kod":"AG_T"},{"Alis":"324.689","Satis":"334.008","Kod":"GA50"}]')
    expect(r).toEqual({ gram: { bid: 6500, ask: 6619 }, bar: { bid: 6494, ask: 6550 }, silver: { bid: 79.78, ask: 92.87 } })
  })
  it('anlamsız fiyat çifti atılır', () => {
    expect(parseKuveytTurk('[{"Title":"ALT (gr)","BuyRate":6600,"SellRate":6500}]').gold).toBeUndefined()
  })
})
