/**
 * Terimler sözlüğü: uygulamada geçen göstergeler ve kavramlar. Hesap tarifleri uygulamanın kendi
 * hesabıyla aynıdır (screener.derived, peAverage, backtest.rsi, asOfRatios, reliability).
 */
import type { FieldId } from './screener'

export interface Term {
  id: string
  term: string
  /** Aramada da eşleşen diğer adlar ve kısaltmalar */
  aka?: string[]
  /** Tek cümlelik tanım */
  short: string
  /** Ayrıntı paragrafları */
  body?: string[]
  /** Hesap: satırlar, "=" ile */
  formula?: string[]
  example?: string
  /** Piyasa'da bu değer nereden gelir, nasıl kullanılır */
  inApp?: string
  related?: string[]
  /** Bu terimi anlatan tarama alanları */
  fields?: FieldId[]
}

export interface TermGroup { id: string; title: string; terms: Term[] }

export const GLOSSARY: TermGroup[] = [
  {
    id: 'fiyat', title: 'Fiyat ve trend',
    terms: [
      {
        id: 'fiyat', term: 'Fiyat', fields: ['PRICE'],
        short: 'Bir varlığın en son işlem gördüğü fiyat.',
        inApp: 'TradingView’dan gelir. BIST fiyatları TradingView’da 15 dakika gecikmelidir; döviz, emtia ve kripto anlıktır.',
      },
      {
        id: 'gunluk-degisim', term: 'Günlük değişim', aka: ['değişim %', 'günlük getiri'], fields: ['CHANGE'],
        short: 'Fiyatın bir önceki günün kapanışına göre yüzde kaç değiştiği.',
        formula: ['Değişim % = (Fiyat ÷ Önceki kapanış − 1) × 100'],
        example: 'Dün 100 ₺ kapanan hisse bugün 104 ₺ ise değişim %4’tür.',
      },
      {
        id: 'hareketli-ortalama', term: 'Hareketli ortalama', aka: ['SMA', 'basit hareketli ortalama', '20 günlük ortalama', '50 günlük ortalama', '100 günlük ortalama', '200 günlük ortalama'],
        fields: ['SMA20', 'SMA50', 'SMA100', 'SMA200'],
        short: 'Son n işlem gününün kapanış fiyatlarının ortalaması; her gün en eski gün çıkıp yenisi girer.',
        formula: ['n günlük ortalama = (son n kapanışın toplamı) ÷ n'],
        body: [
          'Fiyatın günlük oynaklığını düzleştirip yönü gösterir. 20 ve 50 gün kısa ve orta vadeyi, 200 gün uzun vadeyi temsil eder.',
          'Fiyatın 200 günlük ortalamanın üstünde olması yaygın olarak “uzun vadeli yükselen trend” sayılır. 50 günlük ortalamanın 200 günlüğün üstüne çıkmasına “altın kesişim” denir.',
        ],
        example: 'Son 5 kapanış 10, 11, 12, 11, 13 ise 5 günlük ortalama (10 + 11 + 12 + 11 + 13) ÷ 5 = 11,4’tür.',
        inApp: 'Taramada TradingView’un değerleri kullanılır; geçmişte testte aynı ortalama günlük kapanışlardan hesaplanır.',
        related: ['ussel-ortalama', 'trend'],
      },
      {
        id: 'ussel-ortalama', term: 'Üssel hareketli ortalama', aka: ['EMA', '200 günlük üssel ortalama'], fields: ['EMA200'],
        short: 'Yakın günlere daha çok ağırlık veren hareketli ortalama; fiyata basit ortalamadan daha hızlı tepki verir.',
        formula: ['α = 2 ÷ (n + 1)', 'EMA bugün = α × Kapanış + (1 − α) × EMA dün'],
        example: '200 günlük üssel ortalamada α = 2 ÷ 201 ≈ 0,01; bugünkü kapanış ortalamaya yaklaşık %1 ağırlıkla girer.',
        related: ['hareketli-ortalama'],
      },
      {
        id: 'trend', term: 'Trend', aka: ['yükselen trend', 'trendde', 'trendi yukarı'],
        short: 'Fiyatın bir süredir genel olarak aynı yöne gitmesi.',
        body: ['Hazır listelerde “trendde” demek fiyatın 50 ya da 200 günlük ortalamasının üstünde olması demektir.'],
        related: ['hareketli-ortalama', 'geri-cekilme'],
      },
      {
        id: 'geri-cekilme', term: 'Geri çekilme', aka: ['düzeltme', 'pullback'],
        short: 'Yükselen trenddeki bir hissenin trend bozulmadan kısa süre düşmesi.',
        body: ['Örneğin “RSI 40’ın altında ama fiyat 200 günlük ortalamanın üstünde”: kısa vadede satılmış, uzun vadede trend sürüyor.'],
        related: ['rsi', 'trend'],
      },
      {
        id: '52-hafta', term: '52 hafta en düşük ve en yüksek', aka: ['52 haftalık dip', '52 haftalık zirve', 'yıllık zirve'], fields: ['LOW_52W', 'HIGH_52W'],
        short: 'Son bir yılda (52 hafta, yaklaşık 252 işlem günü) görülen en düşük ve en yüksek fiyat.',
        body: ['“Fiyat ≥ 52 hafta en yüksek −%5” koşulu, yıllık zirvesinin en fazla %5 altında olan hisseleri seçer.'],
        inApp: 'Taramada gün içi en düşük ve en yüksek fiyatlardan gelir; geçmişte testte kapanış fiyatlarından hesaplanır, bu yüzden biraz farklı olabilir.',
        related: ['5-yil', 'zirve-dip'],
      },
      {
        id: '5-yil', term: '5 yıl en düşük ve en yüksek', aka: ['5 yıllık dip', '5 yıllık zirve'], fields: ['LOW_5Y', 'HIGH_5Y'],
        short: 'Son 60 ayda görülen en düşük ve en yüksek fiyat.',
        inApp: 'TradingView bu değeri vermediği için Piyasa aylık fiyat geçmişinden hesaplar. Dolar bazında listelerde her ay, o ayın Dolar/TL kuruyla çevrilir; böylece “dolar bazında dip” gerçekten dolar bazındadır.',
        related: ['52-hafta', 'dolar-bazinda'],
      },
      {
        id: 'zirve-dip', term: 'Tüm zamanların en yüksek ve en düşüğü', aka: ['ATH', 'ATL', 'tarihi zirve'], fields: ['ATH', 'ATL'],
        short: 'Hissenin işlem gördüğü tüm dönemdeki en yüksek ve en düşük fiyat.',
        inApp: 'Geçmişte testte eldeki yaklaşık 4 yıllık geçmişten hesaplanır.',
      },
      {
        id: 'rsi', term: 'RSI (göreceli güç endeksi)', aka: ['RSI', 'RSI 14', 'göreli güç', 'aşırı satım', 'aşırı alım', 'aşırı satılmış'], fields: ['RSI'],
        short: 'Son 14 günde yükselişlerin düşüşlere göre ne kadar güçlü olduğunu 0–100 arasında ölçen gösterge.',
        formula: [
          'Ortalama kazanç ve ortalama kayıp: son 14 günün yükseliş ve düşüşlerinin ortalaması (Wilder yumuşatması)',
          'RS = Ortalama kazanç ÷ Ortalama kayıp',
          'RSI = 100 − 100 ÷ (1 + RS)',
        ],
        body: [
          '70’in üstü “aşırı alım” (kısa sürede çok yükselmiş), 30’un altı “aşırı satım” (kısa sürede çok düşmüş) sayılır.',
          'Aşırı satım tek başına alım sinyali değildir: düşüş sürebilir. Hazır listede bu yüzden 200 günlük ortalamanın üstünde kalma şartı da vardır.',
        ],
        example: '14 günde ortalama kazanç 2 ₺, ortalama kayıp 1 ₺ ise RS = 2 ve RSI = 100 − 100 ÷ 3 ≈ 66,7.',
        inApp: 'Her gün ortalamalar Wilder yöntemiyle güncellenir: yeni ortalama = (eski ortalama × 13 + bugünkü değer) ÷ 14.',
        related: ['geri-cekilme'],
      },
    ],
  },
  {
    id: 'getiri', title: 'Getiri',
    terms: [
      {
        id: 'getiri', term: 'Getiri', aka: ['1 ay getiri', '3 ay getiri', '1 yıl getiri', '5 yıl getiri', 'performans', 'yılbaşından beri'],
        fields: ['PERF_1M', 'PERF_3M', 'PERF_YTD', 'PERF_1Y', 'PERF_5Y'],
        short: 'Fiyatın belli bir süre önceki değerine göre yüzde değişimi.',
        formula: ['Getiri % = (Bugünkü fiyat ÷ Dönem başındaki fiyat − 1) × 100'],
        body: ['Temettüler dahil değildir. Yılbaşından beri getiri, geçen yılın son kapanışına göre hesaplanır.'],
        example: '3 ay önce 50 ₺ olan hisse bugün 60 ₺ ise 3 aylık getiri %20’dir.',
        inApp: 'Geçmişte testte 1 ay 21, 3 ay 63, 1 yıl 252 işlem günü sayılır.',
      },
      {
        id: 'bilesik-buyume', term: 'Yıllık bileşik büyüme', aka: ['CAGR', 'yıllık ortalama büyüme'],
        short: 'Birkaç yıllık toplam büyümeyi “her yıl eşit büyüseydi yılda yüzde kaç olurdu” diye ifade eder.',
        formula: ['Yıllık bileşik büyüme % = ((Son değer ÷ İlk değer)^(1 ÷ yıl sayısı) − 1) × 100'],
        example: '5 yılda 2’den 5’e çıkan bir değer: (5 ÷ 2)^(1/5) = 1,201 → yılda %20,1. Basit ortalama (%150 ÷ 5 = %30) büyümeyi abartır.',
        related: ['eps-buyumesi'],
      },
      {
        id: 'dolar-bazinda', term: 'Dolar bazında', aka: ['USD cinsinden', 'BIST ($)'],
        short: 'TL fiyatların Dolar/TL kuruna bölünerek dolar cinsinden izlenmesi.',
        body: ['Yüksek enflasyonda TL fiyatlar yükselse bile hisse dolar bazında değer kaybetmiş olabilir. Dolar bazında bakmak bu etkiyi ayırır.'],
        formula: ['Dolar bazında fiyat = TL fiyat ÷ Dolar/TL'],
        example: 'BIST 100 ($) = XU100 ÷ USDTRY.',
        inApp: 'Dinamik listede para birimi USD seçilince fiyat alanları o günün kuruyla çevrilir; 5 yıllık dip ve zirve her ay o ayın kuruyla çevrilir.',
      },
    ],
  },
  {
    id: 'degerleme', title: 'Değerleme',
    terms: [
      {
        id: 'piyasa-degeri', term: 'Piyasa değeri', aka: ['market cap', 'şirket değeri', 'mlr'], fields: ['MCAP'],
        short: 'Şirketin borsadaki toplam değeri: tüm hisselerinin bugünkü fiyattan değeri.',
        formula: ['Piyasa değeri = Toplam hisse sayısı × Hisse fiyatı'],
        body: [
          'Yalnızca halka açık kısım değil, şirketin tüm hisseleri sayılır. Şirketin satın alınma bedeli için borçları da hesaba katan firma değerine bakılır.',
          'Küçük şirketlerde az işlem hacmi fiyatı kolayca oynatabilir. Hazır listelerde piyasa değeri eşiği bu yüzden küçük ve sığ hisseleri eler.',
        ],
        example: 'THY’nin yaklaşık 1,37 milyar hissesi var: 1,37 milyar × 313,75 ₺ ≈ 430 milyar ₺.',
        inApp: 'TradingView’dan gelir. Eşikler BIST’te ₺, ABD’de $ cinsindendir; “mlr” milyar demektir. Geçmişte testte bugünkü hisse sayısı o günün fiyatıyla çarpılır.',
        related: ['firma-degeri'],
      },
      {
        id: 'fk', term: 'F/K (fiyat/kazanç)', aka: ['P/E', 'PE', 'fiyat kazanç oranı'], fields: ['PE'],
        short: 'Hisse fiyatının hisse başı yıllık kâra oranı: 1 ₺’lik yıllık kâr için kaç ₺ ödendiği.',
        formula: ['F/K = Fiyat ÷ Hisse başı kâr (son 12 ay)', '   = Piyasa değeri ÷ Net kâr'],
        body: [
          'Düşük F/K ucuzluk işareti olabilir, ama kârın düşeceği beklenen şirketlerde de F/K düşük görünür. Aynı sektörde ve şirketin kendi geçmişiyle karşılaştırmak daha anlamlıdır.',
          'Şirket zarardaysa F/K negatif çıkar ve anlamı yoktur; listelerde bu yüzden “F/K > 0” koşulu da bulunur.',
          'BIST’te yüksek enflasyon nominal kârı büyüttüğü için F/K’lar düşük görünmeye yatkındır.',
        ],
        example: 'Fiyat 100 ₺, hisse başı kâr 10 ₺ ise F/K 10’dur. Kâr hiç değişmeseydi ödenen fiyat 10 yıllık kâra denk gelirdi.',
        inApp: 'Taramada TradingView’un son 12 aylık F/K’sı kullanılır. Geçmişte testte o gün açıklanmış son yıllık kâr alınır; yıllık bilançonun yıl sonundan 75 gün sonra açıklandığı varsayılır.',
        related: ['eps', 'fk-ortalama', 'beklenen-fk', 'peg'],
      },
      {
        id: 'fk-ortalama', term: '5 yıllık ortalama F/K', aka: ['tarihsel F/K', 'ortalama F/K'], fields: ['PE_5Y_AVG'],
        short: 'Şirketin son 5 mali yıldaki F/K’larının ortalaması; bugünkü F/K’yı şirketin kendi geçmişiyle karşılaştırmak için.',
        formula: ['Her mali yıl için: F/K = Yıl sonu kapanış fiyatı ÷ O yılın hisse başı kârı', '5 yıllık ortalama F/K = Bu F/K’ların ortalaması'],
        body: [
          'Zarar edilen yıllar ve F/K’sı 100’ü aşan yıllar (kâr sıfıra çok yakın) ortalamayı bozmasın diye atlanır. En az 3 geçerli yıl yoksa değer hesaplanmaz.',
          'Eylül’de biten mali yılda Eylül kapanışı kullanılır.',
        ],
        example: 'F/K’lar 12, 10, 14, 9, 15 ise ortalama 12. Bugünkü F/K 6 ise “F/K ≤ 5 yıllık ortalama F/K −%50” koşulu sağlanır (6 ≤ 12 × 0,5).',
        inApp: 'TradingView bu değeri vermez; Piyasa yıllık kâr dizisi ve aylık fiyat geçmişinden hesaplar.',
        related: ['fk', 'eps'],
      },
      {
        id: 'beklenen-fk', term: 'Beklenen F/K', aka: ['ileri F/K', 'forward P/E'], fields: ['FWD_PE'],
        short: 'Bugünkü fiyatın, analistlerin gelecek mali yıl için tahmin ettiği hisse başı kâra oranı.',
        formula: ['Beklenen F/K = Fiyat ÷ Gelecek yılın tahmini hisse başı kârı'],
        body: ['Beklenen F/K bugünkü F/K’nın belirgin altındaysa analistler kârın artmasını bekliyor demektir. Tahminler yanılabilir.'],
        inApp: 'Tahmin başka para biriminde raporlanmışsa hesaplanmaz. Geçmiş tahminler bilinmediği için geçmişte testte bugünkü tahmin kullanılır (sonuç iyimser olabilir).',
        related: ['fk'],
      },
      {
        id: 'peg', term: 'PEG', aka: ['F/K büyüme oranı'], fields: ['PEG'],
        short: 'F/K’nın kâr büyümesine oranı; büyüme hızına göre pahalılığı ölçer.',
        formula: ['PEG = F/K ÷ Yıllık hisse başı kâr büyümesi (%)'],
        example: 'F/K 20, kâr yılda %20 büyüyorsa PEG 1. PEG’in 1’in altında olması genelde büyümesine göre ucuz sayılır.',
        inApp: 'TradingView’dan gelir; geçmişi bilinmediği için geçmişte testte bugünkü değerle sabit alınır.',
        related: ['fk', 'eps-buyumesi'],
      },
      {
        id: 'pddd', term: 'PD/DD (piyasa değeri/defter değeri)', aka: ['P/B', 'PB', 'defter değeri'], fields: ['PB'],
        short: 'Piyasa değerinin şirketin özkaynağına (defter değerine) oranı.',
        formula: ['PD/DD = Piyasa değeri ÷ Özkaynak'],
        body: [
          '1’in altında olması şirketin borsada kayıtlı net varlıklarından daha az değer gördüğü anlamına gelir. Bu bazen fırsattır, bazen de varlıkların kâr üretmediğinin işaretidir.',
          'Bankalar ve holdingler gibi varlık ağırlıklı şirketlerde daha anlamlıdır.',
        ],
        example: 'Piyasa değeri 50 milyar ₺, özkaynağı 100 milyar ₺ olan şirketin PD/DD’si 0,5’tir.',
        inApp: 'Geçmişte testte o günkü özkaynak, bugünkü özkaynaktan sonraki yılların net kârı çıkarılıp dağıtılan temettü eklenerek bulunur. Hisse geri alımları hesaba katılmaz.',
        related: ['ozkaynak', 'roe'],
      },
      {
        id: 'fs', term: 'Fiyat/Satış', aka: ['F/S', 'P/S'], fields: ['PS'],
        short: 'Piyasa değerinin yıllık satışlara (hasılata) oranı.',
        formula: ['F/S = Piyasa değeri ÷ Son 12 ayın satışları'],
        body: ['Kâr etmeyen ya da kârı dalgalı şirketlerde F/K yerine kullanılır. Marjı düşük sektörlerde doğal olarak düşüktür.'],
        example: 'Piyasa değeri 20 milyar, yıllık satışı 40 milyar olan şirketin F/S’si 0,5’tir.',
        inApp: 'Geçmişte testte o gün açıklanmış son yıllık satışla hesaplanır.',
        related: ['satis'],
      },
      {
        id: 'fd-favok', term: 'FD/FAVÖK', aka: ['EV/EBITDA', 'firma değeri / FAVÖK'], fields: ['EV_EBITDA'],
        short: 'Firma değerinin yıllık FAVÖK’e oranı; borçları da hesaba katan bir ucuzluk ölçüsü.',
        formula: ['FD/FAVÖK = (Piyasa değeri + Net borç) ÷ Son 12 ayın FAVÖK’ü'],
        body: ['F/K’dan farkı: borç yapısı ve vergi, amortisman farklarından daha az etkilenir; farklı sermaye yapısındaki şirketleri karşılaştırmaya elverir.'],
        example: 'Piyasa değeri 80, net borcu 20, FAVÖK’ü 25 olan şirket: (80 + 20) ÷ 25 = 4.',
        inApp: 'Geçmişte testte o gün açıklanmış yıllık FAVÖK ve bugünkü net borçla hesaplanır.',
        related: ['firma-degeri', 'favok'],
      },
      {
        id: 'temettu-verimi', term: 'Temettü verimi', aka: ['kâr payı verimi', 'dividend yield'], fields: ['DIV_YIELD'],
        short: 'Hisse başına yıllık dağıtılan temettünün (kâr payının) fiyata oranı.',
        formula: ['Temettü verimi % = Hisse başı yıllık temettü ÷ Fiyat × 100'],
        body: ['Fiyat düştükçe verim yükselir; çok yüksek verim bazen fiyatın sorun nedeniyle düştüğünü gösterir. Temettünün sürüp sürmeyeceği kâra bağlıdır.'],
        example: 'Hisse başı 2 ₺ temettü dağıtan, fiyatı 40 ₺ olan hissenin verimi %5’tir.',
        inApp: 'Geçmişte testte o gün açıklanmış yılın hisse başı temettüsü o günün fiyatına bölünür.',
      },
    ],
  },
  {
    id: 'karlilik', title: 'Kârlılık ve büyüme',
    terms: [
      {
        id: 'eps', term: 'Hisse başı kâr', aka: ['EPS', 'HBK', 'seyreltilmiş hisse başı kâr'],
        short: 'Şirketin net kârının hisse sayısına bölünmüşü: her bir hisseye düşen kâr.',
        formula: ['Hisse başı kâr = Net kâr ÷ Hisse sayısı'],
        body: ['“Seyreltilmiş” hesapta ileride hisseye dönüşebilecek opsiyon ve tahviller de sayıya eklenir. Piyasa seyreltilmiş değeri kullanır.'],
        example: 'Net kârı 10 milyar ₺, 2 milyar hissesi olan şirketin hisse başı kârı 5 ₺’dir.',
        related: ['fk', 'eps-buyumesi'],
      },
      {
        id: 'eps-buyumesi', term: 'EPS büyümesi', aka: ['hisse başı kâr büyümesi', 'kâr büyümesi', 'EPS büyümesi 1 yıl', 'EPS büyümesi 5 yıl'],
        fields: ['EPS_GROWTH_1Y', 'EPS_CAGR_5Y'],
        short: 'Hisse başı kârın yıldan yıla ne kadar arttığı.',
        formula: [
          '1 yıllık = (Son yılın hisse başı kârı ÷ Önceki yılınki − 1) × 100',
          '5 yıllık (yıllık ortalama) = ((Son yılınki ÷ 5 yıl öncekisi)^(1/5) − 1) × 100',
        ],
        body: ['Önceki yıl zarar ya da sıfırsa büyüme hesaplanmaz (oran anlamsızlaşır). 5 yıllıkta iki uç yılın da kârlı olması gerekir.'],
        example: 'Hisse başı kâr 4 ₺’den 5 ₺’ye çıktıysa 1 yıllık büyüme %25. 5 yılda 2 ₺’den 5 ₺’ye çıktıysa yıllık ortalama %20,1.',
        inApp: 'TradingView’un yıllık hisse başı kâr dizisinden (son mali yıllar) Piyasa hesaplar. Geçmişte testte o gün açıklanmış yıllar kullanılır.',
        related: ['eps', 'bilesik-buyume', 'gelir-buyumesi'],
      },
      {
        id: 'gelir-buyumesi', term: 'Gelir büyümesi', aka: ['satış büyümesi', 'hasılat büyümesi'], fields: ['REV_GROWTH_1Y'],
        short: 'Yıllık satışların bir önceki yıla göre yüzde değişimi.',
        formula: ['Gelir büyümesi % = (Son yılın satışı ÷ Önceki yılın satışı − 1) × 100'],
        body: ['BIST’te enflasyon nominal satışları büyütür; reel büyüme için enflasyonla karşılaştırmak gerekir.'],
        related: ['satis'],
      },
      {
        id: 'roe', term: 'Özsermaye kârlılığı', aka: ['ROE', 'özkaynak kârlılığı'], fields: ['ROE'],
        short: 'Şirketin özkaynağına göre ne kadar net kâr ürettiği.',
        formula: ['Özsermaye kârlılığı % = Net kâr ÷ Özkaynak × 100'],
        body: ['Yüksek ROE sermayeyi verimli kullanan şirketi gösterir; ama yüksek borç da ROE’yi şişirebilir, borç/özsermaye ile birlikte bakılmalıdır.'],
        example: 'Özkaynağı 100 milyar, yıllık net kârı 20 milyar olan şirketin ROE’si %20’dir.',
        inApp: 'Taramada TradingView’un son 12 aylık değeri; geçmişte testte o gün açıklanmış yıllık kâr ve o günkü özkaynakla hesaplanır.',
        related: ['ozkaynak', 'borc-ozsermaye'],
      },
      {
        id: 'net-marj', term: 'Net kâr marjı', aka: ['net marj', 'kâr marjı'], fields: ['NET_MARGIN'],
        short: 'Satışların yüzde kaçının net kâr olarak kaldığı.',
        formula: ['Net kâr marjı % = Net kâr ÷ Satışlar × 100'],
        example: '50 milyar ₺ satışla 5 milyar ₺ net kâr eden şirketin marjı %10’dur.',
        related: ['satis', 'net-kar'],
      },
      {
        id: 'borc-ozsermaye', term: 'Borç/Özsermaye', aka: ['borç özkaynak oranı', 'D/E', 'kaldıraç'], fields: ['DEBT_EQ'],
        short: 'Şirketin toplam finansal borcunun özkaynağına oranı.',
        formula: ['Borç/Özsermaye = Toplam finansal borç ÷ Özkaynak'],
        example: '0,77: her 1 ₺ özkaynağa karşılık 0,77 ₺ borç var. 1’in altı genelde temkinli bir borç yapısı sayılır.',
        body: ['Bankalarda borç işin doğasıdır; bu oran bankalar için yanıltıcıdır.'],
        related: ['ozkaynak', 'net-borc'],
      },
    ],
  },
  {
    id: 'bilanco', title: 'Bilanço kavramları',
    terms: [
      { id: 'net-kar', term: 'Net kâr', aka: ['net dönem kârı'], short: 'Tüm giderler, faiz ve vergiler düşüldükten sonra şirkete kalan kâr.', related: ['eps', 'net-marj'] },
      { id: 'satis', term: 'Satışlar', aka: ['hasılat', 'gelir', 'ciro'], short: 'Şirketin dönem boyunca sattığı mal ve hizmetlerin toplam tutarı.' },
      {
        id: 'favok', term: 'FAVÖK', aka: ['EBITDA', 'faiz amortisman vergi öncesi kâr'],
        short: 'Faiz, amortisman ve vergi öncesi kâr; şirketin ana faaliyetinden ne kadar nakit ürettiğine yakın bir ölçü.',
        formula: ['FAVÖK = Faaliyet kârı + Amortisman ve itfa payları'],
        related: ['fd-favok'],
      },
      {
        id: 'ozkaynak', term: 'Özkaynak', aka: ['özsermaye', 'defter değeri', 'net varlık'],
        short: 'Şirketin varlıklarından borçları düşülünce ortaklara kalan değer.',
        formula: ['Özkaynak = Toplam varlıklar − Toplam yükümlülükler'],
        body: ['Kâr ettikçe artar, temettü dağıttıkça ve zarar ettikçe azalır.'],
        related: ['pddd', 'roe'],
      },
      { id: 'net-borc', term: 'Net borç', short: 'Finansal borçlardan nakit ve benzerlerinin düşülmüş hali.', formula: ['Net borç = Finansal borçlar − Nakit ve nakit benzerleri'], body: ['Negatifse şirketin borcundan çok nakdi vardır.'], related: ['firma-degeri'] },
      {
        id: 'firma-degeri', term: 'Firma değeri', aka: ['FD', 'EV', 'enterprise value'],
        short: 'Şirketi borçlarıyla birlikte satın almanın bedeli.',
        formula: ['Firma değeri = Piyasa değeri + Net borç'],
        related: ['piyasa-degeri', 'net-borc', 'fd-favok'],
      },
      {
        id: 'mali-yil', term: 'Mali yıl ve son 12 ay', aka: ['TTM', 'yıllık bilanço', 'çeyrek'],
        short: 'Mali yıl şirketin hesap yılıdır (çoğunlukla takvim yılı); “son 12 ay” son dört çeyreğin toplamıdır.',
        body: ['Yıllık bilançolar yıl bitince hemen değil, birkaç ay sonra açıklanır. Piyasa geçmişte testte bir yılın rakamlarını yıl sonundan 75 gün sonra kullanmaya başlar; böylece o gün henüz bilinmeyen bir bilanço kullanılmaz.'],
      },
    ],
  },
  {
    id: 'test', title: 'Geçmişte test ve güvenilirlik',
    terms: [
      {
        id: 'gecmiste-test', term: 'Geçmişte test', aka: ['backtest', 'geriye dönük test'],
        short: 'Bir listenin koşullarını geçmişin her işlem gününe uygulayıp kimlerin ne zaman listeye girdiğini ve sonra ne olduğunu ölçmek.',
        body: ['Geçmişte işe yaramış olmak gelecekte de işe yarayacağını garanti etmez; ama hiç işe yaramamış bir fikri baştan elemeye yardım eder.'],
        related: ['giris-cikis', 'ileriye-bakma', 'guvenilirlik'],
      },
      { id: 'giris-cikis', term: 'Giriş ve çıkış', aka: ['listede kalma süresi'], short: 'Hissenin koşulları ilk sağladığı gün listeye girişi, sağlamayı bıraktığı gün çıkışıdır; aradaki işlem günü sayısı listede kalma süresidir.' },
      {
        id: 'endekse-gore', term: 'Endekse göre fark', aka: ['puan', 'fazla getiri', 'alfa'],
        short: 'Hissenin getirisinden aynı dönemdeki endeks getirisinin çıkarılmışı; yüzde puan olarak yazılır.',
        formula: ['Fark (puan) = Hisse getirisi % − Endeks getirisi %'],
        example: 'Hisse %8, BIST 100 %5 yükseldiyse fark +3 puandır.',
        related: ['endeks'],
      },
      { id: 'medyan', term: 'Medyan', aka: ['ortanca'], short: 'Değerler sıralanınca tam ortada kalan değer. Birkaç uç değer ortalamayı çok oynatır, medyanı az oynatır.', example: '1, 2, 3, 4 ve 50’nin ortalaması 12, medyanı 3’tür.' },
      { id: 'yukselen-orani', term: 'Yükselen oranı', aka: ['isabet oranı'], short: 'Girişlerin yüzde kaçında hissenin o süre sonunda girişteki fiyatın üstünde olduğu.' },
      {
        id: 'portfoy', term: 'Portföy biçimleri', aka: ['listede kaldıkça', '1 ay tut', '3 ay tut', 'eşit ağırlık'],
        short: 'Listeyi takip eden üç basit yatırım kuralı; hepsinde eldeki hisselere eşit para konur.',
        body: [
          'Listede kaldıkça: her gün listede olanlar tutulur, listeden çıkan satılır; liste boşken nakitte beklenir.',
          '1 ay ve 3 ay tut: listeye giren hisse girdiği günün kapanışında alınır, süre dolunca satılır.',
          'Her alım ve satışta %0,15 işlem ücreti düşülür; temettüler dahil değildir.',
        ],
        related: ['en-buyuk-dusus'],
      },
      {
        id: 'en-buyuk-dusus', term: 'En büyük düşüş', aka: ['maksimum düşüş', 'drawdown'],
        short: 'Portföyün bir zirveden sonraki en derin düşüşü: en kötü anda ne kadar kayıpta kalındığı.',
        formula: ['En büyük düşüş = en küçük (Değer ÷ O güne kadarki zirve − 1)'],
        example: 'Portföy 100’den 130’a çıkıp sonra 91’e indiyse en büyük düşüş 91 ÷ 130 − 1 = −%30.',
      },
      {
        id: 'ileriye-bakma', term: 'İleriye bakma yanlılığı', aka: ['look-ahead'],
        short: 'Geçmişteki bir günün kararında, o gün henüz bilinmeyen bir bilginin kullanılması. Test sonucunu olduğundan iyi gösterir.',
        example: 'Bugün ucuz görünen bir hisseyi, bugünkü bilançoyla 3 yıl önce de “ucuz” saymak; aradaki yükselişi bilerek seçmek gibidir.',
        inApp: 'Piyasa bilanço oranlarını o gün açıklanmış yıllık bilançodan hesaplar. Geçmişi bilinmeyen bir alan kullanılıyorsa testte belirtilir ve güvenilirlik skoru dörtte bir düşürülür.',
      },
      {
        id: 'hayatta-kalma', term: 'Hayatta kalma yanlılığı', aka: ['survivorship'],
        short: 'Testte yalnızca bugün hâlâ işlem gören şirketlerin bulunması; bu sürede batan ya da borsadan çıkanlar görünmez.',
        body: ['Sonuçları özellikle yükselen hisseleri seçen listelerde iyimser gösterir.'],
      },
      {
        id: 'guvenilirlik', term: 'Güvenilirlik skoru', aka: ['skor'],
        short: 'Bir listenin geçmişte endeksi ne kadar tutarlı biçimde geçtiğini 0–100 arasında özetleyen puan.',
        formula: [
          'Her giriş: 1 ay ve 3 ay sonraki getiri − aynı dönemin endeks getirisi; aynı ayın girişleri ortalanır',
          'Skor = 100 × (0,5 × güç + 0,3 × tutarlılık + 0,2 × örnek)',
        ],
        body: [
          'Güç: aylık farkların t değeri. Tutarlılık: farkın pozitif olduğu ayların oranı. Örnek: giriş olan ay sayısı ve toplam giriş.',
          '70 ve üstü güçlü, 50–69 orta, 30–49 zayıf, altı güvenilmez. 6 aydan az ya da 15’ten az girişte yetersiz veri.',
        ],
        inApp: 'Hazır listelerin skoru her iş günü son 3 yılla yeniden hesaplanır; kendi listen geçmişte test edince skor alır.',
        related: ['t-degeri', 'endekse-gore'],
      },
      {
        id: 't-degeri', term: 't değeri', aka: ['istatistiksel güç', 'anlamlılık'],
        short: 'Ortalama bir farkın, dağınıklığına göre sıfırdan ne kadar uzak olduğu; sonucun şans eseri olma ihtimaline dair kaba bir ölçü.',
        formula: ['t = Ortalama ÷ (Standart sapma ÷ √örnek sayısı)'],
        body: ['Kabaca 2’nin üstü güçlü, 1–2 orta, 1’in altı zayıf (şans eseri olabilir) sayılır.'],
      },
      { id: 'hisse-gun', term: 'Hisse-gün', short: 'Testte her hissenin her işlem günü bir sayılır; 100 hisse × 250 gün = 25.000 hisse-gün. Koşul tablosunda “günlerin %10’unda sağlandı” bu sayıya göredir.' },
    ],
  },
  {
    id: 'piyasa', title: 'Piyasa, altın ve döviz',
    terms: [
      { id: 'endeks', term: 'Endeks', aka: ['BIST 100', 'BIST 30', 'S&P 500', 'Nasdaq', 'Dow Jones', 'XU100'], short: 'Bir hisse sepetinin toplu değerini izleyen gösterge. BIST 100 Borsa İstanbul’un en büyük 100 şirketini, S&P 500 ABD’nin 500 büyük şirketini izler; ikisinde de büyük şirketler, halka açık piyasa değerleri oranında ağırlık taşır.', inApp: 'Geçmişte testte BIST listeleri BIST 100’le, ABD listeleri S&P 500’le karşılaştırılır.' },
      { id: 'byf', term: 'Borsa yatırım fonu', aka: ['BYF', 'ETF'], short: 'Borsada hisse gibi alınıp satılan, bir endeksi ya da emtiayı (ör. altın) izleyen fon.' },
      { id: 'ons', term: 'Ons', aka: ['troy ons', 'XAUUSD'], short: 'Değerli madenlerde kullanılan ağırlık birimi: 1 troy ons = 31,1034768 gram. Ons altın fiyatı dolar cinsindendir.' },
      { id: 'gram-altin', term: 'Gram altın', short: 'Bir gram saf altının TL fiyatı.', formula: ['Gram altın = Ons altın ($) × Dolar/TL ÷ 31,1034768'], example: 'Ons 2.400 $, Dolar/TL 34 ise 2.400 × 34 ÷ 31,1035 ≈ 2.623 ₺.', related: ['ons'] },
      { id: 'ceyrek', term: 'Çeyrek altın', short: '1,75 gram, 22 ayar ziynet altını; içinde yaklaşık 1,6067 gram saf altın vardır.', formula: ['Çeyrek (saf altın değeri) = Gram altın × 1,6067'], body: ['Kuyumcu fiyatı işçilik ve makas nedeniyle bu değerden farklıdır.'] },
      { id: 'sertifika-primi', term: 'Sertifika primi', aka: ['ALTIN.S1', 'altın sertifikası'], short: 'Borsadaki Darphane altın sertifikasının, içindeki altının değerine göre ne kadar pahalı ya da ucuz işlem gördüğü.', formula: ['1 sertifika = 0,01 gram altın', 'Prim % = (Sertifika fiyatı × 100 ÷ Gram altın − 1) × 100'], example: 'Sertifika 27 ₺, gram altın 2.600 ₺ ise 2.700 ÷ 2.600 − 1 = %3,8 prim.' },
      { id: 'altin-gumus', term: 'Altın/gümüş rasyosu', short: 'Bir ons altınla kaç ons gümüş alınabildiği.', formula: ['Rasyo = Ons altın ÷ Ons gümüş'], body: ['Tarihsel ortalamasının çok üstündeyken gümüş altına göre ucuz sayılır.'] },
      { id: 'dxy', term: 'Dolar endeksi', aka: ['DXY'], short: 'Doların euro, yen, sterlin gibi altı büyük para birimine karşı ortalama değeri.' },
      { id: 'vix', term: 'VIX korku endeksi', aka: ['VIX'], short: 'S&P 500 opsiyonlarından hesaplanan, önümüzdeki 30 gün için beklenen oynaklık. Yükseldikçe piyasada tedirginlik artmıştır.' },
      { id: 'reel-faiz', term: 'Reel faiz', short: 'Faizin enflasyondan arındırılmış hali.', formula: ['Reel faiz ≈ Politika faizi − Yıllık enflasyon', 'Kesin: (1 + faiz) ÷ (1 + enflasyon) − 1'], example: 'Faiz %40, enflasyon %33 ise yaklaşık %7; kesin hesapla 1,40 ÷ 1,33 − 1 = %5,3.', inApp: 'Hazır formül yaklaşık hesabı kullanır: TR_FAIZ − TR_ENF.' },
      { id: 'tufe', term: 'TÜFE', aka: ['enflasyon', 'tüketici fiyat endeksi'], short: 'Tüketicinin aldığı mal ve hizmetlerin fiyatlarındaki ortalama değişim. Yıllık TÜFE, fiyatların bir yıl öncesine göre yüzde kaç arttığıdır.' },
    ],
  },
]

export const ALL_TERMS: Term[] = GLOSSARY.flatMap((g) => g.terms)
export const termById = (id: string) => ALL_TERMS.find((t) => t.id === id)
/** Tarama alanını anlatan terim (koşul çiplerinden sözlüğe bağlantı için) */
export const termForField = (f: FieldId) => ALL_TERMS.find((t) => t.fields?.includes(f))
