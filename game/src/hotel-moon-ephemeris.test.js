import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCATIONS, LOCKED_HOURS, clockDate, daysSinceJ2000, fullMoonCoords, horizontal, locationFromSearch, moonCoords, moonEvents, moonState, parallacticAngle, phaseAt, sunCoords,
  topocentricAltitude, worldDirection,
} from './hotel-moon-ephemeris.js';
import { DEMO_CYCLE_MS, hoursAt } from './day-night.js';

const RAD = Math.PI / 180;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} bukan ${b}`);
const at = (iso) => Date.parse(iso);

test('daysSinceJ2000: nol di J2000, satu hari kemudian satu', () => {
  near(daysSinceJ2000(Date.UTC(2000, 0, 1, 12)), 0);
  near(daysSinceJ2000(Date.UTC(2000, 0, 2, 12)), 1);
  assert.ok(daysSinceJ2000(Date.UTC(1999, 0, 1)) < 0);
});

test('worldDirection: selatan +z, barat +x, utara -z, timur -x, zenit +y, selalu satuan', () => {
  const south = worldDirection(0, 0);
  near(south[2], 1);
  near(south[0], 0, 1e-12);
  const west = worldDirection(0, Math.PI / 2);
  near(west[0], 1);
  const north = worldDirection(0, Math.PI);
  near(north[2], -1);
  const east = worldDirection(0, -Math.PI / 2);
  near(east[0], -1);
  near(worldDirection(Math.PI / 2, 1.3)[1], 1);
  for (let a = -3; a <= 3; a += 0.7) for (let h = -1; h <= 1.5; h += 0.5) near(Math.hypot(...worldDirection(h, a)), 1);
});

test('matahari: tepat di atas kepala di khatulistiwa saat siang hari ekuinoks, dan terbit di timur (-x)', () => {
  const noon = at('2026-03-20T12:07:00Z');
  const sun = horizontal(sunCoords(daysSinceJ2000(noon)), daysSinceJ2000(noon), 0, 0);
  assert.ok(sun.altitude > 85 * RAD, `tinggi matahari ${(sun.altitude / RAD).toFixed(1)} derajat`);
  const dawn = at('2026-03-20T06:30:00Z');
  const d = daysSinceJ2000(dawn);
  const h = horizontal(sunCoords(d), d, 0, 0);
  assert.ok(worldDirection(h.altitude, h.azimuth)[0] < 0, 'pagi hari matahari di sisi timur');
  const dusk = at('2026-03-20T17:40:00Z');
  const d2 = daysSinceJ2000(dusk);
  const h2 = horizontal(sunCoords(d2), d2, 0, 0);
  assert.ok(worldDirection(h2.altitude, h2.azimuth)[0] > 0, 'sore hari matahari di sisi barat');
});

test('moonCoords: jarak dalam rentang perigee-apogee', () => {
  for (let y = 2020; y < 2030; y++) {
    for (let m = 0; m < 12; m += 3) {
      const c = moonCoords(daysSinceJ2000(Date.UTC(y, m, 5)));
      assert.ok(c.dist > 356000 && c.dist < 407000);
      assert.ok(Math.abs(c.dec) < 29.5 * RAD);
    }
  }
});

test('phaseAt: cocok dengan fase sungguhan Januari 2025 (baru, kuartal awal, purnama, kuartal akhir)', () => {
  const full = phaseAt(daysSinceJ2000(at('2025-01-13T22:27:00Z')));
  assert.ok(full.illumination > 0.99, `purnama ${full.illumination}`);
  near(full.cycle, 0.5, 0.02);
  const nm = phaseAt(daysSinceJ2000(at('2025-01-29T12:36:00Z')));
  assert.ok(nm.illumination < 0.01, `bulan baru ${nm.illumination}`);
  const q1 = phaseAt(daysSinceJ2000(at('2025-01-06T23:56:00Z')));
  near(q1.cycle, 0.25, 0.02);
  assert.equal(q1.waxing, true);
  near(q1.illumination, 0.5, 0.05);
  const q3 = phaseAt(daysSinceJ2000(at('2025-01-21T20:31:00Z')));
  near(q3.cycle, 0.75, 0.02);
  assert.equal(q3.waxing, false);
});

test('phaseAt: selalu dalam rentang dan satu siklus kira-kira 29,5 hari', () => {
  let prev = null;
  let turns = 0;
  for (let day = 0; day < 120; day += 0.5) {
    const p = phaseAt(daysSinceJ2000(at('2026-01-01T00:00:00Z') + day * 86400000));
    assert.ok(p.illumination >= 0 && p.illumination <= 1 && p.cycle >= 0 && p.cycle <= 1);
    if (prev !== null && prev > 0.9 && p.cycle < 0.1) turns++;
    prev = p.cycle;
  }
  assert.ok(turns >= 3 && turns <= 5, `empat bulan baru dalam 120 hari, dapat ${turns}`);
});

test('moonState purnama: di seberang matahari, tinggi malam hari, rendah dan di timur saat matahari terbenam', () => {
  const loc = { lat: LOCATIONS.WIB.lat, lon: LOCATIONS.WIB.lon, mode: 'full' };
  const midnight = moonState({ ...loc, date: at('2026-10-28T16:00:00Z') }); // 23.00 WIB
  near(Math.hypot(...midnight.dir), 1);
  assert.ok(midnight.altitude > 50 * RAD && midnight.altitude < 85 * RAD, `tinggi ${(midnight.altitude / RAD).toFixed(1)}`);
  assert.equal(midnight.illumination, 1);
  assert.equal(midnight.waxing, false);
  midnight.sunDir.forEach((v, i) => near(v, -midnight.dir[i]));
  const dusk = moonState({ ...loc, date: at('2026-10-28T11:00:00Z') }); // 18.00 WIB
  assert.ok(dusk.altitude > -6 * RAD && dusk.altitude < 15 * RAD, `tinggi senja ${(dusk.altitude / RAD).toFixed(1)}`);
  assert.ok(dusk.dir[0] < 0, 'bulan purnama terbit di timur (-x)');
  const dawn = moonState({ ...loc, date: at('2026-10-28T23:00:00Z') }); // 06.00 WIB
  assert.ok(dawn.dir[0] > 0, 'bulan purnama terbenam di barat (+x)');
  assert.ok(Number.isFinite(midnight.roll));
});

test('moonState real: purnama 13 Januari 2025 tinggi di langit khatulistiwa sebelah timur, dan bulan baru terang nol', () => {
  const full = moonState({ date: at('2025-01-13T22:27:00Z'), lat: 0, lon: 0, mode: 'real' });
  assert.ok(full.illumination > 0.99);
  assert.ok(full.altitude > 35 * RAD && full.altitude < 80 * RAD, `tinggi ${(full.altitude / RAD).toFixed(1)}`);
  assert.ok(full.dir[0] < 0, 'sebelum transit: bulan di sisi timur');
  const nm = moonState({ date: at('2025-01-29T12:36:00Z'), lat: 0, lon: 0, mode: 'real' });
  assert.ok(nm.illumination < 0.01);
  near(Math.hypot(...nm.sunDir), 1);
  assert.ok(nm.distance > 356000 && nm.distance < 407000);
});

test('moonEvents: bulan purnama terbit saat matahari terbenam dan terbenam saat matahari terbit di khatulistiwa', () => {
  const start = at('2026-03-20T00:00:00Z');
  const ev = moonEvents({ date: start, lat: 0, lon: 0, mode: 'full', hours: 30 });
  assert.ok(ev.set !== null && ev.rise !== null);
  const setH = (ev.set - start) / 3600000;
  const riseH = (ev.rise - start) / 3600000;
  assert.ok(setH > 5.4 && setH < 6.6, `terbenam jam ${setH.toFixed(2)}`);
  assert.ok(riseH > 17.4 && riseH < 18.6, `terbit jam ${riseH.toFixed(2)}`);
});

test('moonEvents: tanpa peristiwa bila bulan tidak melintas horizon dalam jendela pendek', () => {
  const ev = moonEvents({ date: at('2026-03-20T22:00:00Z'), lat: 0, lon: 0, mode: 'full', hours: 2 });
  assert.equal(ev.rise, null);
  assert.equal(ev.set, null);
});

test('topocentricAltitude: lebih rendah dari pusat bumi, paling besar di horizon, nol di zenit', () => {
  const horizon = 0 - topocentricAltitude(0, 384400);
  assert.ok(horizon > 0.9 * RAD && horizon < 1.0 * RAD);
  assert.ok(0.5 - topocentricAltitude(0.5, 384400) < horizon);
  near(Math.PI / 2 - topocentricAltitude(Math.PI / 2, 384400), 0, 1e-9);
});

test('fullMoonCoords: di seberang matahari', () => {
  const s = sunCoords(1234.5);
  const m = fullMoonCoords(s);
  near(m.ra, s.ra + Math.PI);
  near(m.dec, -s.dec);
});

test('parallacticAngle: berhingga dan antara -pi dan pi', () => {
  for (let h = -3; h <= 3; h += 0.5) {
    const q = parallacticAngle(h, -0.11, 0.3);
    assert.ok(Number.isFinite(q) && Math.abs(q) <= Math.PI + 1e-12);
  }
});

test('clockDate: auto = waktu asli; mode terkunci memakai jam tetap hari ini; cycle memetakan siklus demo ke 24 jam', () => {
  const now = Date.UTC(2026, 9, 28, 3, 0, 0); // 10.00 WIB
  assert.equal(clockDate({ skyMode: 'auto', now, zone: 'WIB' }).getTime(), now);
  assert.equal(clockDate({ skyMode: 'night', now, zone: 'WIB' }).getTime(), Date.UTC(2026, 9, 28, 16, 0, 0)); // 23.00 WIB
  assert.equal(clockDate({ skyMode: 'sunset', now, zone: 'WIB' }).getTime(), Date.UTC(2026, 9, 28, 11, 0, 0)); // 18.00 WIB
  assert.equal(clockDate({ skyMode: 'day', now, zone: 'WIB' }).getTime(), Date.UTC(2026, 9, 28, 5, 0, 0)); // 12.00 WIB
  assert.deepEqual(Object.keys(LOCKED_HOURS).sort(), ['day', 'night', 'sunset']);
  const quarter = Math.floor(now / DEMO_CYCLE_MS) * DEMO_CYCLE_MS + 0.25 * DEMO_CYCLE_MS;
  near(hoursAt(clockDate({ skyMode: 'cycle', now: quarter, zone: 'WIB' }).getTime(), 'WIB'), 6, 1e-6);
  assert.equal(clockDate({ skyMode: 'tidak-dikenal', now, zone: 'WIB' }).getTime(), now);
});

test('locationFromSearch: kota acuan menurut zona, ?lat dan ?lon menimpa, nilai tak sah diabaikan', () => {
  assert.deepEqual(locationFromSearch(''), { lat: LOCATIONS.WIB.lat, lon: LOCATIONS.WIB.lon });
  assert.deepEqual(locationFromSearch('', 'WIT'), { lat: LOCATIONS.WIT.lat, lon: LOCATIONS.WIT.lon });
  assert.deepEqual(locationFromSearch('', 'wita'), { lat: LOCATIONS.WITA.lat, lon: LOCATIONS.WITA.lon });
  assert.deepEqual(locationFromSearch('', 8), { lat: LOCATIONS.WIB.lat, lon: 120 });
  assert.deepEqual(locationFromSearch('?lat=1.5&lon=104'), { lat: 1.5, lon: 104 });
  assert.deepEqual(locationFromSearch('?lat=abc&lon=999'), { lat: LOCATIONS.WIB.lat, lon: LOCATIONS.WIB.lon });
  assert.deepEqual(locationFromSearch('?lat=&lon='), { lat: LOCATIONS.WIB.lat, lon: LOCATIONS.WIB.lon });
});
