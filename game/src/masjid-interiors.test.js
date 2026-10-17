import assert from 'node:assert/strict';
import test from 'node:test';
import { DOORS, ROOMS, getMasjidWorld } from './masjid-layout.js';
import { ARABIC, FATIHAH, ROOM_ACTIONS, wallSlots } from './masjid-interiors-data.js';

const world = getMasjidWorld();

test('jalur di kedua sisi pintu ruangan yang didekorasi tidak terhalang perabot', () => {
  const ids = new Set(['akad', 'museum', 'tahfidz', 'wudhu_east', 'wudhu_west', 'walimah', 'library', 'women_hall']);
  for (const r of ROOMS.filter((q) => ids.has(q.id))) {
    const [x1, z1, x2, z2] = r.rect;
    for (const d of DOORS) {
      const onEdge = d.orient === 'h' ? (d.z === z1 || d.z === z2) && d.x > x1 && d.x < x2 : (d.x === x1 || d.x === x2) && d.z > z1 && d.z < z2;
      if (!onEdge) continue;
      const pts = d.orient === 'h' ? [[d.x, d.z - 2], [d.x, d.z + 2]] : [[d.x - 2, d.z], [d.x + 2, d.z]];
      for (const [x, z] of pts) assert.ok(world.canStand(x, z), `${r.id}: jalur pintu (${d.x}, ${d.z}) terhalang di (${x}, ${z})`);
    }
  }
});

test('slot dekorasi dinding tidak menimpa pintu dan berada di dalam dinding', () => {
  for (const r of ROOMS) {
    const [x1, z1, x2, z2] = r.rect;
    for (const side of ['n', 's', 'e', 'w']) {
      const horizontal = side === 'n' || side === 's';
      const coord = side === 'n' ? z1 : side === 's' ? z2 : side === 'w' ? x1 : x2;
      const doors = DOORS.filter((d) => (horizontal ? d.orient === 'h' && d.z === coord : d.orient === 'v' && d.x === coord));
      for (const c of wallSlots(r, side, 4, 5.8, 4)) {
        assert.ok(c - 2 >= (horizontal ? x1 : z1) && c + 2 <= (horizontal ? x2 : z2), `${r.id}/${side}: slot ${c} keluar dinding`);
        for (const d of doors) {
          const dc = horizontal ? d.x : d.z;
          assert.ok(c + 2 <= dc - d.width / 2 || c - 2 >= dc + d.width / 2, `${r.id}/${side}: slot ${c} menimpa pintu di ${dc}`);
        }
      }
    }
  }
});

test('tempat wudhu: empat meja cuci dan satu kolam per ruangan, kursi mempelai di panggung akad', () => {
  for (const id of ['wudhu_east', 'wudhu_west']) {
    const r = ROOMS.find((q) => q.id === id);
    const inside = (p) => p.x > r.rect[0] && p.x < r.rect[2] && p.z > r.rect[1] && p.z < r.rect[3];
    assert.equal(world.props.filter((p) => p.type === 'counter' && inside(p)).length, 4, `${id}: meja cuci`);
    assert.equal(world.props.filter((p) => p.type === 'basin' && inside(p)).length, 1, `${id}: kolam`);
  }
  const akad = ROOMS.find((q) => q.id === 'akad');
  const inAkad = (p) => p.x > akad.rect[0] && p.x < akad.rect[2] && p.z > akad.rect[1] && p.z < akad.rect[3];
  assert.equal(world.props.filter((p) => p.type === 'armchair' && inAkad(p)).length, 2);
  assert.equal(world.props.filter((p) => p.type === 'pelaminan' && inAkad(p)).length, 0, 'panggung akad memakai dekor, bukan kotak pelaminan');
});

test('teks panel dan aksi ruangan lengkap', () => {
  for (const v of [ARABIC.allah, ARABIC.quran, ...ARABIC.iqra, ...ARABIC.rattil, ...ARABIC.marriage, ...ARABIC.taharah]) {
    assert.ok(typeof v === 'string' && v.length > 0);
  }
  assert.equal(FATIHAH.length, 7);
  assert.ok(FATIHAH.every((a) => a.length > 8));
  const kinds = new Set(ROOMS.map((r) => r.kind));
  for (const kind of Object.keys(ROOM_ACTIONS)) {
    assert.ok(kinds.has(kind), `jenis ruangan ${kind} tidak ada`);
    assert.ok(ROOM_ACTIONS[kind].every((a) => a.id && a.label && a.icon));
  }
});
