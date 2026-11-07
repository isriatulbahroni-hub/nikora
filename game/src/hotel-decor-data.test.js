import test from 'node:test';
import assert from 'node:assert/strict';
import { DECOR_MATS, DECOR_THEMES, guestTier, levelDecor, roomDecor, themeFor } from './hotel-decor-data.js';
import { HOTEL_LEVEL_HEIGHT, getHotelWorld, hotelFootprint, hotelRoomsAtLevel, isGuestLevel } from './hotel-layout.js';

const finite = (q) => ['x', 'y', 'z', 'sx', 'sy', 'sz', 'color'].every((k) => Number.isFinite(q[k]));
const LEVELS = [0, 1, 2, 3, 50, 100, 150, 400, 700, 950, 998, 999];
const world = getHotelWorld();
const decorOf = (l) => levelDecor({ L: world.levels[l], l, y0: l * HOTEL_LEVEL_HEIGHT, F: hotelFootprint(l) });

test('tiap ruang publik (podium, Sky Lobby, suite eksekutif, Sky Level) punya tema sendiri menurut namanya', () => {
  for (const l of [0, 1, 2, 3, 50, 100, 150, 200, 998, 999]) {
    for (const r of hotelRoomsAtLevel(l)) {
      if (r.kind === 'core') continue;
      assert.ok(themeFor(r), `lantai ${l}: ruang ${r.id} (${r.name}) belum punya tema`);
    }
  }
  assert.equal(themeFor({ id: 'lobby_l51', kind: 'lobby' }), 'lobby', 'akhiran Sky Lobby dibuang');
  assert.equal(themeFor({ id: 'h5_01', kind: 'guest' }), 'guest');
  assert.ok(DECOR_THEMES.includes('musholla') && DECOR_THEMES.includes('sky_spa') && DECOR_THEMES.includes('sultan_suite'));
});

test('kelas kamar tamu mengikuti nama lantai: Deluxe, Premier, Grand Premier, Royal Residence', () => {
  assert.equal(guestTier(4), 'deluxe');
  assert.equal(guestTier(299), 'deluxe');
  assert.equal(guestTier(300), 'premier');
  assert.equal(guestTier(600), 'grand');
  assert.equal(guestTier(900), 'royal');
  const count = (l) => DECOR_MATS.reduce((n, m) => n + decorOf(l)[m].length, 0);
  const [d, p, g, r] = [10, 400, 700, 950].map((l) => { assert.ok(isGuestLevel(l)); return count(l); });
  assert.ok(r > g && g > p && p > d, `makin tinggi kelasnya makin mewah: ${[d, p, g, r]}`);
});

test('hiasan sah: ukuran positif, di dalam tapak dan tinggi ruang, bahan dikenal, tiap ruang tidak kosong', () => {
  for (const l of LEVELS) {
    const F = hotelFootprint(l);
    const y0 = l * HOTEL_LEVEL_HEIGHT;
    const out = decorOf(l);
    for (const m of DECOR_MATS) {
      for (const q of out[m]) {
        assert.ok(finite(q) && q.sx > 0 && q.sy > 0 && q.sz > 0, `lantai ${l} ${m}: ${JSON.stringify(q)}`);
        assert.ok(q.x > F[0] - 0.5 && q.x < F[2] + 0.5 && q.z > F[1] - 0.5 && q.z < F[3] + 0.5, `lantai ${l} ${m}: di luar tapak ${JSON.stringify(q)}`);
        assert.ok(q.y - q.sy / 2 >= y0 - 0.001 && q.y + q.sy / 2 <= y0 + 3.92, `lantai ${l} ${m}: di luar tinggi ruang ${JSON.stringify(q)}`);
      }
    }
    for (const r of world.levels[l].rooms) {
      if (r.kind === 'core') continue;
      const d = roomDecor(r, { y0, F, doors: world.levels[l].doors, level: l }, world.levels[l].props.filter((p) => p.room === r.id));
      assert.ok(DECOR_MATS.some((m) => d[m].length > 0), `lantai ${l}: ruang ${r.id} tanpa hiasan`);
    }
  }
});

test('hiasan tidak menutup bukaan pintu (benda tegak tanpa putaran, bagian bawah di bawah 2,3 m)', () => {
  for (const l of LEVELS) {
    const y0 = l * HOTEL_LEVEL_HEIGHT;
    const doors = world.levels[l].doors;
    const out = decorOf(l);
    for (const m of DECOR_MATS) {
      for (const q of out[m]) {
        if (q.ry || q.sy <= 0.05 || q.y - q.sy / 2 >= y0 + 2.3) continue;
        for (const d of doors) {
          const hw = d.width / 2 - 0.05;
          const box = d.orient === 'h' ? [d.x - hw, d.z - 0.3, d.x + hw, d.z + 0.3] : [d.x - 0.3, d.z - hw, d.x + 0.3, d.z + hw];
          const hit = q.x + q.sx / 2 > box[0] && q.x - q.sx / 2 < box[2] && q.z + q.sz / 2 > box[1] && q.z - q.sz / 2 < box[3];
          assert.ok(!hit, `lantai ${l} ${m}: menutup pintu ${JSON.stringify(q)} vs ${JSON.stringify(d)}`);
        }
      }
    }
  }
});
