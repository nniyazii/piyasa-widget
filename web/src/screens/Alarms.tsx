/**
 * Alarmlar: tek yerden kurulan uyarılar (fiyat, olay, görünüm, avantajlı fiyat, güçlü kurulum).
 *   #/alarmlar                                  liste ve yeni alarm
 *   #/alarmlar?tur=sinyal&s=SEMBOL              hazır doldurulmuş (diğer sayfalardaki "haber ver" bağlantıları)
 *   #/alarmlar?tur=olay&s=GOLD&e=rsi-30&tf=W    grafik tezgâhından: bu olay olunca haber ver
 */
import { useEffect, useState } from 'react'
import { ADVICE_TARGETS, describe, OUTLOOK_NAMES, PRODUCT_TARGETS, TYPE_LABEL, type Alarm, type AlarmState } from '../core/alarms'
import { macroEventDefs } from '../core/macroEvents'
import type { World } from '../core/macro'
import { customEvent, eventDefs, GROUP_LABEL, TF_LABEL, type EventGroup, type Tf } from '../core/study'
import { assetInfo, isStock, MACRO_ASSETS, marketOfSubject } from '../core/subject'
import { useCustomEvents } from '../data/custom'
import { loadWorld } from '../data/macro'
import type { SearchHit } from '../core/catalog'
import * as Fmt from '../core/format'
import { alarmActions, askNotifyPermission, getToken, loadServerState, notifyPermission, REPO, runAlarmCheck, setToken, syncAlarms, useAlarms, type LogEntry } from '../data/alarms'
import { useApp } from '../data/store'
import { scan, search } from '../data/tv'
import { Icon } from '../ui/Icon'
import { Segmented, useToast } from '../ui/overlay'
import { href } from '../ui/router'

type Kind = Alarm['type']
const KIND_OF: Record<string, Kind> = { fiyat: 'price', avantaj: 'premium', sinyal: 'signal', gorunum: 'outlook', olay: 'event' }
const asTf = (v: string | null): Tf => (v === 'M' || v === 'D' ? v : 'W')
const price = (v: number) => Fmt.number(v, v >= 1000 ? 0 : v >= 10 ? 2 : 4)

export function Alarms({ query }: { query: URLSearchParams }) {
  const s = useAlarms()
  useEffect(() => { void syncAlarms(); void loadServerState(); void runAlarmCheck() }, [])
  const waiting = s.alarms.filter((a) => !s.states[a.id]?.done).length
  const log = mergeLog(s.log, s.server?.log ?? [])
  return (
    <div className="an al">
      <header className="an-head">
        <h2>Ne olunca haber vereyim?</h2>
        <p className="an-answer" aria-live="polite">{s.alarms.length === 0 ? 'Henüz alarm yok.' : waiting === 0 ? 'Bekleyen alarm yok; hepsi çaldı.' : `${waiting} alarm bekliyor.`}</p>
      </header>

      <Composer initialKind={KIND_OF[query.get('tur') ?? ''] ?? 'price'} initialSymbol={query.get('s') ?? undefined} initialEvent={query.get('e') ?? undefined} initialTf={asTf(query.get('tf'))} initialUsd={query.get('usd') === '1'} />

      {s.alarms.length > 0 && (
        <section className="an-group">
          <h3>Alarmlar</h3>
          <ul className="al-list">
            {s.alarms.map((a) => <AlarmRow key={a.id} alarm={a} state={s.states[a.id]} server={s.server?.states[a.id]} />)}
          </ul>
        </section>
      )}

      <Delivery />

      {log.length > 0 && (
        <section className="an-group">
          <h3>Son bildirimler</h3>
          <ul className="al-log">
            {log.slice(0, 12).map((l, i) => <li key={i}><time>{Fmt.dateTime(l.t)}</time><b>{l.title}</b><span>{l.text}</span></li>)}
          </ul>
        </section>
      )}

      <details className="an-how">
        <summary>Nasıl çalışıyor, nelere dikkat etmeli</summary>
        <ul>
          <li>Alarm, koşul sağlanmıyorken sağlanır hâle geldiğinde <b>bir kez</b> çalar. Koşul bozulup yeniden sağlanırsa yeniden çalar. Fiyat alarmları bir kez çalıp kapanır; listeden yeniden kurabilirsin.</li>
          <li><b>Fiyat</b>: TradingView’in son fiyatı. BIST fiyatları 15 dakika gecikmelidir.</li>
          <li><b>Avantajlı fiyat</b>: Analiz bölümündeki “al sinyali” ve güçlü önerilerle aynı hesap. Ürün sinyalleri yalnızca BIST seansı içinde sayılır.</li>
          <li><b>Görünüm</b>: Analiz bölümünün açılış sayfasındaki birleştirilmiş görüş (değerleme, makro örüntü, benzer dönemler, trend) seçtiğin yöne döndüğünde çalar. Görüşler aylık veriye dayandığı için seyrek değişir.</li>
          <li><b>Olay</b>: grafik tezgâhındaki olaylardan biri (sert düşüş, ortalamanın kırılması, RSI’ın 30’un altına inmesi, hacimli satış, kendi tanımladığın olay…) seçtiğin varlıkta ve zaman diliminde gerçekleştiğinde çalar. Bildirimde olayın geçmişte kaç kez olduğu ve sonrasındaki yön olasılıkları yazar. Son mum kapanmadan gerçekleşen olay, mum kapanırken geri dönebilir.</li>
          <li><b>Güçlü kurulum</b>: Analiz › Hisse sayfasındaki güçlü kurulumlardan biri oluştuğunda çalar (pazar genelinde üç ayrı dönemde sınanmış kurulumlar; şu an yalnızca ABD hisselerinde ve dip tarafında var). Bildirimde kurulum ve geçmişteki isabeti yazar.</li>
          <li>Uygulama açıkken kontrol dakikada bir yapılır. Kapalıyken GitHub 10 dakikada bir kontrol eder; GitHub’ın zamanlayıcısı yoğun saatlerde 5–20 dakika gecikebilir, bu yüzden bildirim anlık değildir.</li>
          <li>Alarmlar yatırım tavsiyesi değildir; yalnızca belirlediğin koşul gerçekleştiğinde haber verir.</li>
        </ul>
      </details>
    </div>
  )
}

/** Yerel ve sunucu kayıtlarını birleştirir (aynı bildirim iki kez görünmesin) */
function mergeLog(a: LogEntry[], b: LogEntry[]): LogEntry[] {
  const out: LogEntry[] = []
  for (const l of [...a, ...b].sort((x, y) => y.t - x.t)) if (!out.some((o) => o.title === l.title && Math.abs(o.t - l.t) < 30 * 60_000)) out.push(l)
  return out
}

// ------------------------------------------------------------------ yeni alarm

function Composer({ initialKind, initialSymbol, initialEvent, initialTf, initialUsd }: { initialKind: Kind; initialSymbol?: string; initialEvent?: string; initialTf: Tf; initialUsd: boolean }) {
  const custom = useCustomEvents()
  const [world, setWorld] = useState<World | undefined>()
  useEffect(() => { void loadWorld().then(setWorld) }, [])
  const [macroAsset, setMacroAsset] = useState<string>(initialSymbol && assetInfo(initialSymbol.toUpperCase()) ? initialSymbol.toUpperCase() : initialSymbol && isStock(initialSymbol) ? 'stock' : 'GOLD')
  const [tf, setTf] = useState<Tf>(initialTf)
  const [eventId, setEventId] = useState(initialEvent ?? 'rsi-30')
  const [usd, setUsd] = useState(initialUsd)
  useEffect(() => { if (initialKind !== 'event') return; setTf(initialTf); setUsd(initialUsd); if (initialEvent) setEventId(initialEvent); if (initialSymbol) setMacroAsset(assetInfo(initialSymbol.toUpperCase()) ? initialSymbol.toUpperCase() : 'stock') }, [initialKind, initialSymbol, initialEvent, initialTf, initialUsd])
  const toast = useToast()
  const [kind, setKind] = useState<Kind>(initialKind)
  const [symbol, setSymbol] = useState<string | undefined>(initialSymbol?.toUpperCase())
  const [op, setOp] = useState<'below' | 'above'>('below')
  const [value, setValue] = useState('')
  const [target, setTarget] = useState('any')
  const [side, setSide] = useState<'dip' | 'top' | 'both'>('both')
  const [asset, setAsset] = useState(initialSymbol && initialSymbol.toUpperCase() in OUTLOOK_NAMES ? initialSymbol.toUpperCase() : 'GOLD')
  const [to, setTo] = useState<'up' | 'down'>('up')
  const [now, setNow] = useState<number | undefined>()
  useEffect(() => { setKind(initialKind); if (initialSymbol) { const u = initialSymbol.toUpperCase(); if (initialKind === 'outlook') { if (u in OUTLOOK_NAMES) setAsset(u) } else if (isStock(u) || initialKind !== 'event') setSymbol(u) } }, [initialKind, initialSymbol])
  useEffect(() => {
    setNow(undefined)
    if (!symbol) return
    let alive = true
    scan('global', { symbols: { tickers: [symbol] }, columns: ['close'] }).then((r) => { if (alive && typeof r[0]?.d[0] === 'number') setNow(r[0].d[0] as number) }).catch(() => { /* fiyat gösterilemez */ })
    return () => { alive = false }
  }, [symbol])
  const v = Fmt.parseInput(value)
  const subject = macroAsset === 'stock' ? symbol : macroAsset
  const defs = [...eventDefs(tf), ...(tf === 'M' && world && macroAsset !== 'stock' ? macroEventDefs(world, assetInfo(macroAsset)?.group ?? 'global') : []), ...custom.map(customEvent)]
  const def = defs.find((d) => d.id === eventId)
  const ready = kind === 'premium' || kind === 'outlook' || (kind === 'event' ? !!subject && !!def : symbol && (kind === 'signal' || (v != null && v > 0)))
  // Fiyat zaten o taraftaysa alarm kurulur kurulmaz çalar: önceden söyle
  const already = kind === 'price' && now != null && v != null && (op === 'below' ? now <= v : now >= v)
  const add = () => {
    if (!ready) return
    const a = kind === 'price' ? alarmActions.add({ type: 'price', symbol: symbol!, op, value: v! })
      : kind === 'premium' ? alarmActions.add({ type: 'premium', target })
        : kind === 'outlook' ? alarmActions.add({ type: 'outlook', asset, to })
          : kind === 'event' ? alarmActions.add({ type: 'event', subject: subject!, tf, event: def!.id, label: def!.label, ...(def!.group === 'özel' ? { custom: custom.find((c) => 'c:' + c.id === def!.id) } : {}), ...(usd && macroAsset === 'stock' && marketOfSubject(subject!) === 'TR' ? { usd: true } : {}) })
            : alarmActions.add({ type: 'signal', symbol: symbol!, side })
    toast('Alarm kuruldu: ' + describe(a))
    setValue('')
    if (notifyPermission() === 'default') void askNotifyPermission()
  }
  return (
    <section className="al-new" aria-label="Yeni alarm">
      <Segmented value={kind} onChange={setKind} label="Alarm türü" options={[{ value: 'price', label: TYPE_LABEL.price }, { value: 'event', label: TYPE_LABEL.event }, { value: 'outlook', label: TYPE_LABEL.outlook }, { value: 'premium', label: TYPE_LABEL.premium }, { value: 'signal', label: TYPE_LABEL.signal }]} />
      {kind !== 'premium' && kind !== 'outlook' && (kind !== 'event' || macroAsset === 'stock') && <SymbolField value={symbol} onChange={setSymbol} />}
      <p className="cost-say al-say">
        {kind === 'price' && (
          <>
            <b>{symbol ? Fmt.ticker(symbol) : 'Seçtiğim sembol'}</b>{' '}
            <input className="w-amount" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={now != null ? price(now) : 'fiyat'} aria-label="Fiyat düzeyi" onKeyDown={(e) => { if (e.key === 'Enter') add() }} />{' '}
            <select value={op} onChange={(e) => setOp(e.target.value as 'below' | 'above')} aria-label="Yön"><option value="below">altına inerse</option><option value="above">üstüne çıkarsa</option></select> haber ver.
          </>
        )}
        {kind === 'premium' && (
          <>
            <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Neyi izleyeyim">
              <optgroup label="Değerinin altına inerse">
                <option value="any">Altın ya da gümüş ürünlerinden biri</option>
                {PRODUCT_TARGETS.map((c) => <option key={c} value={c}>{c}</option>)}
              </optgroup>
              <optgroup label="Güçlü sinyal verirse">
                {ADVICE_TARGETS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </optgroup>
            </select>{' '}
            {target === 'any' || PRODUCT_TARGETS.includes(target) ? 'değerinin altına inerse' : 'güçlü sinyal verirse'} haber ver.
          </>
        )}
        {kind === 'outlook' && (
          <>
            <select value={asset} onChange={(e) => setAsset(e.target.value)} aria-label="Varlık">{Object.entries(OUTLOOK_NAMES).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>{' '}
            görünümü <select value={to} onChange={(e) => setTo(e.target.value as 'up' | 'down')} aria-label="Yön"><option value="up">olumluya</option><option value="down">olumsuza</option></select> dönerse haber ver.
          </>
        )}
        {kind === 'event' && (
          <>
            <select value={macroAsset} onChange={(e) => setMacroAsset(e.target.value)} aria-label="Varlık">
              {MACRO_ASSETS.map((a) => <option key={a.id} value={a.id}>{a.short}</option>)}
              <option value="stock">{symbol && isStock(symbol) ? Fmt.ticker(symbol) + ' (hisse)' : 'Bir hisse…'}</option>
            </select>{' '}
            <select value={tf} onChange={(e) => setTf(e.target.value as Tf)} aria-label="Zaman dilimi">{(['M', 'W', 'D'] as Tf[]).map((t) => <option key={t} value={t}>{TF_LABEL[t].toLocaleLowerCase('tr')}</option>)}</select> veride{' '}
            <select value={def?.id ?? ''} onChange={(e) => setEventId(e.target.value)} aria-label="Olay">
              {!def && <option value="">olay seç</option>}
              {(Object.keys(GROUP_LABEL) as EventGroup[]).map((g) => defs.some((d) => d.group === g) && <optgroup key={g} label={GROUP_LABEL[g]}>{defs.filter((d) => d.group === g).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</optgroup>)}
            </select>{' '}
            olayı gerçekleşirse haber ver.
            {macroAsset === 'stock' && symbol && marketOfSubject(symbol) === 'TR' && <label className="wb-check"> <input type="checkbox" checked={usd} onChange={(e) => setUsd(e.target.checked)} /> dolar bazında</label>}
          </>
        )}
        {kind === 'signal' && (
          <>
            <b>{symbol ? Fmt.ticker(symbol) : 'Seçtiğim hisse'}</b> için{' '}
            <select value={side} onChange={(e) => setSide(e.target.value as 'dip' | 'top' | 'both')} aria-label="Yön"><option value="both">dip ya da tepe</option><option value="dip">dip</option><option value="top">tepe</option></select> kurulumu oluşursa haber ver.
          </>
        )}
      </p>
      <div className="al-go">
        <button className="btn primary" onClick={add} disabled={!ready}><Icon name="bell" />Alarm kur</button>
        <span className="note">
          {kind === 'price' && symbol && now != null && <>Şu an {price(now)}. {already ? 'Fiyat zaten bu düzeyin ötesinde; alarm hemen çalar.' : ''}</>}
          {kind === 'signal' && symbol && <a href={href('analiz/hisse/' + symbol)}>{Fmt.ticker(symbol)} için kurulumları gör</a>}
          {kind === 'event' && subject && def && <a href={isStock(subject) ? href('analiz/hisse/' + subject, { e: def.id, tf }) : href('analiz', { v: subject, e: def.id, tf })}>Bu olayın geçmişini grafikte gör</a>}
          {kind === 'event' && <> Kendi olayını grafik tezgâhında “Kendi olayını tanımla” ile ekleyebilirsin.</>}
          {kind === 'premium' && <a href={href('analiz/urunler')}>Şu anki durumu gör</a>}
          {kind === 'outlook' && <a href={href('analiz')}>Şu anki görünümü gör</a>}
        </span>
      </div>
    </section>
  )
}

function SymbolField({ value, onChange }: { value?: string; onChange: (s: string) => void }) {
  const app = useApp()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[] | undefined>()
  useEffect(() => {
    if (q.trim().length < 2) { setHits(undefined); return }
    const ac = new AbortController()
    const id = setTimeout(() => { search(q, ac.signal).then(setHits).catch(() => { /* iptal */ }) }, 250)
    return () => { clearTimeout(id); ac.abort() }
  }, [q])
  const pick = (s: string) => { setQ(''); setHits(undefined); onChange(s.toUpperCase()) }
  const quick = app.instruments.filter((i) => i.symbol !== value && !i.symbol.startsWith('ECONOMICS:')).slice(0, 6)
  return (
    <div className="st-pick">
      <label className="st-search">
        <span className="sr-only">Sembol ara</span>
        <input className="input" type="search" value={q} placeholder={value ? `${Fmt.ticker(value)} seçili; değiştirmek için ara` : 'Sembol ara: SNDK, THYAO, altın, dolar…'}
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && hits?.[0]) pick(hits[0].symbol); if (e.key === 'Escape') setQ('') }} autoComplete="off" spellCheck={false} />
      </label>
      {hits && (
        <ul className="st-hits" role="listbox" aria-label="Arama sonuçları">
          {hits.length === 0 && <li className="none">Sonuç yok</li>}
          {hits.slice(0, 8).map((h) => <li key={h.symbol}><button type="button" onClick={() => pick(h.symbol)}><b>{h.ticker}</b><span>{h.name}</span><em>{h.exchange}</em></button></li>)}
        </ul>
      )}
      {!hits && quick.length > 0 && <p className="st-quick">{quick.map((i) => <button key={i.key} type="button" onClick={() => pick(i.symbol)}>{i.name}</button>)}</p>}
    </div>
  )
}

// ------------------------------------------------------------------ liste

function AlarmRow({ alarm, state, server }: { alarm: Alarm; state?: AlarmState; server?: AlarmState }) {
  // Çalma bilgisi hangisi yeniyse ondan (uygulama ya da sunucu)
  const fired = Math.max(state?.firedAt ?? 0, server?.firedAt ?? 0) || undefined
  const done = state?.done || server?.done
  const on = state?.on ?? server?.on
  const status = done ? 'Çaldı' : on ? 'Koşul sağlanıyor' : 'Bekliyor'
  const now = state?.now ?? server?.now
  return (
    <li className={'al-row' + (done ? ' done' : on ? ' on' : '')}>
      <div>
        <span className="kind">{TYPE_LABEL[alarm.type]}</span>
        <b>{describe(alarm)}</b>
        <span className="s">
          {state?.error ? `Kontrol edilemedi: ${state.error}.` : now ? `Şu an: ${now}.` : 'İlk kontrol bekleniyor.'}
          {fired ? ` Son çalma: ${Fmt.dateTime(fired)}.` : ''}
        </span>
      </div>
      <span className={'prem-st' + (done ? '' : on ? ' buy' : '')}>{status}</span>
      <span className="al-act">
        {done && <button className="btn ghost small" onClick={() => alarmActions.rearm(alarm.id)}>Yeniden kur</button>}
        <button className="icon-btn" onClick={() => alarmActions.remove(alarm.id)} aria-label={`Sil: ${describe(alarm)}`}><Icon name="trash" /></button>
      </span>
    </li>
  )
}

// ------------------------------------------------------------------ bildirim kanalları

function Delivery() {
  const s = useAlarms()
  const toast = useToast()
  const [token, setTok] = useState('')
  const [busy, setBusy] = useState(false)
  const perm = notifyPermission()
  const linked = !!getToken()
  const connect = async () => {
    setBusy(true)
    await setToken(token)
    setBusy(false)
    setTok('')
    void loadServerState()
  }
  useEffect(() => { if (s.sync === 'ok' && busy) toast('Bağlandı: alarmlar artık uygulama kapalıyken de kontrol edilecek') }, [s.sync])
  return (
    <section className="an-group">
      <h3>Bildirim nereye gelir</h3>
      <div className="al-ch">
        <div>
          <b>Uygulama açıkken</b>
          <p>Ekranda ve tarayıcı bildirimi olarak. {perm === 'granted' ? 'Tarayıcı bildirimi açık.' : perm === 'denied' ? 'Tarayıcı bildirimi engellenmiş; tarayıcının site ayarlarından izin verebilirsin.' : perm === 'unsupported' ? 'Bu tarayıcı bildirim göstermiyor.' : ''}</p>
        </div>
        {perm === 'default' && <button className="btn small" onClick={() => void askNotifyPermission()}>Bildirime izin ver</button>}
        {perm === 'granted' && <span className="prem-st buy">Açık</span>}
      </div>
      <div className="al-ch">
        <div>
          <b>Uygulama kapalıyken: e-posta ve telefon bildirimi</b>
          {linked ? (
            <p>
              {s.sync === 'error' ? <span style={{ color: 'var(--down)' }}>{s.syncError}. </span> : 'Alarmların GitHub’da saklanıyor ve 10 dakikada bir kontrol ediliyor. '}
              Çalan alarm GitHub hesabının e-posta adresine gelir; telefonda GitHub uygulaması kuruluysa bildirim olarak da düşer.
              {s.server ? ` Sunucunun son kontrolü: ${Fmt.dateTime(s.server.checked)}.` : ' Sunucu henüz kontrol etmedi; ilk kontrol birkaç dakika içinde yapılır.'}
            </p>
          ) : (
            <>
              <p>Alarmların şu an yalnızca bu cihazda duruyor; uygulama kapalıyken kontrol edilmez. Bir kez GitHub anahtarı bağlarsan alarmlar GitHub’da saklanır, 10 dakikada bir kontrol edilir ve çalan alarm e-posta olarak gelir.</p>
              <details className="al-steps">
                <summary>Anahtar nasıl alınır (2 dakika)</summary>
                <ol>
                  <li><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">GitHub’da yeni anahtar sayfasını</a> aç.</li>
                  <li>Ad olarak “Piyasa alarmları” yaz; süreyi istediğin kadar uzun seç.</li>
                  <li>“Repository access” altında “Only select repositories” seç ve <b>{REPO.split('/')[1]}</b> deposunu işaretle.</li>
                  <li>“Permissions › Repository permissions” altında <b>Contents</b> iznini “Read and write” yap. Başka izin gerekmez.</li>
                  <li>“Generate token” ile oluştur, çıkan anahtarı kopyalayıp aşağıya yapıştır.</li>
                </ol>
                <p>Anahtar yalnızca bu tarayıcıda saklanır ve yalnızca GitHub’a gönderilir. Yalnızca bu depoya yazabilir. Depo herkese açık olduğu için alarm listen de (semboller ve düzeyler) herkese açık olur; e-posta adresin hiçbir yere yazılmaz.</p>
              </details>
              <p className="al-token">
                <input className="input" type="password" value={token} onChange={(e) => setTok(e.target.value)} placeholder="github_pat_…" aria-label="GitHub anahtarı" autoComplete="off" />
                <button className="btn small" onClick={() => void connect()} disabled={busy || token.trim().length < 20}>{busy ? 'Bağlanıyor…' : 'Bağla'}</button>
              </p>
              {s.sync === 'error' && <p className="note" style={{ color: 'var(--down)' }}>{s.syncError}</p>}
            </>
          )}
        </div>
        {linked && (
          <span className="al-act">
            <span className={'prem-st' + (s.sync === 'ok' ? ' buy' : '')}>{s.sync === 'ok' ? 'Bağlı' : s.sync === 'syncing' ? 'Eşitleniyor' : 'Hata'}</span>
            <button className="btn ghost small" onClick={() => void setToken('')}>Bağlantıyı kes</button>
          </span>
        )}
      </div>
      {linked && (
        <details className="an-how">
          <summary>E-posta gelmiyorsa ya da daha hızlı bildirim istersen</summary>
          <ul>
            <li>E-postayı GitHub gönderir: çalan her alarm için depoda “Alarm: …” başlıklı bir kayıt açılır. <a href={`https://github.com/${REPO}/subscription`} target="_blank" rel="noreferrer">Depo bildirim ayarında</a> “All Activity” ya da en azından “Issues” seçili olmalı; <a href="https://github.com/settings/notifications" target="_blank" rel="noreferrer">hesap bildirim ayarlarında</a> e-posta açık olmalı.</li>
            <li>Telefona bildirim için GitHub’ın mobil uygulamasını kurup aynı hesapla giriş yapman yeterli.</li>
            <li>İstersen ntfy uygulamasıyla da anlık bildirim alabilirsin: ntfy’de tahmin edilmesi zor bir konu adına abone ol, aynı adı deponun “Settings › Secrets and variables › Actions” bölümüne <b>NTFY_TOPIC</b> adıyla ekle.</li>
            <li>Geçmiş kayıtlar: <a href={`https://github.com/${REPO}/issues?q=is%3Aissue+Alarm`} target="_blank" rel="noreferrer">GitHub’daki alarm kayıtları</a>.</li>
          </ul>
        </details>
      )}
    </section>
  )
}
