# Mobil mewah armada hotel

Semua 8 mobil di drop-off/parkir hotel kini memakai empat model mewah yang terinspirasi gambar referensi pemilik
(coupe mewah biru, roadster hitam, hypercar perak-merah, SUV mewah merah). Tiap model ada dua unit; unit kedua memakai cat lain.
Semua bentuk dibuat prosedural (`car-loft.js`, `luxury-cars.js`), tanpa berkas model eksternal, dan **tanpa logo, lambang, atau nama merek asli**.
Mobil sedan lama di parkir villa tidak diubah.

## Kritik desain (dibanding gambar referensi)

| Temuan | Tingkat | Tindak lanjut |
|---|---|---|
| Sedan kotak lama jauh dari siluet mobil mewah (hood panjang, gril kuil, roadster rendah, baji hypercar, SUV tinggi) | 🔴 | Dibentuk ulang: badan "loft" superelips + kabin terbuka berisi jok, setir kanan, dasbor |
| Satu model, satu fisika untuk semua mobil | 🔴 | Fisika, kursi, gigi, RPM, suara per model (`car-models.js`) |
| Detail khas belum ada (gril, lampu, sayap, roda, pelat) | 🟡 | Ada per model; bentuk masih low-poly, bukan salinan presisi |
| Warna cat sama untuk semua | 🟡 | Cat asli per model + cat varian untuk unit kedua |
| Bentuk 3D belum dinilai pemilik di perangkat | 🟡 | Perlu uji di HP; angka `seatLift` dan posisi kursi mudah disetel di `car-models.js` |

## Sistem desain: token dan komponen

Token per model (`car-models.js`): ukuran (`length/width/height/wheelBase/wheelRadius/tireWidth`), performa (`maxSpeed/accel/brake/maxSteer/steerRate`),
kursi (`seats[{fwd,side}]`, `seatLift`), warna (`paint/accent/interior`), mesin (`cylinders/idleRpm/maxRpm/gears/timbre`), pintu (`style/open`).
Warna HUD (`car-hud.js`) mengikuti panel hotel: emas `#c9a24b`, latar `#14110d`, teks `#f1e9d6`, target sentuh 44 px.

| Model | Jenis | Kursi | Maks | Pintu | Timbre mesin |
|---|---|---|---|---|---|
| Royale Sweep | coupe | 2 | 112 km/j | coach (engsel belakang) | halus (V12) |
| Noir Aero | roadster | 2 | 133 km/j | ayun | dalam (W16) |
| Argent Fury | hypercar | 2 | 140 km/j | gunting (naik) | menjerit (V12) |
| Rubis Grand | SUV | 4 | 101 km/j | depan ayun, belakang coach | halus (V12) |

### Komponen: mobil bermodel

| Fitur | Perilaku |
|---|---|
| Roda | Berputar mengikuti kecepatan; roda depan membelok mengikuti setir (mobil pemain lain: diturunkan dari laju yaw) |
| Suspensi | Menunduk saat mengerem, jongkok saat gas, miring saat menikung |
| Pintu | Terbuka 1,6 dtk setiap kursi berganti penghuni (naik atau turun), disertai bunyi pintu |
| Lampu | Depan menyala saat mesin hidup; rem menyala terang saat mengerem; mundur putih saat bergerak mundur |
| Suara | Mesin sintetis mengikuti RPM dan gigi (hanya mobil yang dikemudikan); klakson dua nada (tombol H atau tombol Klakson, tahan); klakson dan pintu pemain lain terdengar menurut jarak |
| HUD | Nama model, km/j, gigi (R/N/1-5), batang RPM (merah mendekati batas), tombol Klakson |
| Jaringan | Klakson disiarkan (`k: 'h'`), diterima hanya dari pemegang kursi pengemudi; selebihnya protokol lama |
| Fisika | Langkah ≤ 1/60 dtk (mobil cepat tidak menembus dinding tipis); kecepatan maks per model berlaku di jalan raya |

Aksesibilitas: tombol Klakson punya `aria-label`, ≥ 44 px, dan alternatif papan ketik (H).

Boleh/jangan: setel model baru lewat satu entri di `CAR_MODELS` + satu fungsi di `luxury-cars.js`; jangan menambah bentuk detail berlapis (anggaran < 14.000 segitiga per mobil, diuji).

## Fisika ban (tahap 1 penggabungan LibreCorsa/ICEsim)

`tyre-model.js` (murni, diuji) membatasi percepatan samping oleh grip ban: grip = mu x g x faktor suhu x permukaan.
Menikung terlalu keras di kecepatan tinggi = understeer + selip (laju terkikis, ban memanas); ban dingin lebih licin;
gas/rem keras mengurangi grip samping (lingkaran gesek); tanah/halaman lebih licin dari aspal. `vehicle.slip` (0..1) dan
`vehicle.tyreTemp` (suhu ban) dipakai suara decit ban (`tyreSound` di `car-audio.js`, hanya mobil yang dikemudikan).
Hambatan udara tidak dihitung sebagai selip. Belum: HUD suhu ban, asap/bekas ban, pindah beban visual dari grip.

## Kamera kabin, setir, spion, suara (tahap 2)

- **Kamera kabin** (`cockpit.js`, `cockpit-view.js`): saat mengemudi, tombol kamera / `C` berputar melalui sudut orbit lalu masuk ke kabin.
  Mata di kepala pengemudi, menghadap ke depan dan sedikit mengintip ke arah belokan, FOV melebar dengan laju. Avatar disembunyikan.
- **Setir berputar** di semua mobil mewah (terlihat dari luar juga), **tangan dan lengan** di setir, **jam spidometer/RPM/gigi** di dasbor
  (kanvas diperbarui maksimal 12x/dtk), dan **tiga spion hidup** (tengah + dua samping): adegan dirender ulang ke tekstur 192x96,
  satu spion per frame bergiliran, bayangan tidak dihitung ulang. Spion mati (kaca gelap) dengan `?q=low`.
- **Pedal layar** REM/GAS di kanan bawah (layar sentuh); menimpa gas/rem joystick selama ditekan. HUD kecil jadi hanya tombol klakson di kabin.
- **Suara mesin v2** (`car-audio.js`, `engineLayers`): knalpot (harmonik pada frekuensi pembakaran + subharmonik setengah-orde, pengeras tanh
  yang bertambah dengan gas, resonansi pipa), desis intake, gerung gigi, turbo (W16 Noir; bunyi dan blow-off), angin, decit ban,
  letupan saat pindah gigi, rev limiter. Kamera kabin meredam bunyi luar (lowpass) dan menebalkan dentuman rendah.
- Belum: suara mesin mobil lain dengan Doppler, HUD suhu ban, asap/bekas ban.

## Jalan berkelok ke tempat acara (tahap 3)

Empat lengan Jalan Raya NIKORA (Villa utara, Aula barat, Royal timur, Masjid selatan) kini **berkelok sepanjang sekitar 3,6-3,8 km** per lengan
(`ARM_LENGTH` = 3000 m sumbu; garis tengah melenggok kiri-kanan, simpangan sampai ~300 m, radius terkecil > 60 m). Lurus di pangkal (menyambung
ke Lingkar) dan 200 m terakhir menuju gerbang (portal rambu dan mobil tamu tetap di sumbu). Gerbang kini 3,1-3,2 km dari hotel.
Pada 22 m/s tiap lengan butuh sekitar 2,5-3 menit satu arah; di atas ~25 m/s ban mulai menyelip di tikungan tersempit (model ban tahap 1).

- `road-curve.js` (murni): garis tengah dari gelombang, pencarian titik terdekat berindeks sel 64 m, radius tikungan.
- `highway.js`: `HIGHWAY_ARMS`, `armAt`, `roadBarrier` (pagar pengaman di 18,45 m dari garis tengah, terbuka 30 m di pangkal dan 6 m di ujung),
  batas dunia hotel jadi -3500..3500 x -3500..3900. `stepVehicle` memakai `env.barrier`: mobil ditahan di pagar, melambat menurut sudut benturan,
  dibelokkan sejajar pagar.
- `highway-world.js`: aspal, bahu, marka sebagai pita mengikuti kurva; median + lampu + pohon, pagar pengaman, rambu panah kuning di sisi luar
  tikungan tajam (radius < 150 m), pohon tepi jalan. Tajuk pohon sebelumnya hampir hitam (warna dikalikan dua kali) dan kini hijau.
- Belum: lalu lintas, rambu batas kecepatan, panel surya/turbin angin, tanjakan (jalan masih datar).

## Yang belum
- Tampilan di perangkat nyata belum diuji (CI hanya menguji logika, geometri, dan build). Cek tinggi kepala avatar di mobil rendah.
- Mesin mobil pemain lain tidak disuarakan; lampu sein/hazard belum ada; mobil villa masih sedan lama.
- Jumlah 500 mobil per tempat acara dan kontrol admin tetap di rencana (`HOTEL_RENCANA.md`).
