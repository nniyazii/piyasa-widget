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
- **Her widget ayrı yapılandırılır.** Widget'ı eklerken açılan ekrandan veya widget'a uzun basıp *Yeniden yapılandır* ile ayarlanır. Ekranın üstünde, widget'ın gerçek boyutunda **canlı önizleme** vardır; her değişiklik anında görünür.
  - **İçerik:** göstergeler, formüller ve **bölümler** (ör. Altın · Döviz · Borsa). *+ Bölüm* hazır başlık önerileri sunar. *Otomatik bölümle* göstergeleri kategoriye göre gruplar. Oklarla sıralanır; bölüm başlıkları çift sütunda da satırı keser.
  - **Görünüm:** yazı boyutu (Küçük / Normal / Büyük / Çok büyük), satır aralığı (Sıkı / Normal / Rahat), günlük değişim (Rozet / Yazı / Gizli), tema (Sistem / Açık / Koyu), arka plan opaklığı (%20–100), başlık satırı, güncelleme saati, mini grafik ve alt satır. Büyük yazıda yer kalmazsa mini grafik otomatik gizlenir.

![widget düzenleyici](docs/widget-duzenleyici.png)

| Bölümler | Büyük yazı · Sıkı ve küçük · Koyu, yarı saydam |
|---|---|
| ![bölümler](docs/widget-bolumler.png) | ![stiller](docs/widget-stiller.png) |
- **Satıra dokununca TradingView açılır.** Telefonda TradingView uygulaması yüklüyse grafik orada açılır. Formüller TradingView'un spread sözdizimine çevrilir:
  `GRAM_ALTIN` → `OANDA:XAUUSD*FX:USDTRY/31.1034768`, `BIST_USD` → `BIST:XU100/FX:USDTRY`.
  TradingView'da karşılığı olmayan fonksiyonlar (`pct`, `chg`, `prev`, `min`…) içeren formüllerde, formüldeki ilk enstrüman açılır.
- ⟳ simgesi verileri hemen yeniler. Arka planda 15, 30, 60 veya 120 dakikada bir otomatik yenilenir.
- Gece ve gündüz temaları sistemi izler.

## Ekle: sembol ve formül tek ekranda

Uygulamada tek bir liste ve tek bir yuvarlak **+** düğmesi vardır. **+** ile açılan ekranın üstünde hesap makinesi gibi bir ekran, altında tanıdık bir **hesap makinesi tuş takımı** bulunur. Ne yaptığınızı seçmezsiniz; uygulama yazdığınızdan anlar:

| Yaptığınız | Sonuç |
|---|---|
| `aselsan` yazıp sonuca dokunmak | Sembol listeye eklenir (✓ · Geri al) |
| `ons` **×** `dolar` **÷** `oz` **=** | Formül kaydedilir: ad “Gram Altın”, birim ₺ önerilir |
| `xu100 / usdtry` yazıp Enter | Formül kaydedilir: “BIST 100 ($)” |
| `OANDA:XAUUSD*FX:USDTRY/31.1` | TradingView yazımı da olduğu gibi çalışır |

- **Operatöre basmak, yazılan kelimeyi en iyi eşleşen sembole dönüştürür** (TradingView'daki gibi): önce listendekiler (formüllerin dahil), sonra katalog ve tüm piyasalar. Listende olmayan bir sembol formülde kullanılırsa kaydederken listeye de eklenir.
- Yazarken **canlı ara sonuç** soluk renkte görünür; ifade tamamlanınca koyulaşır. Günlük değişim ve TradingView karşılığı da gösterilir.
- Tuş takımı: `C ( ) ÷ / 7 8 9 × / 4 5 6 − / 1 2 3 + / ƒ 0 , ⌫ / abc =`. `ƒ` menüsünde % fark, günlük %, önceki kapanış, ortalama, min/max, yuvarla ve OZ bulunur. `abc` harf klavyesini açar; klavye açıkken tuş takımı gizlenir.
- `=`, ad (otomatik önerilir), birim (yok / ₺ / $ / € / %) ve ondalık seçimi sunar. Formülü düzenlemek için listede uzun basıp *Düzenle*'yi seçin; aynı ekran açılır.
- Boş ekranda örnek formüller ve önerilen semboller görünür. TCMB kuru veya Yahoo sembolü için *Gelişmiş* bölümü en altta durur.

![ekle: hesap makinesi](docs/ekle-hesap-makinesi.png)

### Sembol arama

Kaynak seçmek, sembol biçimi öğrenmek ya da form doldurmak gerekmez; ne biliyorsanız onu yazarsınız:

| Yazdığınız | Bulunan |
|---|---|
| `ALTIN.S1` | BIST:ALTIN, Darphane Altın Sertifikası |
| `gmstr.f` | BIST:GMSTR, Gümüş Fonu |
| `trhpi` veya `konut` | ECONOMICS:TRHPI, Konut Fiyat Endeksi |
| `altın` | Darphane sertifikası, Altın Fonu, Ons Altın… |
| `aselsan`, `BIST:THYAO`, `apple`, `bitcoin` | … |

- Sonuçlar canlı fiyat ve günlük değişimle gelir; doğru şeyi bulduğunuzu eklemeden önce görürsünüz.
- **Satıra dokunmak = eklendi.** Altta “✓ eklendi · Geri al” bildirimi çıkar ve ekran açık kalır.
- Türkçe kelimeler İngilizce karşılıklarıyla da aranır (altın → gold, konut → house price, enflasyon → inflation).
- Arama sırası: önce kesin kod eşleşmesi, sonra Türkiye, emtia, döviz, ABD (birincil listeler, piyasa değerine göre), ekonomik göstergeler ve kripto (spot, büyük borsalar).
- Kategori, ondalık, birim (₺ / $ / €) ve formül anahtarı otomatik belirlenir.

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
| TradingView tarayıcı servisi (`scanner.tradingview.com`) | Hisse, endeks, fon, sertifika, döviz, emtia, kripto, ekonomik göstergeler | Varsayılan kaynak. Tüm semboller tek istekte, anahtar gerekmez. Resmi olmayan bir uç noktadır; BIST ~15 dk gecikmeli olabilir |
| TCMB `today.xml` | Resmi gösterge kurları | Günde bir kez yayımlanır |
| Yahoo Finance, gold-api.com | Eski kurulumlar ve *Gelişmiş* girişler | 0.1 sürümünden kalan katalog göstergeleri açılışta otomatik olarak TradingView'a taşınır; anahtarlar ve formüller değişmez |

Mini grafik gün içinde yapılan her yenilemede bir nokta ekler; ilk nokta önceki kapanıştır. Böylece grafik ilk yenilemeden itibaren günün yönünü gösterir.

## Derleme

```bash
./gradlew assembleDebug          # app/build/outputs/apk/debug/app-debug.apk
./gradlew testDebugUnitTest      # birim testleri
./gradlew testDebugUnitTest -Plive=true      # gerçek TradingView servisine karşı arama/fiyat testleri
./gradlew testDebugUnitTest -Ppreviews=true  # widget ve ekran önizlemeleri (app/build/widget-previews)
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
ui/        Liste, birleşik Ekle ekranı (Composer: arama + hesap makinesi), sembol arama, ayarlar
work/      Periyodik / anlık yenileme (WorkManager)
```

*Bu uygulama yatırım tavsiyesi vermez.*
