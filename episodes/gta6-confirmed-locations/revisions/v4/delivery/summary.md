# EP01 V4 · VALEA

**2:33,90 · 1920×1080 · 30 fps.** Yeni V sembolü ve VALEA yazı logosu filigranda ve outro’da ortak marka ayarından geliyor. Dahili proje ve skill adı gta-studio. [Türkçe MP4](../render/review-tr.mp4) · [Temiz görüntü masterı](../render/master-clean-1920x1080.mp4) · [Türkçe SRT](../captions/tr.srt)

- [VALEA logo SVG](../assets/brand/valea-lockup.svg) · [Şeffaf logo PNG](../assets/brand/valea-lockup.png) · [V filigran SVG](../assets/brand/valea-mark.svg) · [Şeffaf V PNG](../assets/brand/valea-mark.png)
- [6,77 saniyelik outro MP4](../outro/outro-1920x1080.mp4) · [Outro görseli](../outro/outro.png) · [Özgün skor WAV](../outro/outro.wav)
- [Seçilen GTA VI / 6 BÖLGE 1280×720](../covers/thumbnail-1280x720.png) · [1920×1080 master](../covers/art-master-1920x1080.png) · [Şehrin Ötesi](../covers/02-sehrin-otesi-1280x720.png) · [Leonida](../covers/03-leonida-sulakalan-1280x720.png)

## Miks

| Ölçüm | Entegre ses | Gerçek tepe |
| --- | ---: | ---: |
| V3 Türkçe AAC | −21,9 LUFS | −9,9 dBTP |
| V4 Türkçe AAC | −15,1 LUFS | −2,5 dBTP |
| V4 bağımsız outro AAC | −23,1 LUFS | −9,5 dBTP |

Engin’in kaynak WAV’ı korundu. Konuşmaya hafif ton düzenlemesi, sıkıştırma ve kazanç uygulandı. Finalde 6,8 LU artış ölçüldü. Üç geçiş efekti kendi zaman aralığında doğrulandı. V3’e göre Leonida Keys +12 dB, Port Gellhorn +11 dB ve Mount Kalaga +13 dB kazanç aldı. Port’un frekans düzenlemesi, 180 Hz–5 kHz mono tanısında konuşma öncesi efekt düzeyini 6,78 dB daha yükseltti. Fiziksel kulaklık veya laptop hoparlörüyle dinleme yapılmadı. [Ses raporu ve katman seviyeleri](audio-mix-analysis.md)

Outro’nun üç planı, kaynak girişleri, kadrajı ve logo açılış saati korunuyor. Skor dosyasının SHA-256 değeri V3 ile aynı. Oynatma kazancı 3 dB arttı. Skor konuşma bittikten sonra başladığından bu bölümde ducking devreye girmedi.

## 9–10. saniyedeki kesme

Kapı sahnesi resmî Trailer 1 dosyasının kendi kurgusunda **1:16,500**’de başlıyor. V3 bu iç kesmeyi **9,767**’de gösterip **10,033**’te bilgi kartına geçtiği için kapı planına **8 kare / 0,27 sn** kaldı. V4 kaynak penceresini **1:14,667–1:18,333** aralığına kaydırdı. Kapı planı **8,233–10,033** aralığında doğal 30 fps hızında **54 kare / 1,80 sn** görünüyor. Kart ve altyazı zamanları aynı. [Kare karşılaştırması](opening-comparison.jpg)

Kapaklar resmî Rockstar ekran görüntülerinden hazırlandı ve 320×180 boyutunda incelendi. Seçilen **6 BÖLGE** kapağında Vice City’nin gece silueti ile bölümün kapsamı küçük önizlemede birlikte okunuyor. [Kapak kaynakları ve mobil kontrol](../covers/cover-review.md)

## QA

FFmpeg 4.617 karenin tamamını çözdü. Chrome sessiz 1× oynatmada kare atlamadı ve arabelleğe almadı. V3’ün 23 teslim dosyasının SHA-256 özeti doğrulandı. Outro’da logo öncesi görüntü benzerliği 0,9993, tüm outro’da logo alanının sağındaki benzerlik 0,9963 ölçüldü. Rockstar görsellerinin kamuya açık kullanımı inceleme bekliyor.

[Teknik QA](qa.json) · [Teslim dosyalarının özetleri](manifest.json) · [Görsel kullanım durumu](asset-rights-review.md)
