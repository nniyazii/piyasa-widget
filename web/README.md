# Piyasa — web sürümü

Android widget uygulamasının tarayıcı sürümü: aynı formül dili, aynı hazır liste, aynı 15 dinamik liste.
Kurulum istemez; veriler (listen, formüllerin, panoların) yalnızca tarayıcında saklanır.

**Canlı:** https://nniyazii.github.io/piyasa-widget/

![liste ve ayrıntı](../docs/web-liste.png)

## Neler var

- **Piyasalar.** Döviz, altın, BIST, ABD, kripto ve ekonomik göstergeler; formüller ("Hesaplamalar") en üstte.
  - Sayfa açıkken fiyatlar 10 saniye ile 5 dakika arasında seçilen aralıkla yenilenir; sekme arka plandayken durur.
  - Fiyat değişince yalnızca değişen rakamlar kısa süre yeşil ya da kırmızı yanar.
  - Satırdaki ince çizgi gün içi aralıktır: düşük–yüksek, dikey işaret açılış, nokta güncel fiyat.
  - Gruplar içinde sürükle-bırakla sıralanır (telefonda basılı tut, klavyede Boşluk). Sağ tıkla diğer işlemler açılır.
- **Ayrıntı.** Büyük fiyat, gün içi aralık, önceki kapanış ve açılış; TradingView grafiği.
  - Formüllerde girdilerin tek tek değeri gösterilir. Grafik, formülün TradingView karşılığıdır (`OANDA:XAUUSD*FX:USDTRY/31.1034768`).
- **Ara ya da hesapla** (`/` ya da `Ctrl K`). Tek kutu: kelime yazarsan sembol arar, işlem yazarsan formüle geçer.
  - `ons*dolar/oz` gram altını anında hesaplar; Enter ile ad ve birim önerilerek kaydedilir.
  - `ALTIN.S1`, `gmstr.f`, `trhpi`, `BIST:THYAO` gibi kodlar da bulunur.
- **Panolar.** Android'deki widget'ların karşılığı: göstergeleri, bölüm başlıklarını ve dinamik listeleri bir kartta topla.
  - Kartlar başlığından sürüklenerek sıralanır. Satır aralığı, yazı boyutu ve değişim biçimi ayarlanır.
  - Bir pano **tam ekran** açılır (ekran panosu; ekran kararmaz).
- **Dinamik listeler.** Koşullu taramalar: "F/K’sı 5 yıllık ortalamasının yarısına inenler", "USD cinsinden 5 yıllık dibe yakın BIST" ve 13 tane daha.
  - Düzenleyicide yazarken canlı önizleme gösterilir.
  - Liste tek tıkla panoya eklenir.
- **Ayarlar.** Tema (sistem/açık/koyu), yenileme aralığı, dışa/içe aktarma (Android'in durum dosyası dahil), sıfırlama.
- **Kurulabilir (PWA).** Tarayıcıdan "Ana ekrana ekle" ile uygulama gibi açılır; uygulama kabuğu çevrimdışı da açılır.

| Panolar | Ara ya da hesapla |
|---|---|
| ![panolar](../docs/web-panolar.png) | ![formül](../docs/web-formul.png) |

| Dinamik liste | Koyu tema |
|---|---|
| ![tarama](../docs/web-tarama.png) | ![koyu](../docs/web-koyu.png) |

| Telefon | Telefonda panolar |
|---|---|
| ![telefon](../docs/web-telefon.png) | ![telefonda panolar](../docs/web-telefon-pano.png) |

## Veri nereden geliyor

| Ne | Kaynak | Not |
|---|---|---|
| Fiyatlar, arama, taramalar | TradingView tarayıcı servisi | Tarayıcıdan doğrudan (CORS açık), anahtar gerekmez. BIST ~15 dk gecikmeli. |
| 5 yıllık dip/zirve, 5 yıllık ortalama F/K | Yahoo Finance aylık çubuklar | Yahoo tarayıcıya kapalı. Sunucuyla çalışırken `/api` vekili canlı çeker; GitHub Pages'te her iş günü üretilen `data/history/*.json` kopyası kullanılır. |
| Grafikler | TradingView gömülü grafik | |

Yahoo aylık çubukları borsanın yerel gece yarısında damgalar (BIST için önceki gün 21:00 UTC). Zaman ayın başına çekilir; aksi halde USD çevriminde ve ortalama F/K'da bir ay kayardı. Android'de de düzeltildi.

## Çalıştırma

```bash
cd web
npm ci
npm run dev          # http://localhost:5173 (Yahoo vekili dahil)
npm test             # birim testleri
npm run build        # dist/
npm start            # dist/ + /api vekili, http://localhost:8080
```

Docker:

```bash
docker build -t piyasa-web web
docker run -p 8080:8080 piyasa-web
```

Uçtan uca test (gerçek tarayıcı, gerçek veri; Playwright gerekir):

```bash
npm run build && npx vite preview --port 4173 &
node scripts/e2e.mjs
```

Canlı veri testleri: `LIVE=1 npx vitest run src/data/live.test.ts`.

## Yayın

`.github/workflows/web.yml` her `web/` değişikliğinde ve her iş günü 18:41'de (TSİ):

1. Testleri çalıştırır ve derler (`VITE_HISTORY=snapshot`).
2. Yahoo'dan aylık geçmiş kopyasını üretir: tüm BIST hisseleri ve piyasa değeri 10 milyar $ üstü ABD hisseleri.
3. `gh-pages` dalına yayınlar.

Pages, `gh-pages` dalından yayınlanır (bu depoda açık). Başka bir depoya kopyalarsanız: **Settings → Pages → Source: Deploy from a branch, `gh-pages` / root**.

Yahoo, GitHub'ın sunucularını sık sık sınırlar. Betik 9 dakikalık bir süre bütçesiyle çalışır ve çekemediği sembollerin geçmişini `gh-pages` dalındaki önceki kopyadan korur.
Aylık çubuklarda birkaç günlük eskilik sonucu pek etkilemez; güncel fiyat her zaman TradingView'dan canlı gelir.

Statik barındırmada geçmiş kopyası olmadan da çalışır. O durumda yalnızca 5 yıllık geçmiş isteyen koşullar "bu yayında geçmiş verisi yok" der.

## Yapı

```
web/
  src/core/       Formül dili, katalog, biçimler, TradingView çevirisi, tarama motoru (saf TypeScript, testli)
  src/data/       TradingView istemcisi, geçmiş sağlayıcı, tarama kaynağı, durum deposu
  src/ui/         Simgeler, menü/pencere/bildirim, yönlendirme, fiyat bileşenleri
  src/screens/    Piyasalar, Ayrıntı, Ara/Hesapla, Panolar, Dinamik listeler, Ayarlar
  server/api.mjs  /api/health, /api/yahoo/chart/:sembol (bağımlılıksız, önbellekli)
  server.mjs      Üretim sunucusu (statik + /api)
  scripts/        snapshot.mjs (geçmiş kopyası), e2e.mjs (uçtan uca test)
```

Tasarım: tek yazı ailesi (Archivo, değişken genişlik; rakamlar dar ve tablo hizalı). Serin kâğıt zemin ve ince çizgiler kullanılır.
Renk yalnızca anlam taşır: yeşil yükseliş, kırmızı düşüş, pirinç hesaplama (formül).

Piyasa yatırım tavsiyesi vermez.
