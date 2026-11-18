# V4 ses miksinin teknik denetimi

Engin’in kaynak WAV’ı, beş konuşma arası ve SRT saati V3 ile aynı. V4’te yüksek geçiren filtre ve küçük ton düzeltmeleri, hafif sıkıştırma ve ölçümden hesaplanan +8,8 dB diyalog kazancı uygulandı. Stereo çıkışta örnekler arası tepeleri denetlemek için dört kat örneklemeli, gecikmesi telafi edilen bir sınırlayıcı kullanıldı.

| Ölçülen hat | Entegre LUFS | Gerçek tepe dBTP |
| --- | ---: | ---: |
| V3 Türkçe video AAC | −21,9 | −9,9 |
| Özgün Engin WAV, mono | −21,8 | −6,8 |
| V4 48 kHz stereo PCM miks | −15,1 | −2,5 |
| V4 Türkçe video 192 kbps stereo AAC | −15,1 | −2,5 |
| Özgün outro skoru | −26,1 | −12,5 |

V4 AAC, V3’ten **6,8 LU** yüksek. V4 ses aralığı 3,0 LU. Ölçüm FFmpeg EBU R128 ve örnekler arası tepe analiziyle yapıldı. Ölçülen AAC’nin 7.216 paketinin SHA-256 özetleri ve ses saatleri, teslim MP4’ündeki paketlerle birebir eşleşti.

| Geçiş | Kurgu saati, saniye | V3 → V4 saptanan efekt RMS | V4 mono 180 Hz–5 kHz RMS / tepe | Gelen konuşmadan önce aynı bant RMS |
| --- | ---: | ---: | ---: | ---: |
| Leonida Keys, su ve hava | 40,267–41,117 | −48,90 → −36,89 dBFS | −40,90 / −23,97 dBFS | −41,19 dBFS |
| Port Gellhorn, yumuşak varış | 71,400–72,200 | −45,50 → −34,16 dBFS | −45,68 / −30,84 dBFS | −46,65 dBFS |
| Mount Kalaga, hava | 106,300–107,250 | −48,73 → −35,77 dBFS | −39,69 / −25,10 dBFS | −40,53 dBFS |

Kaynak efektlerin düzeyi sırasıyla −42,8, −42,2 ve −42,4 LUFS. Hedef zamanlarda çözümlenen AAC’den aynı edit saatindeki konuşma referansı çıkarılıp ayrı efekt dosyalarıyla karşılaştırıldı. V4 eşleşme katsayıları 0,9014, 0,9944 ve 0,9163. Port Gellhorn’un varışına 170 Hz’de +7 dB raf filtresi uygulandı. Aynı tek kanallı frekans tanısında Port’un tüm efekt RMS düzeyi filtresiz V4’e göre +4,62 dB, konuşma öncesi RMS düzeyi +6,78 dB arttı. Özgün efekt dosyası ve kesme zamanı korundu.

Outro 147,133. saniyede başlıyor. Son altyazı ve konuşma bitişi 144,700. saniye. Özgün stereo skorda sadece +3 dB oynatma kazancı kullanıldı. V4 çözümlenen çıkış ile özgün skor arasındaki dalga biçimi korelasyonu 1,0000 ve kazanç farkı +3,00 dB. Bu bölümde konuşma ve skor çakışmadığı için ducking devreye girmedi. Miks motoru örtüşen gelecekteki bölümlerde müziği konuşma ile tetikleyerek kısabiliyor.

Fiziksel kulaklık veya laptop hoparlörüyle 1× kulak kontrolü yapılmadı. Bant ölçümü ve dalga biçimi eşleşmesi teknik tanı verisidir. [Ölçüm verisi](audio-mix-validation.json)
