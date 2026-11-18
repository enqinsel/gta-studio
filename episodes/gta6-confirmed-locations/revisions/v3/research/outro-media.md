# GTA DeepFrame kapanış görüntüsü ve ses kaydı

Kıyıdan gün batımındaki şehir çizgisine, oradan şehrin akşam görünümüne geçiliyor. İlk iki hareketli plan Rockstar’ın resmî fragmanından. Final, açılışta da görülen Vice City 27 karesine dönüyor. Akşam karesindeki hafif dijital kamera hareketi, kaynağın kendi kompozisyonuna dayanıyor. [Rockstar fragmanı](https://www.rockstargames.com/VI/trailer-2) · [Resmî ekran görüntüleri](https://www.rockstargames.com/VI/media/screenshots)

| Kapanış zamanı | Kaynak | Kurgu işlevi |
| --- | --- | --- |
| 00:00,000–00:01,367 | Trailer 2, 00:06,600–00:07,967 | Hareketli Leonida kıyı panoraması |
| 00:01,367–00:03,933 | Trailer 2, 02:32,967–02:35,533 | Araçtan siluete açılan gün batımı planı |
| 00:03,933–00:06,767 | Vice City 27 resmî ekran görüntüsü | Akşam şehri ve okunabilir kapanış markası |

Rockstar’ın kadrajı video kesitlerinde korundu. Kesitler kaynak ses içermiyor. Çerçeve hassaslığında süreler, asıl dosya ve yerel medya özetleriyle birlikte kayıt altında. Yayıma ilişkin değerlendirme için görseller REVIEW durumunda. [Kapanış medya kaydı](../storyboard/outro-media.json)

## Özgün müzik ve geçiş dokuları

Kapanış müziği, nota tabanlı sentezle oluşturulan üç armonik katmandan, yumuşak yankılı üst notalardan ve markanın çıkışını taşıyan düşük frekanslı bir varıştan oluşuyor. Ölçülen RMS başlangıçtaki −35,27 dBFS’den marka bölümünde −24,88 dBFS’ye yükseliyor. Son bölüm sessizliğe çözülüyor ve örnek tepe düzeyi −12,5 dBFS. MP4 içindeki nihai düzey için montaj QA’sındaki ölçümler geçerli. [Sentez ses kaydı](../assets/audio/sound-register.json)

Leonida Keys su/hava dokusu, Port Gellhorn yumuşak alçak frekanslı varışı ve Mount Kalaga ince hava yükselişi ayrı WAV katmanları. Ham tepe seviyeleri −30 ile −33 dBFS arasında. Her biri için geçişten önceki başlatma payı ses kaydında belirtiliyor. Çıkış dosyaları 48 kHz, 24 bit stereo PCM. [Referans analizi](edit-reference.md)

Kapanışın bağımsız süresini veya kesme noktalarını değiştirirken ses katmanları proje kökünden aynı üreticiyle yeniden hazırlanabilir.

```sh
node engine/audio/deepframe-sound.mjs OUTPUT_DIR 203 41 134
```

Son üç değer sırasıyla bitiş, şehir kesmesi ve marka görünüş karesi. Bu kurguda 30 fps kullanılıyor. Görüntü veya müzik değişirse süre ve marka zamanı kapanış medya kaydında güncellenir.
