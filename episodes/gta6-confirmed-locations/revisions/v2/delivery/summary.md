# EP01 v2 · Revizyon teslimi

Revize bölüm **2:33,53**. İlk sürüm 2:20,73’tü. Yeni sürüm 1920×1080 ve 30 fps, 4.606 kare.

- [Revize Türkçe video](../render/review-tr.mp4) · [Temiz görüntü masterı](../render/master-clean-1920x1080.mp4) · [Yeni zamanlara uyan SRT](../captions/tr.srt)
- [6,4 saniyelik outro](../outro/outro-1920x1080.mp4) · [Outro görseli](../outro/outro.png) · [Özgün kapanış sesi](../outro/outro.wav)
- [GTA 6 / LEONIDA · Seçilen kapak](../covers/thumbnail-1280x720.png) · [Vice City levhası](../covers/02-vice-city-1280x720.png) · [6 ANA BÖLGE](../covers/03-alti-bolge-1280x720.png) · [Seçilen kapağın 1920×1080 masterı](../covers/art-master-1920x1080.png)

## Kurgu temposu

| Ölçüm | V1 | V2 |
| --- | ---: | ---: |
| Outro hariç kurgu planı | 34 | 27 |
| Üç saniyeden kısa kurgu planı | 14 | 0 |
| Medyan plan süresi | 3,47 sn | 4,97 sn |
| En kısa plan | 0,40 sn | 3,00 sn |

Engin’in özgün kaydında ölçülen beş sessiz aralığa toplam 4,2 saniye eklendi. Bunlar okuma payına ve şehir, sulak alan, kıyı ile ulusal park geçişlerine ayrıldı. Altı resmî bölge adı girişte 5,23 saniye, Vice City’nin dört adresi ilgili cümlede 7,97 saniye ve kapanıştaki rehber kapsamı 8,33 saniye ekranda. Son orman görüntüsü 2,2 saniye uzatıldı. Ardından 6,4 saniyelik kanal imzası geliyor. Anlatım aynı kayıttan geliyor ve 38 altyazı bloğu yeni kurgu saatine uyarlandı. [Kesme ve durak kararları](../storyboard/timeline.json)

## Görsel sistem

Başlıklar, bölüm girişleri, bilgi kartları ve kapaklar çizgisiz. Kırık beyaz tipografi, sıcak gölgeler ve kaynağın kendi ışığı kullanılıyor. Geçici **GTA Studio** adı küçük sağ üst filigranda ve outro’da ortak displayName ayarından geliyor. Outro’daki sonraki bölüm başlığı bölüm verisinden geliyor. [Marka ayarı](../../../../../engine/composition/brand.json) · [Bölüm ayarı](../storyboard/cut.json)

Önerilen kapak **GTA 6 / LEONIDA**. Resmî Vice City alacakaranlık karesi hem atmosferi hem eyalet ölçeğini kuruyor. İki satırlı başlık küçük önizlemede okunuyor. Üç adayın kaynak ve dosya kayıtları tutuldu. [Kapak kaynak kaydı](../covers/cover-register.json)

## Doğrulama

FFmpeg son MP4’ün tamamını hatasız çözdü. Özgün ses ve son AAC arasında, eklenen durakların çevresindeki altı konuşma diliminde zaman eşleşmesi doğrulandı. Birden fazla ışık koşulunda filigran ve başlıklar, 28 temsil karesi ve 27 kesme üzerinden incelendi. Outro’nun metni ilk kareden sonra sırayla beliriyor. Chrome son MP4’ü sessiz modda 1× hızda, 4.606 karenin tamamını kare kaybı ve arabelleğe alma olmadan oynattı. [Teknik QA](qa.json) · [Dosya özetleri](manifest.json)

Dosyalar yerel inceleme içindir. Rockstar materyalinin kamuya açık kullanım durumu ve telaffuzun kulakla denetimi inceleme bekliyor. [Görsel kullanım durumu](asset-rights-review.md)
