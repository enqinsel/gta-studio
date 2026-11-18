# VALEA · gta-studio

GTA VI üzerine kaynaklı belgesel üretimi. VALEA’nın yayın dili İngilizce, alternatif sesler Türkçe, İspanyolca ve Almanca. Editoryal standartlar ve üretim sırası [GTA Studio skill’inde](SKILL.md).

## Başka bilgisayarda kurulum

macOS’ta Node.js 22+, npm, FFmpeg ve ffprobe, Chrome veya Chromium ile Python 3.11/3.12 kullanın. İşlem kilidi POSIX gerektirir. Windows üzerinde yerel çalıştırma doğrulanmadı. Node bağımlılıkları kilit dosyasında sabitlenmiştir. GTA Studio kendi üretim motorunu, marka dosyalarını ve paylaşılan işlem kilidini içerir.

```sh
git clone https://github.com/enqinsel/gta-studio.git
cd gta-studio
npm ci
npm run studio -- doctor
```

Chrome otomatik bulunamazsa `HYPERFRAMES_BROWSER_PATH` değerine tarayıcının çalıştırılabilir dosya yolunu verin. Başka bir makinede Codex skill’ini etkinleştirmek için depodan aşağıdaki dosyaları kopyalayın.

```sh
mkdir -p ~/.codex/skills/gta-studio
cp SKILL.md ~/.codex/skills/gta-studio/
cp -R agents briefs references ~/.codex/skills/gta-studio/
```

## EP01'i yeniden üretme

Depoda kurgu, zaman çizelgesi, hareket ayarları, VALEA markası, özgün efektler ve müzik, kaynak kayıtları, dört dilde senaryo, SRT, kapak ve yayın metinleri bulunur. Ham ve üretilmiş videolar ile özel ses kayıtları yerel dosyalardır. Rockstar kaynaklarını geri yükleyip aynı görüntü kurgusunu yeni bir hedefe render edin.

```sh
gta_revision=episodes/gta6-confirmed-locations/revisions/v4
gta_package=videolar/gta6-confirmed-locations
mkdir -p "$gta_package/_work"
python3 scripts/heavy-job.py --label gta-restore -- \
  python3 scripts/restore-assets.py "$gta_revision" --allow-reencoded
node scripts/rebuild-picture.mjs "$gta_revision" --check --allow-reencoded
node scripts/rebuild-picture.mjs "$gta_revision" \
  "$gta_package/_work/ep01-picture.mp4" --allow-reencoded
```

Geri yükleme aracı kaynakların SHA-256 değerlerini ve fragman kliplerinin kare aralıklarını doğrular. `--allow-reencoded` farklı FFmpeg sürümlerinden kaynaklanan klip dosyası farklarını doğrulanmış kaynak ve kare aralığıyla kaydeder. Yerel fragman kopyaları için `--original DOSYA` seçeneğini her kaynakta tekrarlayın. Arşivdeki orijinal klipleri ve ekran görüntülerini özel yedekten almak için `--backup KLASÖR` kullanın. Ağsız denetim için `--check` kullanın. Yeni render aynı sahne sırasını ve süreyi kullanır. Codec, tarayıcı ve font sürümleri dosyanın baytlarını değiştirebilir.

Mevcut İngilizce final miksini kullanmak için yetkili yerel yedekten `youtube-dub-en.wav` dosyasını alın. `02_audio/en/` altındaki mevcut miks, Engin anlatımını, geçiş seslerini ve outro müziğini içerir. Aşağıdaki komutta bu özel dosyanın yerel yolunu verin. Araç tek MP4 üretir ve 153,900 saniyelik yayın saatini doğrular. Sadece yayın MP4’ü gerekiyorsa önceki sessiz render adımını atlayabilirsiniz.

```sh
node scripts/rebuild-picture.mjs "$gta_revision" \
  "$gta_package/_work/ep01-valea-en.mp4" --allow-reencoded \
  --audio /yerel/yedek/youtube-dub-en.wav
```

### Yeni ses kaydıyla üretme

1. Yerel Whisper ortamını hazırlayın. Model ağırlıkları ilk kullanımda indirilir ve `.cache/whisper/` altında saklanır.

   ```sh
   python3 -m venv .venv
   .venv/bin/python -m pip install openai-whisper==20250625
   .venv/bin/python scripts/heavy-job.py --label gta-whisper-setup -- \
     .venv/bin/python -c 'import whisper; whisper.load_model("medium", device="cpu", download_root=".cache/whisper")'
   ```

2. Yetkili Higgsfield oturumundaki Engin klonu ve `elevenlabs_v4` ile `01_script/script-<dil>.json` dosyasının her bölümü için ses üretin. Tamamlanan orijinal kayıtları, bölüm kimliğine göre `<id>.mp3` veya `<id>.wav` adıyla özel bir klasöre kaydedin. Yeni seslerin doğal uzunluğu V4 sahnelerine uymazsa daha kısa bölümler kaydedin. Ses ayarları ve yetki akışı [ses referansında](references/voice-and-localization.md).
3. Örnekte İngilizce için doğrulanabilir yerleştirme manifesti, final ses ve yeni SRT hazırlayın. Diğer dillerde ilgili kodu, senaryoyu ve ses klasörünü kullanın.

   ```sh
   python3 scripts/dub-manifest.py "$gta_revision" en \
     "$gta_package/01_script/script-en.json" /yerel/engin-en \
     "$gta_package/_work/dub-en.json"
   .venv/bin/python scripts/heavy-job.py --label gta-dub-en -- \
     .venv/bin/python scripts/dub-scenes.py "$gta_package/_work/dub-en.json" \
     --picture "$gta_revision" --output "$gta_package/_work/rebuilt" --cache .cache/whisper
   ```

   Yeni İngilizce WAV’ı yayın render’ında `--audio` ile kullanın. Yeni ses kaydının kendi SRT’sini teslim edin. Başka dilde yeni kayıt üretildiyse o dilin SRT’sini de yeni hizalamadan alın.

Dört kullanıma hazır yükleme kapağı `05_cover/` klasöründe. EP01 kapaklarını yeniden çizmek için kaynaklar geri yüklendikten sonra `node scripts/render-ep01-covers.mjs YENI_CALISMA_KLASORU` çalıştırılabilir. Tarif Avenir Next fontlarına ihtiyaç duyar. Yollar `GTA_COVER_FONT` ve `GTA_COVER_CONDENSED_FONT` ile belirtilebilir.

## Yerel üretim

Aynı makinede kurulu Bay Referee motoru salt okunur kullanılır. `gta-studio` HyperFrames `0.8.137`, GSAP `3.15.0` ve Sharp `0.35.5` arar. Bağımsız kurulumda bu sürümleri projenin `node_modules` klasöründe kullanın veya eşleşen paket dizinini `GTA_NODE_MODULES` ile belirtin. FFmpeg, ffprobe, Node.js 22+ ve yerel Chromium gerekir. HyperFrames için tarayıcı yolu gerektiğinde `HYPERFRAMES_BROWSER_PATH` ile verilir.

```sh
npm run studio -- doctor
npm run studio -- preflight episodes/gta6-confirmed-locations
npm run studio -- plan episodes/gta6-confirmed-locations
npm run studio -- build episodes/gta6-confirmed-locations
node scripts/shot-review.mjs episodes/gta6-confirmed-locations
```

`preflight` senaryo, iddia, yerel görsel, kaynak ve SHA-256 bağlantılarını doğrular ve `storyboard/claim-to-media.json` yazar. Kurgu sırası `storyboard/coverage.json` içindeki sahne kararlarından, kesin zamanlar final WAV üzerindeki Whisper sözcüklerinden gelir. `build`, aynı senaryo ve sese ait sağlayıcı, Whisper ve altyazı kayıtlarını doğrulayarak temiz görüntü master’ı ve Türkçe inceleme MP4’ü üretir. Mevcut teslim dosyaları korunur.

`shot-review.mjs` final MP4’ten her planın temsil karesini ve kesmelerin iki yanını çıkarır. Çıktılar bölümün `_work` klasöründe incelenebilir. Teknik ölçümler, kaynak ve hak durumu bölümün `delivery` klasöründe tutulur.

Belirli bir kesmeyi her karede görmek için `shot-review.mjs` komutuna örneğin `245:301` eklenir. Çıktıdaki kare dizini görselleri bölümün zaman çizelgesine bağlar. `storyboard/cut.json` içindeki isteğe bağlı `mix`, özgün konuşma kaydını korur ve ölçülen ses hedefini, geçiş kazançlarını ve outro kazancını tanımlar. Final AAC ve bağımsız outro ses ölçümleri teslim paketine yazılır.

Yeni kurgu arşivi `episodes/<slug>/revisions/<sürüm>/` altında aynı üretim komutuyla hazırlanır. İsteğe bağlı `storyboard/cut.json`, Whisper’da sözcükler arası sessiz karelere eklenecek durakları, son görüntü tutuşunu ve outro içeriğini tanımlar. Duraklar kullanılırsa özgün SRT `captions/tr-source.srt` olarak saklanır ve kurguya uyan `captions/tr.srt` üretilir.

VALEA’nın adı, renkleri, V filigranı ve tam logosu [brand.json](engine/composition/brand.json) üzerinden gelir. [Marka dosyaları](engine/composition/brand/identity.md) SVG ve şeffaf PNG içerir. `storyboard/coverage.json` içindeki kart sözcükleri Whisper zamanına bağlanır. `storyboard/cut.json` geçişlerin stilini, ses girişini ve outro’nun görüntü, ses ve logo karesini tanımlar. `outro/` bağımsız MP4, PNG ve skor dosyasını içerir.

Görüntüleri veya skoru değiştirip yalnızca kapanışı üretmek için yeni bir hedef klasör verin.

```sh
npm run studio -- outro episodes/gta6-confirmed-locations/revisions/v4 /tmp/valea-outro
```

Ses hazırlığında `python3 scripts/narration.py --help` ve [ses referansı](references/voice-and-localization.md) kullanılır. Hizalama için yerel Whisper medium ve Python ortamı, sentez için yetkili Higgsfield bağlantısı gerekir. `scripts/heavy-job.py` her ağır işi Bay Referee ile aynı macOS üretim kilidine alır. macOS sandbox’ı süreç listesini engelliyorsa komutu yetkili yürütme ortamında çalıştırın.

## Uygulama kaynağı

Mimari ve çalışma zamanı [Bay Referee](https://github.com/enqinsel/bay-referee) deposunun `f0ff7afcc55ea92847aa9828e10b5c41b6fc1573` sürümüyle karşılaştırıldı. Paylaşılan ağır iş koruması oradan alındı. Sahne derleyicisi, yatay tipografi, sözcük zamanlarına dayalı kurgu ve teslim kontrolleri bu projede uygulanır.
