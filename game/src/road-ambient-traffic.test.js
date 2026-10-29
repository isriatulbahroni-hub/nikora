import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AMBIENT_VENUES, DIRS, KINDS, LOAD, PEAK, STRETCH, ambientProfile, ambientProgressAt, ambientSummary, ambientTrafficAt, ambientTripDuration, countAt,
} from './road-ambient-traffic.js';

const DAY = 86400;

test('profil tempuh: tiap rute tempat acara panjang dan berdurasi wajar', () => {
  for (const v of AMBIENT_VENUES) {
    const p = ambientProfile(v);
    assert.ok(p.length > 1000, `${v} panjang ${p.length}`);
    assert.ok(p.duration > 600 && p.duration < 7200, `${v} durasi ${p.duration}`);
    for (const kind of KINDS) assert.ok(Number.isFinite(ambientTripDuration(v, kind)) && ambientTripDuration(v, kind) >= p.duration, `${v} ${kind}`);
  }
});

test('deterministik, dan sehari penuh nyambung di tengah malam', () => {
  for (const v of AMBIENT_VENUES) {
    for (let h = 0; h < 24; h += 1.5) assert.deepEqual(ambientTrafficAt(v, h * 3600), ambientTrafficAt(v, h * 3600));
    assert.deepEqual(ambientTrafficAt(v, 0), ambientTrafficAt(v, DAY));
    assert.deepEqual(ambientTrafficAt(v, 12 * 3600), ambientTrafficAt(v, 12 * 3600 + DAY));
    assert.ok(ambientTrafficAt(v, 0).length > 0, `${v}: perjalanan dari malam sebelumnya masih di jalan`);
  }
});

test('semua kendaraan di dalam rute, jenis dan arah sah, id unik', () => {
  for (const v of AMBIENT_VENUES) {
    const p = ambientProfile(v);
    for (let h = 0; h < 24; h += 0.75) {
      const list = ambientTrafficAt(v, h * 3600);
      assert.equal(new Set(list.map((x) => x.id)).size, list.length, `${v} jam ${h}: id ganda`);
      for (const x of list) {
        assert.ok(x.s >= 0 && x.s <= p.length, `${x.id} s=${x.s}`);
        assert.ok(KINDS.includes(x.kind) && DIRS.includes(x.dir), x.id);
        assert.ok(Number.isInteger(x.color) && x.riders >= 1, x.id);
      }
    }
  }
});

test('ramai di jam berangkat dan pulang kerja, sepi dini hari, dua arah sama-sama ada', () => {
  for (const v of AMBIENT_VENUES) {
    const rush = ambientTrafficAt(v, 7.5 * 3600);
    const eve = ambientTrafficAt(v, 17.5 * 3600);
    const night = ambientTrafficAt(v, 3 * 3600);
    assert.ok(rush.length > night.length * 2, `${v}: pagi ${rush.length} vs dini hari ${night.length}`);
    assert.ok(eve.length > night.length * 2, `${v}: sore ${eve.length} vs dini hari ${night.length}`);
    assert.ok(night.length > 0, `${v}: dini hari tidak boleh kosong sama sekali`);
    for (const dir of DIRS) assert.ok(rush.some((x) => x.dir === dir), `${v}: tidak ada arah ${dir}`);
    for (const kind of KINDS) assert.ok(rush.some((x) => x.kind === kind), `${v}: tidak ada ${kind} di jam sibuk`);
  }
});

test('kendaraan bergerak maju: arah out bertambah, arah back berkurang', () => {
  for (const v of AMBIENT_VENUES) {
    const a = ambientTrafficAt(v, 8 * 3600);
    const next = new Map(ambientTrafficAt(v, 8 * 3600 + 30).map((x) => [x.id, x]));
    let seen = 0;
    for (const x of a) {
      const y = next.get(x.id);
      if (!y) continue;
      seen++;
      assert.ok(x.dir === 'out' ? y.s >= x.s : y.s <= x.s, `${x.id}: ${x.s} -> ${y.s}`);
    }
    assert.ok(seen > 10, `${v}: hanya ${seen} kendaraan yang bisa dibandingkan`);
  }
});

test('ujung perjalanan: out mulai di 0 dan tiba di panjang rute, back sebaliknya', () => {
  for (const v of AMBIENT_VENUES) {
    const p = ambientProfile(v);
    for (const kind of KINDS) {
      assert.equal(ambientProgressAt(v, kind, 'out', 0), 0);
      assert.equal(ambientProgressAt(v, kind, 'back', 0), p.length);
      assert.equal(ambientProgressAt(v, kind, 'out', ambientTripDuration(v, kind)), p.length);
      assert.equal(ambientProgressAt(v, kind, 'back', ambientTripDuration(v, kind)), 0);
    }
  }
});

test('villa dan tempat acara tak dikenal tidak dapat lalu lintas umum (villa punya karyawan sendiri)', () => {
  assert.deepEqual(ambientTrafficAt('villa', 8 * 3600), []);
  assert.deepEqual(ambientTrafficAt('tidak-ada', 8 * 3600), []);
  const out = [1, 2, 3];
  assert.equal(ambientTrafficAt('villa', 0, out), out);
  assert.equal(out.length, 0);
});

test('ringkasan cocok dengan beban per jam', () => {
  assert.equal(LOAD.length, 24);
  assert.ok(LOAD.every((x) => x > 0 && x <= 1));
  for (const v of AMBIENT_VENUES) {
    const r = ambientSummary(v);
    for (const kind of KINDS) {
      let sum = 0;
      for (let h = 0; h < 24; h++) sum += countAt(kind, h) * DIRS.length;
      assert.equal(r.byKind[kind], sum);
    }
    assert.equal(r.trips, r.byKind.car + r.byKind.motor + r.byKind.bus);
  }
  assert.equal(countAt('car', 7), PEAK.car);
  assert.ok(STRETCH.bus > STRETCH.car && STRETCH.car > STRETCH.motor);
});

// Penjaga sambungan: lalu lintas umum hanya dipasang untuk gerbang selain villa, dan ikut dibongkar bersama dunia perjalanan.
test('hotel-journey.js memasang lalu lintas umum untuk tempat acara selain villa', () => {
  const journey = readFileSync(new URL('./hotel-journey.js', import.meta.url), 'utf8');
  assert.match(journey, /createAmbientTrafficView[^\n]*from '\.\/road-traffic-view\.js'|from '\.\/road-traffic-view\.js'[^\n]*/, 'impor road-traffic-view');
  assert.match(journey, /import \{[^}]*createAmbientTrafficView[^}]*\} from '\.\/road-traffic-view\.js'/, 'impor createAmbientTrafficView');
  assert.match(journey, /createAmbientTrafficView\(\{[^}]*group: world\.group[^}]*venue: gate\.id/, 'dipasang di grup dunia perjalanan menurut id gerbang');
  assert.match(journey, /gate\.id === 'villa' \? createRoadTrafficView/, 'villa tetap memakai lalu lintas karyawan');
  assert.match(journey, /w\.traffic\?\.dispose\(\)/, 'dibongkar bersama dunia perjalanan');
  const view = readFileSync(new URL('./road-traffic-view.js', import.meta.url), 'utf8');
  assert.match(view, /export function createAmbientTrafficView/, 'tampilan lalu lintas umum diekspor');
});
