import assert from 'node:assert/strict';
import test from 'node:test';
import { EXHIBITS, exhibitById, nearestExhibit } from './masjid-exhibits.js';
import { PLACES, PLACE_GROUPS, getMasjidWorld } from './masjid-layout.js';

const world = getMasjidWorld();
const cases = world.props.filter((p) => p.type === 'glass');
const spots = cases.map((p) => ({ x: p.x, z: p.z, id: p.exhibit }));

test('setiap info etalase lengkap, unik, dan ringkas', () => {
  assert.equal(new Set(EXHIBITS.map((e) => e.id)).size, EXHIBITS.length);
  for (const e of EXHIBITS) {
    assert.ok(e.id && e.title && e.era && e.text, `${e.id} belum lengkap`);
    assert.ok(e.text.length <= 260, `${e.id} terlalu panjang untuk layar HP (${e.text.length})`);
    assert.equal(exhibitById(e.id), e);
  }
  assert.equal(exhibitById('tidak-ada'), null);
});

test('setiap etalase museum punya info, tiap info dipakai satu etalase, dan etalase bisa didekati', () => {
  assert.equal(cases.length, EXHIBITS.length);
  assert.deepEqual(cases.map((c) => c.exhibit).sort(), EXHIBITS.map((e) => e.id).sort());
  for (const c of cases) {
    assert.equal(world.roomAt(c.x, c.z).id, 'museum');
    assert.ok(world.canStand(c.x + 3, c.z), `tidak ada tempat berdiri dekat etalase ${c.exhibit}`);
    assert.equal(nearestExhibit(spots, c.x + 3, c.z)?.id, c.exhibit);
  }
});

test('nearestExhibit memilih yang terdekat dan null bila jauh', () => {
  const list = [{ x: 0, z: 0, id: 'a' }, { x: 3, z: 0, id: 'b' }];
  assert.equal(nearestExhibit(list, 2.4, 0).id, 'b');
  assert.equal(nearestExhibit(list, 0.5, 0).id, 'a');
  assert.equal(nearestExhibit(list, 40, 40), null);
});

test('menu Jelajah dikelompokkan: tiap tujuan punya grup yang dikenal dan tiap grup terpakai', () => {
  for (const p of PLACES) assert.ok(PLACE_GROUPS.includes(p.group), `${p.id} tidak punya grup`);
  for (const g of PLACE_GROUPS) assert.ok(PLACES.some((p) => p.group === g), `grup ${g} kosong`);
  assert.deepEqual(world.placeGroups, PLACE_GROUPS);
});
