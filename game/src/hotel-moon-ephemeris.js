// Astronomi bulan untuk NIKORA Grand Hotel: posisi bulan (dan matahari) di langit sesuai tanggal, jam, dan tempat, fase bulan sungguhan, serta jam terbit/terbenam.
// Fungsi murni tanpa THREE, diuji di hotel-moon-ephemeris.test.js. Rumus: deret suku pendek (presisi rendah, cukup untuk tampilan: galat sekitar 0,3 derajat)
// dari buku Jean Meeus, "Astronomical Algorithms", bentuk ringkas yang umum dipakai pustaka astronomi sumber terbuka.
//
// Kerangka dunia game: +x = barat (sisi matahari terbenam di SKY_FRAMES), +z = selatan, -x = timur, -z = utara, +y = atas.
// Azimuth dihitung dari selatan ke arah barat (azimuth 0 = selatan, pi/2 = barat), seperti rumusnya.
import { DEMO_CYCLE_MS, hoursAt } from './day-night.js';

const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const OBLIQUITY = 23.4397 * RAD;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const EARTH_RADIUS_KM = 6378.14;
export const SUN_DISTANCE_KM = 149598000;
export const MEAN_MOON_DISTANCE_KM = 384400;
/** Tinggi cakram (derajat) saat tepi atas bulan terlihat di horizon, memperhitungkan pembiasan atmosfer dan jari-jari cakram. */
export const RISE_ALTITUDE = -0.833 * RAD;

/** Hari sejak J2000 (1 Januari 2000 pukul 12.00 UTC) untuk waktu ms epoch. */
export const daysSinceJ2000 = (ms) => (ms - J2000_MS) / DAY_MS;

const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l));
const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l));

/** Koordinat matahari (radian): kenaikan lurus ra, deklinasi dec, dan jarak (km). */
export function sunCoords(d) {
  const M = RAD * (357.5291 + 0.98560028 * d); // anomali rata-rata
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)); // persamaan titik pusat
  const L = M + C + RAD * 102.9372 + Math.PI; // bujur ekliptika
  return { ra: rightAscension(L, 0), dec: declination(L, 0), dist: SUN_DISTANCE_KM };
}

/** Koordinat bulan (radian): kenaikan lurus ra, deklinasi dec, dan jarak (km). */
export function moonCoords(d) {
  const L = RAD * (218.316 + 13.176396 * d); // bujur rata-rata
  const M = RAD * (134.963 + 13.064993 * d); // anomali rata-rata
  const F = RAD * (93.272 + 13.22935 * d); // jarak rata-rata dari simpul
  const l = L + RAD * 6.289 * Math.sin(M); // bujur ekliptika
  const b = RAD * 5.128 * Math.sin(F); // lintang ekliptika
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: 385001 - 20905 * Math.cos(M) };
}

/** Bulan purnama "ideal": persis di seberang matahari (bujur ekliptika + 180 derajat, lintang 0), pada jarak rata-rata. */
export const fullMoonCoords = (sun) => ({ ra: sun.ra + Math.PI, dec: -sun.dec, dist: MEAN_MOON_DISTANCE_KM });

/** Posisi di langit tempat: { altitude, azimuth, hourAngle } (radian) untuk koordinat ekuator, hari J2000 `d`, lintang dan bujur timur (derajat). */
export function horizontal(coords, d, latDeg, lonDeg) {
  const H = RAD * (280.16 + 360.9856235 * d) + lonDeg * RAD - coords.ra; // sudut jam = waktu sideris lokal - kenaikan lurus
  const phi = latDeg * RAD;
  return {
    altitude: Math.asin(Math.sin(phi) * Math.sin(coords.dec) + Math.cos(phi) * Math.cos(coords.dec) * Math.cos(H)),
    azimuth: Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(coords.dec) * Math.cos(phi)),
    hourAngle: H,
  };
}

/** Koreksi paralaks: bulan dilihat dari permukaan bumi sampai hampir 1 derajat lebih rendah daripada dari pusat bumi. */
export const topocentricAltitude = (altitude, distKm) => altitude - Math.asin(EARTH_RADIUS_KM / distKm) * Math.cos(altitude);

/** Arah satuan di dunia game untuk tinggi dan azimuth (radian). */
export function worldDirection(altitude, azimuth) {
  const c = Math.cos(altitude);
  return [Math.sin(azimuth) * c, Math.sin(altitude), Math.cos(azimuth) * c];
}

/** Sudut paralaktik: kemiringan sumbu utara-selatan bulan terhadap garis tegak layar. Dipakai memiringkan wajah bulan seperti di langit asli. */
export const parallacticAngle = (hourAngle, phi, dec) => Math.atan2(Math.sin(hourAngle), Math.tan(phi) * Math.cos(dec) - Math.sin(dec) * Math.cos(hourAngle));

/** Fase bulan sungguhan pada hari J2000 `d`: { illumination 0..1, cycle 0..1 (0 baru, 0,25 kuartal awal, 0,5 purnama, 0,75 kuartal akhir), waxing }. */
export function phaseAt(d) {
  const s = sunCoords(d);
  const m = moonCoords(d);
  const dRa = s.ra - m.ra;
  const phi = Math.acos(clamp(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(dRa), -1, 1)); // elongasi
  const inc = Math.atan2(s.dist * Math.sin(phi), m.dist - s.dist * Math.cos(phi)); // sudut fase
  const angle = Math.atan2(Math.cos(s.dec) * Math.sin(dRa), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(dRa));
  const cycle = 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI;
  return { illumination: (1 + Math.cos(inc)) / 2, cycle, waxing: cycle < 0.5 };
}

/**
 * Keadaan bulan untuk tempat dan waktu. mode 'full' (bawaan) = bulan purnama ideal yang terbit saat matahari terbenam dan terbenam saat matahari terbit;
 * mode 'real' = posisi dan fase bulan sungguhan menurut tanggal. Mengembalikan
 * { mode, altitude, azimuth, dir (arah satuan di dunia game), sunDir (arah matahari, untuk sisi terang cakram), illumination, cycle, waxing, distance, roll }.
 */
export function moonState({ date, lat, lon, mode = 'full' }) {
  const ms = typeof date === 'number' ? date : date.getTime();
  const d = daysSinceJ2000(ms);
  const sun = sunCoords(d);
  const real = mode === 'real';
  const moon = real ? moonCoords(d) : fullMoonCoords(sun);
  const hor = horizontal(moon, d, lat, lon);
  const altitude = topocentricAltitude(hor.altitude, moon.dist);
  const dir = worldDirection(altitude, hor.azimuth);
  let illumination = 1;
  let cycle = 0.5;
  let waxing = false;
  if (real) ({ illumination, cycle, waxing } = phaseAt(d));
  const sunHor = horizontal(sun, d, lat, lon);
  const sunDir = real ? worldDirection(sunHor.altitude, sunHor.azimuth) : dir.map((v) => -v);
  return { mode, altitude, azimuth: hor.azimuth, dir, sunDir, illumination, cycle, waxing, distance: moon.dist, roll: parallacticAngle(hor.hourAngle, lat * RAD, moon.dec) };
}

/** Terbit dan terbenam bulan berikutnya dalam `hours` jam sejak `date`: { rise, set } dalam ms epoch, null bila tidak terjadi. */
export function moonEvents({ date, lat, lon, mode = 'full', hours = 30, stepMin = 10 }) {
  const start = typeof date === 'number' ? date : date.getTime();
  const step = stepMin * 60000;
  const alt = (ms) => moonState({ date: ms, lat, lon, mode }).altitude - RISE_ALTITUDE;
  let prevMs = start;
  let prev = alt(prevMs);
  let rise = null;
  let set = null;
  for (let ms = start + step; ms <= start + hours * 3600000 && (rise === null || set === null); ms += step) {
    const cur = alt(ms);
    if (prev < 0 && cur >= 0 && rise === null) rise = prevMs + (step * -prev) / (cur - prev);
    else if (prev >= 0 && cur < 0 && set === null) set = prevMs + (step * prev) / (prev - cur);
    prevMs = ms;
    prev = cur;
  }
  return { rise, set };
}

// ---------------------------------------------------------------- waktu dan tempat dalam game
/** Jam dinding yang dipakai mode langit terkunci: siang 12.00, senja 18.00, malam 23.00 (waktu setempat). */
export const LOCKED_HOURS = Object.freeze({ day: 12, sunset: 18, night: 23 });

/**
 * Waktu yang dipakai untuk menghitung posisi bulan: auto = waktu asli; cycle = satu hari penuh dalam siklus demo (bulan ikut bergerak melintasi langit);
 * day/sunset/night = jam tetap pada hari ini. Hari dan zona waktu mengikuti jam asli di zona acara.
 */
export function clockDate({ skyMode = 'auto', now = Date.now(), zone, cycleMs = DEMO_CYCLE_MS } = {}) {
  if (skyMode === 'auto' || (skyMode !== 'cycle' && !(skyMode in LOCKED_HOURS))) return new Date(now);
  const midnight = now - hoursAt(now, zone) * 3600000; // tengah malam setempat hari ini
  const hour = skyMode === 'cycle' ? ((((now % cycleMs) + cycleMs) % cycleMs) / cycleMs) * 24 : LOCKED_HOURS[skyMode];
  return new Date(midnight + hour * 3600000);
}

/** Letak hotel menurut zona waktu (kota acuan). ?lat= dan ?lon= menimpa. */
export const LOCATIONS = Object.freeze({
  WIB: Object.freeze({ lat: -6.2, lon: 106.8, name: 'Jakarta' }),
  WITA: Object.freeze({ lat: -5.15, lon: 119.4, name: 'Makassar' }),
  WIT: Object.freeze({ lat: -2.55, lon: 140.7, name: 'Jayapura' }),
});

const numberParam = (search, key, lo, hi) => {
  const raw = new URLSearchParams(search).get(key);
  if (raw === null || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : undefined;
};

/** { lat, lon } dari ?lat= dan ?lon= bila sah, selain itu kota acuan zona waktu (zona angka: bujur = zona x 15 derajat, lintang Jakarta). */
export function locationFromSearch(search = '', zone) {
  let base = LOCATIONS.WIB;
  if (typeof zone === 'number' && Number.isFinite(zone)) base = { lat: LOCATIONS.WIB.lat, lon: clamp(zone, -12, 14) * 15 };
  else if (typeof zone === 'string' && Object.prototype.hasOwnProperty.call(LOCATIONS, zone.toUpperCase())) base = LOCATIONS[zone.toUpperCase()];
  return { lat: numberParam(search, 'lat', -90, 90) ?? base.lat, lon: numberParam(search, 'lon', -180, 180) ?? base.lon };
}
