# Piyasa — Android piyasa widget'ı

Ana ekranda **şık ve kompakt** bir widget ile:

- **Amerika piyasaları**: S&P 500, Nasdaq, Dow Jones, Russell, VIX, ABD 10Y faizi, büyük teknoloji hisseleri
- **Türkiye piyasaları**: BIST 100 / 30 / Banka ve BIST hisseleri
- **Emtia (spot)**: ons altın, gümüş, platin, paladyum, bakır; Brent, WTI ve doğalgaz (vadeli)
- **Döviz**: USD/TRY, EUR/TRY, GBP/TRY, CHF/TRY, EUR/USD, DXY, TCMB gösterge kurları
- **Formüller**: göstergeleri birleştiren hesaplar, örneğin `GRAM_ALTIN = ONS * USDTRY / OZ`

Uygulamanın kendi ekranı yalnızca ayar içindir. Veriler widget'ta gösterilir.

| Liste (4×2, 2×2) | Bant (4×1) |
|---|---|
| ![liste](docs/widget-liste.png) | ![bant](docs/widget-bant.png) |

| Geniş, çift sütun (5×3) | Alt satırda formül |
|---|---|
| ![geniş](docs/widget-genis.png) | ![formül](docs/widget-formul.png) |

> Görseller `./gradlew testDebugUnitTest -Ppreviews=true` komutuyla gerçek widget kodundan (Robolectric) üretilir. Örnek veriler kullanılmıştır.

## Widget

- **Boyuta göre düzen**: 1 satır yükseklikte yatay bant, 2 hücre genişlikte iki satırlı dar liste, standart genişlikte mini grafikli liste, 5+ hücre genişlikte çift sütun.
- **Her widget ayrı yapılandırılır**: başlık, gösterilecek kalemler ve sıraları, mini grafik, alt satır. Widget'ı eklerken açılan ekrandan veya widget'a uzun basıp *Yeniden yapılandır* ile ayarlanır.
- **Satıra dokununca TradingView açılır.** Telefonda TradingView uygulaması yüklüyse grafik orada açılır. Formüller TradingView'un spread sözdizimine çevrilir:
  `GRAM_ALTIN` → `OANDA:XAUUSD*FX:USDTRY/31.1034768`, `BIST_USD` → `BIST:XU100/FX:USDTRY`.
  TradingView'da karşılığı olmayan fonksiyonlar (`pct`, `chg`, `prev`, `min`…) içeren formüllerde, formüldeki ilk enstrüman açılır.
- ⟳ simgesi verileri hemen yeniler. Arka planda 15, 30, 60 veya 120 dakikada bir otomatik yenilenir.
- Gece ve gündüz temaları sistemi izler.

## Formül dili

| | |
|---|---|
| Operatörler | `+ - * / ^ ( )`. Ondalık ayırıcı nokta (`31.1`), argüman ayırıcı `,` veya `;` |
| Değişkenler | Enstrüman ve formül anahtarları (`USDTRY`, `ONS`, `GRAM_ALTIN`…). Büyük/küçük harf fark etmez |
| Sabitler | `OZ` = 31,1034768 (troy ons → gram), `PI`, `E` |
| Fonksiyonlar | `min max avg sum abs sqrt pow ln log exp round(x; n) floor ceil` |
| Kıyas | `pct(a; b)`: a'nın b'ye göre % farkı · `prev(x)`: önceki kapanış · `chg(x)`: günlük % değişim |

Formüller başka formülleri kullanabilir (`CEYREK = GRAM_ALTIN * 1.6067`). Döngüsel referanslar yakalanır. Bir formülün günlük değişimi, aynı formül önceki kapanış fiyatlarıyla hesaplanarak bulunur.

Hazır formüller: Gram Altın, Çeyrek (has), Gram Gümüş, BIST 100 ($), Altın/Gümüş oranı, Döviz sepeti.

## Veri kaynakları

| Kaynak | Kapsam | Not |
|---|---|---|
| Yahoo Finance chart API | Endeksler, hisseler, döviz, enerji vadelileri | Resmi olmayan uç nokta, API anahtarı gerekmez. BIST verisi ~15 dk gecikmeli |
| [gold-api.com](https://gold-api.com) | Spot XAU, XAG, XPT, XPD, HG | Önceki kapanış vermez. Günlük değişim, uygulamanın önceki gün gördüğü son fiyata göre hesaplanır |
| TCMB `today.xml` | Gösterge kurları (alış/satış, efektif) | Günde bir kez yayımlanır |

Katalogda olmayan bir sembol *Özel sembol* sekmesinden eklenebilir (ör. `ASELS.IS`, `NVDA`, `SI=F`, `GBPTRY=X`). İsteğe bağlı olarak TradingView sembolü de girilebilir.

## Derleme

```bash
./gradlew assembleDebug          # app/build/outputs/apk/debug/app-debug.apk
./gradlew testDebugUnitTest      # formül motoru + TradingView çeviri testleri
```

GitHub Actions her push'ta testleri ve lint'i çalıştırır, APK'yı *Artifacts* altına koyar. `v*` etiketi (ör. `v0.1.0`) atıldığında APK bir GitHub Release'e eklenir. Release APK'sı kolay kurulum için debug anahtarıyla imzalanır. Play Store'a çıkmadan önce kendi keystore'unuzu tanımlayın.

**Teknoloji:** Kotlin, Jetpack Glance (widget), Jetpack Compose + Material 3 (ayarlar), WorkManager, DataStore, OkHttp, kotlinx.serialization. minSdk 26 (Android 8.0).

## Mimari

```
formula/   Ayrıştırıcı + değerlendirici (saf Kotlin, birim testli)
model/     Modeller, katalog, FormulaEngine, görüntü/biçim (tr-TR), TradingView çevirisi
data/      DataStore durum deposu, Actions, Repository, kaynaklar (Yahoo, gold-api, TCMB)
widget/    Glance widget'ı, alıcı, yenileme aksiyonu, mini grafik
config/    Widget başına yapılandırma ekranı
ui/        Uygulama ekranları (Piyasalar, Formüller, Ayarlar)
work/      Periyodik / anlık yenileme (WorkManager)
```

*Bu uygulama yatırım tavsiyesi vermez.*
