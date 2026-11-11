import { useEffect, useRef, useState } from 'react'
import * as Fmt from '../core/format'
import { historySource, snapshotMeta, type HistorySource } from '../data/history'
import { idbClear, idbStats } from '../data/idb'
import { actions, exportState, useApp, useLive } from '../data/store'
import { Icon } from '../ui/Icon'
import { Dialog, Segmented, Switch, useToast } from '../ui/overlay'

export function Settings() {
  const state = useApp()
  const live = useLive()
  const toast = useToast()
  const file = useRef<HTMLInputElement>(null)
  const [confirm, setConfirm] = useState<'list' | 'all' | null>(null)
  const [hist, setHist] = useState<{ src: HistorySource; generated?: number } | null>(null)
  const [cache, setCache] = useState<{ entries: number; bytes?: number } | null>(null)
  useEffect(() => { void idbStats().then(setCache) }, [])
  useEffect(() => {
    void historySource().then(async (src) => setHist({ src, generated: src === 'snapshot' ? (await snapshotMeta())?.generated : undefined }))
  }, [])

  const download = () => {
    const blob = new Blob([exportState()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `piyasa-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const upload = async (f: File) => {
    try {
      const r = actions.importState(JSON.parse(await f.text()))
      toast(r.ok ? `İçe aktarıldı: ${r.summary}` : r.error)
    } catch {
      toast('Dosya okunamadı. Geçerli bir .json dosyası seçin.')
    }
  }

  return (
    <div className="settings">
      <section>
        <h2>Görünüm</h2>
        <p>Tema, cihazının ayarını izleyebilir ya da sabit kalabilir.</p>
        <Segmented value={state.settings.theme} onChange={(theme) => actions.setSettings({ theme })}
          options={[{ value: 'system', label: 'Sistem' }, { value: 'light', label: 'Açık' }, { value: 'dark', label: 'Koyu' }]} label="Tema" />
        <div style={{ maxWidth: 520, marginTop: 10 }}>
          <Switch checked={state.settings.tickFlash} onChange={(tickFlash) => actions.setSettings({ tickFlash })}
            label="Değişen rakamları vurgula" hint="Fiyat değişince değişen rakamlar kısa süre yeşil ya da kırmızı yanar." />
        </div>
      </section>

      <section>
        <h2>Yenileme</h2>
        <p>Sayfa açıkken fiyatlar bu aralıkla yenilenir; sekme arka plandayken durur. BIST verisi TradingView’da 15 dakika gecikmelidir.</p>
        <Segmented value={state.settings.refreshSeconds} onChange={(refreshSeconds) => actions.setSettings({ refreshSeconds })}
          options={[{ value: 10, label: '10 sn' }, { value: 30, label: '30 sn' }, { value: 60, label: '1 dk' }, { value: 300, label: '5 dk' }, { value: 0, label: 'Elle' }]} label="Yenileme aralığı" />
        <p className="note" style={{ marginTop: 10 }}>{live.lastRefresh ? `Son yenileme ${Fmt.dateTime(live.lastRefresh)}` : 'Henüz yenilenmedi'}</p>
      </section>

      <section>
        <h2>Verilerin</h2>
        <p>Listen, formüllerin, dinamik listelerin ve panoların yalnızca bu tarayıcıda saklanır; hiçbir sunucuya gönderilmez. Başka bir cihaza taşımak ya da yedeklemek için dışa aktar.</p>
        <div className="row-actions">
          <button className="btn" onClick={download}><Icon name="download" />Dışa aktar</button>
          <button className="btn" onClick={() => file.current?.click()}><Icon name="upload" />İçe aktar</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
        </div>
        <p className="note">Android uygulamasının durum dosyası (piyasa_state.json) da içe aktarılabilir.</p>
      </section>

      <section>
        <h2>Fiyat geçmişi önbelleği</h2>
        <p>İndirilen fiyat geçmişi (dinamik listeler ve geçmişte test için) bu tarayıcıda saklanır; yalnızca kaynak yenilendiğinde yeniden indirilir ve çevrimdışıyken de kullanılır.</p>
        <p className="note" style={{ marginTop: -6 }}>
          {cache == null ? 'Denetleniyor…' : cache.entries ? `${cache.entries} kayıt${cache.bytes ? `, bu site toplam ${Fmt.number(cache.bytes / 1e6, 1)} MB kullanıyor` : ''}` : 'Henüz saklanan geçmiş yok.'}
        </p>
        <button className="btn" disabled={!cache?.entries} onClick={async () => { await idbClear(); setCache(await idbStats()); toast('Fiyat geçmişi önbelleği temizlendi') }}>Önbelleği temizle</button>
      </section>

      <section>
        <h2>Sıfırla</h2>
        <p>Hazır liste: döviz, altın ve gümüş, BIST, ABD endeksleri, Bitcoin, enflasyon ve faiz; gram ve çeyrek altın, sertifika primi, BIST ($), reel faiz gibi hesaplamalar.</p>
        <div className="row-actions">
          <button className="btn" onClick={() => setConfirm('list')}>Hazır listeye dön</button>
          <button className="btn danger" onClick={() => setConfirm('all')}>Her şeyi sıfırla</button>
        </div>
      </section>

      <section>
        <h2>Veri kaynakları</h2>
        <dl className="kv">
          <dt>Fiyatlar ve taramalar</dt><dd>TradingView (tarayıcıdan doğrudan; hisse, endeks, fon, sertifika, döviz, emtia, kripto, ekonomik göstergeler)</dd>
          <dt>5 yıllık fiyat geçmişi</dt>
          <dd>{!hist ? 'Denetleniyor…' : hist.src === 'proxy' ? 'Yahoo Finance, bu sunucu üzerinden canlı'
            : hist.src === 'snapshot' ? `Yahoo Finance, günlük güncellenen kopya${hist.generated ? ` (${Fmt.dateTime(hist.generated)})` : ''}`
              : 'Bu yayında yok; 5 yıllık dip/zirve ve ortalama F/K koşulları çalışmaz'}</dd>
          <dt>Grafikler</dt><dd>TradingView gömülü grafik</dd>
        </dl>
        <p className="note">Piyasa yatırım tavsiyesi vermez. Veriler gecikmeli ya da hatalı olabilir; işlem yapmadan önce aracı kurumunuzdan doğrulayın.</p>
      </section>

      <section style={{ borderBottom: 0 }}>
        <h2>Klavye</h2>
        <dl className="kv">
          <dt><kbd>/</kbd> ya da <kbd>Ctrl</kbd> <kbd>K</kbd></dt><dd>Ara ya da formül yaz</dd>
          <dt><kbd>R</kbd></dt><dd>Fiyatları yenile</dd>
          <dt><kbd>1</kbd>–<kbd>5</kbd></dt><dd>Piyasalar, Panolar, Dinamik listeler, Sözlük, Ayarlar</dd>
          <dt><kbd>Esc</kbd></dt><dd>Paneli ya da pencereyi kapat</dd>
        </dl>
      </section>

      {confirm && (
        <Dialog size="small" title={confirm === 'list' ? 'Hazır listeye dönülsün mü?' : 'Her şey sıfırlansın mı?'} onClose={() => setConfirm(null)}
          footer={<>
            <button className="btn ghost" onClick={() => setConfirm(null)}>Vazgeç</button>
            <button className="btn primary" onClick={() => {
              if (confirm === 'list') actions.resetList()
              else actions.resetAll()
              setConfirm(null)
              toast(confirm === 'list' ? 'Hazır listeye dönüldü' : 'Sıfırlandı')
            }}>{confirm === 'list' ? 'Hazır listeye dön' : 'Sıfırla'}</button>
          </>}>
          <div className="dialog-body">
            <p style={{ margin: 0 }}>
              {confirm === 'list'
                ? `Sembollerin ve formüllerin hazır listeyle değiştirilir (${state.instruments.length} sembol, ${state.formulas.length} formül). Dinamik listelerin ve panoların korunur; silinen hazır listeler geri gelir.`
                : 'Listen, formüllerin, dinamik listelerin, panoların ve ayarların ilk kurulumdaki haline döner. Önce dışa aktarmak isteyebilirsin.'}
            </p>
          </div>
        </Dialog>
      )}
    </div>
  )
}
