import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMUTE_H, STAFF_HOME, STAFF_VENUES, VENUE_DEFS, VENUE_STAFF, VENUE_STAFF_ROLES, commuteSummary, dutySummary, onDuty, pickNearby, presence, staffActFor,
  staffConfig, staffOnLevel, staffState, venueStaffTotal,
} from './venue-staff.js';
import { VENUES } from './venues.js';
import { BOUNDS as VILLA_BOUNDS } from './villa-layout.js';
import { BOUNDS as ROYAL_BOUNDS } from './royal-layout.js';
import { BOUNDS as MASJID_BOUNDS } from './masjid-layout.js';
import { HALL } from './hall-layout.js';

const BOUNDS = { villa: VILLA_BOUNDS, royal: ROYAL_BOUNDS, masjid: MASJID_BOUNDS, hall: HALL.bounds };
const EXPECTED = { villa: 120, royal: 100, hall: 50, masjid: 200 };
const HOURS = Array.from({ length: 96 }, (_, k) => k / 4);

test('karyawan ada di empat tempat acara yang terdaftar di venues.js, hotel tidak termasuk', () => {
  assert.deepEqual([...STAFF_VENUES].sort(), ['hall', 'masjid', 'royal', 'villa']);
  for (const v of STAFF_VENUES) assert.ok(v in VENUES, `${v} harus ada di VENUES`);
  assert.equal(STAFF_VENUES.includes('hotel'), false);
  assert.equal(STAFF_HOME, 'hotel');
});

test('jumlah karyawan per tempat acara sesuai rancangan dan sama dengan jumlah peran', () => {
  for (const v of STAFF_VENUES) {
    const fromRoles = Object.values(VENUE_STAFF_ROLES[v]).reduce((sum, r) => sum + r.count, 0);
    assert.equal(venueStaffTotal(v), EXPECTED[v], v);
    assert.equal(fromRoles, EXPECTED[v], v);
    assert.equal(new Set(VENUE_STAFF[v].map((s) => s.id)).size, EXPECTED[v], `id ${v} unik`);
  }
});

test('setiap karyawan punya shift 0-2 dan jenis transportasi motor atau bus', () => {
  for (const v of STAFF_VENUES) {
    for (const s of VENUE_STAFF[v]) {
      assert.ok([0, 1, 2].includes(s.shift), s.id);
      assert.ok(['motor', 'bus'].includes(s.transport), s.id);
      assert.equal(s.venue, v);
    }
  }
});

test('sebagian besar karyawan bersepeda motor, sebagian tanpa kendaraan naik bus jemputan', () => {
  for (const v of STAFF_VENUES) {
    const staff = VENUE_STAFF[v];
    const bus = staff.filter((s) => s.transport === 'bus').length;
    const share = bus / staff.length;
    assert.ok(bus > 0, `${v} punya penumpang bus`);
    assert.ok(share >= 0.15 && share <= 0.4, `${v} porsi bus ${share}`);
    assert.ok(staff.filter((s) => s.transport === 'motor').length > bus, `${v} motor lebih banyak`);
  }
});

test('tiap jam selalu ada karyawan bertugas (minimal seperlima), termasuk shift malam', () => {
  for (const v of STAFF_VENUES) {
    for (const h of HOURS) {
      const { total } = dutySummary(v, h);
      assert.ok(total >= venueStaffTotal(v) * 0.2, `${v} jam ${h}: ${total}`);
    }
  }
});

test('peran cleaning tidak masuk shift malam', () => {
  for (const s of VENUE_STAFF.villa.filter((x) => x.role === 'housekeeping')) assert.ok(s.shift < 2);
  for (const s of VENUE_STAFF.royal.filter((x) => x.role === 'cleaner')) assert.ok(s.shift < 2);
});

test('presence: bertugas, berangkat 30 menit sebelum shift, pulang 30 menit setelahnya, selebihnya di hotel', () => {
  const pagi = VENUE_STAFF.villa.find((s) => s.shift === 0);
  assert.equal(presence(pagi, 10), 'working');
  assert.equal(presence(pagi, 6 - COMMUTE_H / 2), 'arriving');
  assert.equal(presence(pagi, 14 + COMMUTE_H / 2), 'leaving');
  assert.equal(presence(pagi, 17), 'hotel');
  const malam = VENUE_STAFF.masjid.find((s) => s.shift === 2);
  assert.equal(presence(malam, 23), 'working');
  assert.equal(presence(malam, 2), 'working');
  assert.equal(presence(malam, 22 - COMMUTE_H / 2), 'arriving');
  assert.equal(presence(malam, 6 + COMMUTE_H / 2), 'leaving');
  assert.equal(presence(malam, 12), 'hotel');
});

test('staffState hanya ada saat bertugas, deterministik, dan di dalam batas tempat acara', () => {
  for (const v of STAFF_VENUES) {
    const b = BOUNDS[v];
    for (const s of VENUE_STAFF[v]) {
      for (const h of HOURS) {
        const st = staffState(s, h);
        if (!onDuty(s, h)) {
          assert.equal(st, null);
          continue;
        }
        assert.ok(st, `${s.id} jam ${h} harus punya keadaan`);
        assert.ok(Number.isFinite(st.x) && Number.isFinite(st.z), s.id);
        assert.ok(st.x >= b.minX - 1 && st.x <= b.maxX + 1 && st.z >= b.minZ - 1 && st.z <= b.maxZ + 1, `${s.id} di luar batas: ${st.x},${st.z}`);
        assert.ok(st.level >= 0 && st.level <= (v === 'villa' ? 2 : 0), `${s.id} lantai ${st.level}`);
        assert.deepEqual(st, staffState(s, h));
      }
    }
  }
});

test('cleaning service villa naik ke lantai 1 untuk membersihkan kamar atas', () => {
  let upstairs = 0;
  for (let h = 6; h < 14; h += 0.05) upstairs += staffOnLevel('villa', 1, h).length;
  assert.ok(upstairs > 0);
  for (const st of staffOnLevel('villa', 1, 8)) assert.equal(st.level, 1);
});

test('dutySummary menjumlahkan semua peran yang bertugas', () => {
  for (const v of STAFF_VENUES) {
    const sum = dutySummary(v, 10);
    assert.equal(Object.values(sum.byRole).reduce((a, b) => a + b, 0), sum.total);
    assert.equal(sum.total, VENUE_STAFF[v].filter((s) => onDuty(s, 10)).length);
    assert.deepEqual(Object.keys(sum.byRole), Object.keys(VENUE_DEFS[v].roles));
  }
});

test('commuteSummary menghitung yang berangkat dan pulang per jenis kendaraan di pergantian shift', () => {
  const arriving = commuteSummary('masjid', 5.75);
  assert.ok(arriving.arriving.motor > 0 && arriving.arriving.bus > 0);
  assert.equal(arriving.leaving.motor + arriving.leaving.bus, 0);
  const leaving = commuteSummary('masjid', 14.25);
  assert.ok(leaving.leaving.motor + leaving.leaving.bus > 0);
  const quiet = commuteSummary('masjid', 11);
  assert.equal(quiet.arriving.motor + quiet.arriving.bus + quiet.leaving.motor + quiet.leaving.bus, 0);
});

test('staffConfig deterministik dan staffActFor memetakan tugas ke pose', () => {
  const s = VENUE_STAFF.villa[0];
  assert.deepEqual(staffConfig(s), staffConfig(s));
  assert.equal(staffActFor('walking'), 'walk');
  assert.equal(staffActFor('cleaning'), 'bow');
  assert.equal(staffActFor('greeting'), 'wave');
  assert.equal(staffActFor('standing'), null);
});

test('pickNearby membatasi radius dan jumlah, yang terdekat dahulu', () => {
  const list = [{ id: 'c', x: 30, z: 0 }, { id: 'a', x: 1, z: 0 }, { id: 'b', x: 5, z: 0 }, { id: 'far', x: 100, z: 0 }];
  assert.deepEqual(pickNearby(list, { x: 0, z: 0 }).map((s) => s.id), ['a', 'b', 'c']);
  assert.deepEqual(pickNearby(list, { x: 0, z: 0 }, 40, 2).map((s) => s.id), ['a', 'b']);
});
