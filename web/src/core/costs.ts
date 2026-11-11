/**
 * Banka mı, fon mu? Aynı parayla altın ya da gümüş alıp bir süre sonra satmanın toplam maliyeti.
 *
 * Adımlar (sırayla): alış makası → alım vergisi (BSMV) → alış komisyonu → yönetim gideri (yıllık) →
 * satış makası → satış komisyonu → kazanç üzerinden stopaj. "Maliyet", hiç masraf olmasaydı elde
 * kalacak tutar ile gerçekte kalan tutar arasındaki farktır; her adımın payı ayrı raporlanır.
 *
 * Oranlar (Kasım 2026, bireysel yatırımcı):
 *   Banka kıymetli maden hesabı: alımda binde 2 BSMV (kambiyo); satış kazancında vergi yok.
 *   Altın/gümüş borsa yatırım fonu: kazançtan %17,5 stopaj (9 Temmuz 2025 ve sonrası alımlar).
 *   Darphane altın sertifikası: stopaj %0.
 *   Aracı kurum komisyonu üzerinden %5 BSMV.
 */
export const RATES = { bankBsmv: 0.002, fundTax: 0.175, certTax: 0, commissionBsmv: 0.05 }

export interface Route {
  id: string
  name: string
  kind: 'bank' | 'fund' | 'cert'
  /** Alırken orta fiyatın üstüne ödenen (oran) ve satarken altına razı olunan (oran) */
  buySpread: number
  sellSpread: number
  /** Alım tutarı üzerinden vergi (oran) */
  buyTax: number
  /** Aracı kurum komisyonu uygulanır mı */
  commission: boolean
  /** Yıllık yönetim gideri (oran) */
  annualFee: number
  /** Kazanç üzerinden stopaj (oran) */
  gainTax: number
  note?: string
}

export interface Scenario {
  /** Yatırılan tutar (TL) */
  amount: number
  years: number
  /** Madenin TL fiyatındaki yıllık artış beklentisi (oran) */
  annualGrowth: number
  /** Aracı kurum komisyonu, her işlemde (oran; BSMV hariç) */
  commission: number
}

export interface Outcome {
  route: Route
  /** Masrafsız dünyada elde kalacak tutar */
  ideal: number
  /** Gerçekte elde kalan tutar */
  net: number
  /** Toplam maliyet = ideal − net; ve yatırılan tutara oranı */
  cost: number
  costRate: number
  parts: { spread: number; buyTax: number; commission: number; fee: number; gainTax: number }
}

export function evaluate(route: Route, s: Scenario): Outcome {
  const growth = (1 + s.annualGrowth) ** s.years
  const c = route.commission ? s.commission * (1 + RATES.commissionBsmv) : 0
  const ideal = s.amount * growth
  let v = ideal
  const drop = (factor: number) => { const before = v; v *= factor; return before - v }
  const spreadBuy = drop(1 / (1 + route.buySpread))
  const buyTax = drop(1 / (1 + route.buyTax))
  const comBuy = drop(1 / (1 + c))
  const fee = drop((1 - route.annualFee) ** s.years)
  const spreadSell = drop(1 - route.sellSpread)
  const comSell = drop(1 - c)
  // Stopaj: satıştan ele geçen − yatırılan (alış ve satış masrafları matrahtan düşülmüş olur)
  const gainTax = route.gainTax * Math.max(0, v - s.amount)
  v -= gainTax
  return {
    route, ideal, net: v, cost: ideal - v, costRate: (ideal - v) / s.amount,
    parts: { spread: spreadBuy + spreadSell, buyTax, commission: comBuy + comSell, fee, gainTax },
  }
}

/** Banka fiyatından rota: makas bankanın kendi orta fiyatına göre */
export function bankRoute(id: string, name: string, q: { bid: number; ask: number }): Route {
  const mid = (q.bid + q.ask) / 2
  return { id, name, kind: 'bank', buySpread: q.ask / mid - 1, sellSpread: 1 - q.bid / mid, buyTax: RATES.bankBsmv, commission: false, annualFee: 0, gainTax: 0 }
}

export function fundRoute(id: string, name: string, annualFee: number, exchangeSpread: number, note?: string): Route {
  return { id, name, kind: 'fund', buySpread: exchangeSpread, sellSpread: exchangeSpread, buyTax: 0, commission: true, annualFee, gainTax: RATES.fundTax, note }
}

export function certRoute(id: string, name: string, exchangeSpread: number, note?: string): Route {
  return { id, name, kind: 'cert', buySpread: exchangeSpread, sellSpread: exchangeSpread, buyTax: 0, commission: true, annualFee: 0, gainTax: RATES.certTax, note }
}

/**
 * İki yolun eşitlendiği yıllık artış: bunun altında [a], üstünde [b] daha çok kazandırır (ya da tersi).
 * Aralıkta kesişme yoksa undefined.
 */
export function breakEven(a: Route, b: Route, s: Scenario, lo = -0.5, hi = 5): number | undefined {
  const diff = (g: number) => evaluate(a, { ...s, annualGrowth: g }).net - evaluate(b, { ...s, annualGrowth: g }).net
  let fl = diff(lo), fh = diff(hi)
  if (fl === 0) return lo
  if (fl * fh > 0) return undefined
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2, fm = diff(mid)
    if (fl * fm <= 0) { hi = mid; fh = fm } else { lo = mid; fl = fm }
  }
  return (lo + hi) / 2
}
