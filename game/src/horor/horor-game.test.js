import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACOUSTICS, GAME, createGame } from './horor-game.js';
import { CAMS, DOORS, ITEMS, MANSION_RECT, PLAYER_START, ROOMS, SPAWNS, buildMansion, camAt } from './horor-layout.js';
import { camYawOf } from './horor-player.js';
import { ITEM_DEFS, addItem, countItem, freeSlots, itemDef } from './horor-rules.js';
import { ZOMBIE_TYPES, createZombie } from './horor-zombie.js';
import { audio } from './horor-audio.js';

const DT = 1 / 60;
const idle = () => ({ x: 0, y: 0, mag: 0, analog: false, up: false, down: false, left: false, right: false, run: false });
const keys = (o) => ({ ...idle(), ...o });
const mv = (o) => ({ intent: keys(o) }); // input game: intent dibungkus
const dig = (x, y) => {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l, mag: x || y ? 1 : 0, analog: false, up: y > 0, down: y < 0, left: x < 0, right: x > 0, run: false };
};
function seeded(seed = 7) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function fresh(o = {}) {
  const room = buildMansion();
  const g = createGame(room, { rng: seeded(), ...o });
  return { room, g, done: () => room.dispose() };
}
const tp = (g, x, z, rot) => {
  g.player.x = x;
  g.player.z = z;
  g.player.speed = 0;
  if (rot !== undefined) g.player.rot = rot;
};
const run = (g, secs, input = {}) => {
  const out = [];
  for (let t = 0; t < secs; t += DT) out.push(...g.update(DT, input));
  return out;
};
const act = (g, a) => g.update(DT, { [a]: true });
const item = (name) => ITEMS.find((i) => i.item === name);
const gateOf = (g, id) => g.gates.get(id);
const loneWalker = (x, z, extra = {}) => createZombie({ id: 'z-uji', type: 'walker', x, z, rot: 0, ...extra });

test('createGame: keadaan awal sesuai denah', () => {
  const { g, done } = fresh();
  assert.equal(g.state, 'playing');
  assert.equal(g.roomId, 'lobi');
  assert.equal(g.acoustic, 'hall');
  assert.equal(g.pickups.length, ITEMS.length);
  assert.equal(g.gates.size, DOORS.filter((d) => d.lock).length);
  assert.equal(g.zombies.length, SPAWNS.length);
  assert.equal(g.player.hp, 100);
  assert.deepEqual([g.player.x, g.player.z], [PLAYER_START.x, PLAYER_START.z]);
  assert.equal(g.camera.room, 'lobi');
  assert.equal(g.armed(), false);
  assert.equal(g.exitOpen, false);
  for (const gt of g.gates.values()) assert.equal(gt.open, false);
  done();
});

test('acoustics: setiap ruangan punya jenis akustik yang dikenal horor-audio.js', () => {
  for (const r of ROOMS) assert.ok(ACOUSTICS[r.id], r.id);
  for (const k of Object.values(ACOUSTICS)) assert.ok(audio.ACOUSTICS[k], k);
});

test('ambil item: masuk inventori, hilang dari lantai, mesh disembunyikan, ada kejadian dan pesan', () => {
  const { g, done } = fresh();
  const it = item('pistol');
  tp(g, it.x, it.z);
  const pk = g.pickups.find((p) => p.item === 'pistol');
  assert.equal(pk.mesh.visible, true);
  const ev = act(g, 'interact');
  assert.equal(g.armed(), true);
  assert.equal(g.pickups.includes(pk), false);
  assert.equal(pk.mesh.visible, false);
  assert.ok(ev.some((e) => e.type === 'pickup' && e.item === 'pistol'));
  assert.match(g.messages.at(-1).text, /Pistol/);
  done();
});

test('ambil item: tumpukan peluru bergabung; jauh dari item tidak terjadi apa-apa', () => {
  const { g, done } = fresh();
  tp(g, 18, 22);
  act(g, 'interact');
  assert.match(g.messages.at(-1).text, /Tidak ada yang bisa dipakai/);
  assert.equal(g.inventory.items.length, 0);
  const a = item('ammo');
  tp(g, a.x, a.z);
  act(g, 'interact');
  assert.equal(countItem(g.inventory, 'ammo'), 8);
  done();
});

test('ambil item: inventori penuh menolak dan item tetap di lantai', () => {
  const { g, done } = fresh();
  for (let i = 0; i < g.inventory.slots; i++) addItem(g.inventory, `berkas:isi-${i}`, 1);
  assert.equal(freeSlots(g.inventory), 0);
  const it = item('pistol');
  tp(g, it.x, it.z);
  const ev = act(g, 'interact');
  assert.match(g.messages.at(-1).text, /Inventori penuh/);
  assert.equal(ev.some((e) => e.type === 'pickup'), false);
  assert.ok(g.pickups.some((p) => p.item === 'pistol'));
  done();
});

test('target(): label aksi untuk item, gerbang terkunci, gerbang dengan kunci, dan tempat kosong', () => {
  const { g, done } = fresh();
  assert.equal(g.target(), null);
  const it = item('ammo');
  tp(g, it.x, it.z);
  assert.deepEqual(g.target(), { kind: 'pickup', id: g.pickups.find((p) => p.item === 'ammo').id, label: 'Ambil Peluru x8' });
  const gt = gateOf(g, 'lorong-pustaka');
  tp(g, gt.x, gt.z + 1);
  assert.equal(g.target().kind, 'gate');
  assert.match(g.target().label, /Terkunci\. Butuh Kunci perpustakaan/);
  addItem(g.inventory, 'kunci:perpustakaan', 1);
  assert.equal(g.target().label, 'Buka gerbang');
  done();
});

test('gerbang tanpa kunci: tetap tertutup, pesan benar, dan benar-benar menahan pemain', () => {
  const { g, done } = fresh();
  g.zombies.length = 0;
  const gt = gateOf(g, 'lorong-pustaka');
  tp(g, gt.x, gt.z + 1.2, Math.PI);
  act(g, 'interact');
  assert.match(g.messages.at(-1).text, /Terkunci/);
  assert.equal(gt.open, false);
  run(g, 3, mv({ up: true }));
  assert.ok(g.player.z > gt.z + 0.3, `gerbang menahan: z=${g.player.z}`);
  done();
});

test('gerbang dengan kunci: terbuka, kunci terpakai, navigasi diperbarui, dan bisa dilewati', () => {
  const { g, room, done } = fresh();
  g.zombies.length = 0;
  const gt = gateOf(g, 'lorong-pustaka');
  addItem(g.inventory, 'kunci:perpustakaan', 1);
  const blocked = g.nav.boxes.length;
  tp(g, gt.x, gt.z + 1.2, Math.PI);
  const ev = act(g, 'interact');
  assert.equal(gt.open, true);
  assert.equal(countItem(g.inventory, 'kunci:perpustakaan'), 0);
  assert.ok(ev.some((e) => e.type === 'gate' && e.id === 'lorong-pustaka'));
  assert.ok(g.nav.boxes.length <= blocked, 'collider gerbang keluar dari navigasi');
  assert.equal(g.nav.boxes.some((b) => gt.x > b.minX && gt.x < b.maxX && gt.z > b.minZ && gt.z < b.maxZ), false, 'tak ada collider di titik gerbang');
  run(g, 3, mv({ up: true }));
  assert.ok(g.player.z < gt.z - 1, `lewat gerbang: z=${g.player.z}`);
  assert.equal(g.roomId, 'perpustakaan');
  done();
});

test('main penuh: kumpulkan semua, buka semua gerbang berurutan, lalu keluar = menang (tanpa inventori penuh)', () => {
  const { g, done } = fresh();
  g.zombies.length = 0; // jalur ini menguji rantai kunci, bukan pertarungan
  const reach = () => {
    const open = new Set(['lobi']);
    for (let changed = true; changed; ) {
      changed = false;
      for (const d of DOORS) {
        const [a, b] = d.between;
        const passable = !d.lock || g.gates.get(d.id).open;
        if (passable && b && open.has(a) !== open.has(b)) {
          open.add(a);
          open.add(b);
          changed = true;
        }
      }
    }
    return open;
  };
  let minFree = Infinity;
  const order = [];
  for (let progress = true; progress && g.state === 'playing'; ) {
    progress = false;
    const rooms = reach();
    for (const pk of [...g.pickups]) {
      if (!rooms.has(pk.room)) continue;
      tp(g, pk.x, pk.z);
      act(g, 'interact');
      assert.doesNotMatch(g.messages.at(-1).text, /penuh/, `penuh saat mengambil ${pk.item}`);
      minFree = Math.min(minFree, freeSlots(g.inventory));
      order.push(pk.item);
      progress = true;
    }
    for (const gt of g.gates.values()) {
      const door = DOORS.find((d) => d.id === gt.id);
      if (gt.open || !door.between.some((r) => r && rooms.has(r)) || !g.inventory.items.some((s) => s.id === gt.key)) continue;
      tp(g, gt.x, gt.z + (door.axis === 'x' ? (gt.exit ? -0.8 : 0.8) : 0)); // sisi dalam: gerbang depan menghadap keluar mansion
      act(g, 'interact');
      assert.equal(gt.open, true, gt.id);
      order.push(`buka:${gt.id}`);
      progress = true;
      if (gt.exit) break;
    }
    if (g.exitOpen) break;
  }
  assert.ok(minFree >= 1, `selalu ada slot kosong (min ${minFree})`);
  assert.equal(g.exitOpen, true);
  for (const gt of g.gates.values()) assert.equal(gt.open, true, gt.id);
  assert.equal(g.pickups.length, 0, 'semua item terambil');
  assert.deepEqual(order.filter((o) => o.startsWith('buka:')), ['buka:lorong-pustaka', 'buka:lorong-dapur', 'buka:lobi-gudang', 'buka:gerbang']);
  // keluar lewat gerbang depan (selatan, x=18)
  tp(g, 18, 26, 0);
  const ev = run(g, 3, mv({ up: true }));
  assert.equal(g.state, 'won');
  assert.ok(ev.some((e) => e.type === 'won'));
  done();
});

test('menang hanya bila gerbang depan sudah dibuka; berdiri di luar tanpa itu tidak menang', () => {
  const { g, done } = fresh();
  g.zombies.length = 0;
  tp(g, 18, 29.5);
  g.update(DT, {});
  assert.equal(g.state, 'playing');
  g.exitOpen = true;
  g.update(DT, {});
  assert.equal(g.state, 'won');
  done();
});

test('gerak: tank maju dari lobi ke lorong dan kejadian ruangan + langkah muncul', () => {
  const { g, done } = fresh();
  g.zombies.length = 0;
  const ev = run(g, 8, mv({ up: true }));
  assert.equal(g.roomId, 'lorong');
  const room = ev.find((e) => e.type === 'room');
  assert.deepEqual([room.id, room.acoustic], ['lorong', 'corridor']);
  const steps = ev.filter((e) => e.type === 'step');
  assert.ok(steps.length >= 6);
  assert.ok(steps.some((s) => s.surface === 'tile'), 'lantai lobi ubin');
  assert.ok(steps.some((s) => s.surface === 'carpet'), 'lantai lorong karpet');
  done();
});

test('gerak: skema relatif kamera memakai kamera zona saat ini', () => {
  const { g, done } = fresh({ scheme: 'modern' });
  g.zombies.length = 0;
  tp(g, 18, 22, 0);
  const cam = camAt(18, 22, CAMS);
  const yaw = camYawOf(cam);
  const x0 = g.player.x;
  const z0 = g.player.z;
  run(g, 0.5, { intent: dig(0, 1) });
  const moved = Math.atan2(g.player.x - x0, g.player.z - z0);
  assert.ok(Math.abs(Math.atan2(Math.sin(moved - yaw), Math.cos(moved - yaw))) < 0.3, `bergerak ${moved.toFixed(2)} vs kamera ${yaw.toFixed(2)}`);
  done();
});

test('gerak: intent dibaca dari input (tank + keyboard) dan frozen membekukan semuanya', () => {
  const { g, done } = fresh();
  g.zombies.length = 0;
  const z0 = g.player.z;
  run(g, 1, { ...mv({ up: true }), frozen: true });
  assert.equal(g.player.z, z0);
  g.update(DT, { intent: keys({ up: true }), frozen: true, interact: true, fire: true });
  assert.equal(g.messages.length, 0, 'aksi diabaikan saat beku');
  run(g, 1, { intent: keys({ up: true }) });
  assert.ok(g.player.z < z0 - 1, 'maju ke utara (-z)');
  done();
});

test('tembak: butuh pistol, magasin kosong bunyi klik, isi ulang dari inventori', () => {
  const { g, done } = fresh();
  g.zombies.length = 0;
  act(g, 'fire');
  assert.match(g.messages.at(-1).text, /Belum punya senjata/);
  addItem(g.inventory, 'pistol', 1);
  g.weapon.mag = 0;
  act(g, 'fire');
  assert.match(g.messages.at(-1).text, /Magasin kosong/);
  act(g, 'reload');
  assert.match(g.messages.at(-1).text, /Tidak bisa mengisi ulang/);
  addItem(g.inventory, 'ammo', 5);
  const ev = act(g, 'reload');
  assert.deepEqual(ev.find((e) => e.type === 'reload'), { type: 'reload', n: 5 });
  assert.equal(g.weapon.mag, 5);
  assert.equal(countItem(g.inventory, 'ammo'), 0);
  done();
});

test('tembak: mengenai zombie di depan, mati setelah cukup tembakan, jeda antar tembakan, statistik tercatat', () => {
  const { g, done } = fresh();
  addItem(g.inventory, 'pistol', 1);
  tp(g, 18, 22, 0); // menghadap +z
  const z = loneWalker(18, 27, { dormant: false });
  g.zombies = [z];
  let ev = act(g, 'fire');
  assert.ok(ev.some((e) => e.type === 'shot'));
  assert.ok(ev.some((e) => e.type === 'hit'), 'kena');
  ev = act(g, 'fire');
  assert.equal(ev.some((e) => e.type === 'shot'), false, 'masih jeda antar tembakan');
  run(g, 0.6, {});
  z.state = 'idle';
  ev = act(g, 'fire');
  assert.ok(ev.some((e) => e.type === 'killed'));
  assert.equal(g.stats.kills, 1);
  assert.equal(g.stats.shots, 2);
  assert.equal(g.weapon.mag, ITEM_DEFS.pistol.magSize - 2);
  done();
});

test('tembak: dinding dan gerbang tertutup menahan peluru', () => {
  const { g, done } = fresh();
  addItem(g.inventory, 'pistol', 1);
  const gt = gateOf(g, 'lorong-pustaka');
  tp(g, gt.x, gt.z + 2, Math.PI); // menghadap utara ke gerbang tertutup
  const behind = loneWalker(gt.x, gt.z - 2.5);
  g.zombies = [behind];
  const ev = act(g, 'fire');
  assert.ok(ev.some((e) => e.type === 'shot'));
  assert.equal(ev.some((e) => e.type === 'hit' || e.type === 'killed'), false, 'terhalang gerbang');
  assert.equal(behind.hp, ZOMBIE_TYPES.walker.hp);
  done();
});

test('serangan zombie: nyawa berkurang, ada masa kebal singkat, pemain terdorong menjauh', () => {
  const { g, done } = fresh();
  tp(g, 18, 24, 0);
  const z = loneWalker(18, 24.9);
  z.state = 'chase';
  z.target = { x: 18, z: 24 };
  g.zombies = [z];
  const ev = run(g, 2, {});
  const hurts = ev.filter((e) => e.type === 'hurt');
  assert.ok(hurts.length >= 1, 'terkena serangan');
  assert.equal(hurts[0].dmg, ZOMBIE_TYPES.walker.dmg);
  assert.equal(g.player.hp, 100 - hurts.reduce((n, h) => n + h.dmg, 0));
  assert.ok(hurts.length <= 2, 'kebal 0.9 dtk membatasi laju serangan');
  assert.ok(g.player.z < 24 || g.player.x !== 18, 'terdorong');
  done();
});

test('masa kebal: dua zombie menyerang bersamaan hanya satu melukai selama masa kebal', () => {
  const { g, done } = fresh();
  tp(g, 18, 24, 0);
  const a = loneWalker(18, 24.9);
  const b = loneWalker(17.3, 24.4);
  for (const z of [a, b]) {
    z.state = 'chase';
    z.target = { x: 18, z: 24 };
  }
  g.zombies = [a, b];
  const ev = run(g, 2.1, {}); // serangan pertama ~1,3 dtk; kebal sampai ~2,2 dtk
  const attacks = ev.filter((e) => e.type === 'attack');
  const hurts = ev.filter((e) => e.type === 'hurt');
  assert.ok(attacks.length >= 2, `kedua zombie menyerang (${attacks.length})`);
  assert.equal(hurts.length, 1, 'serangan kedua jatuh di masa kebal');
  assert.equal(g.player.hp, 100 - ZOMBIE_TYPES.walker.dmg);
  done();
});

test('kalah: nyawa habis -> state lost, kejadian lost sekali, sesudahnya update tidak berbuat apa-apa', () => {
  const { g, done } = fresh();
  tp(g, 18, 24, 0);
  g.player.hp = 5;
  const z = loneWalker(18, 24.9);
  z.state = 'chase';
  z.target = { x: 18, z: 24 };
  g.zombies = [z];
  const ev = run(g, 3, {});
  assert.equal(g.state, 'lost');
  assert.equal(g.player.dead, true);
  assert.equal(ev.filter((e) => e.type === 'lost').length, 1);
  const t = g.time;
  assert.deepEqual(g.update(DT, keys({ up: true })), []);
  assert.equal(g.time, t);
  done();
});

test('pemulihan: tonik menambah nyawa, tidak terpakai bila nyawa penuh', () => {
  const { g, done } = fresh();
  addItem(g.inventory, 'tonik', 2);
  let ev = act(g, 'heal');
  assert.match(g.messages.at(-1).text, /perlu dipulihkan/);
  assert.equal(countItem(g.inventory, 'tonik'), 2);
  g.player.hp = 50;
  ev = act(g, 'heal');
  assert.equal(g.player.hp, 50 + itemDef('tonik').heal);
  assert.ok(ev.some((e) => e.type === 'heal'));
  assert.equal(countItem(g.inventory, 'tonik'), 1);
  done();
});

test('pesan menua dan hilang; sesudah menang pesan tetap menua', () => {
  const { g, done } = fresh();
  g.say('halo');
  run(g, 1, {});
  assert.equal(g.messages.length, 1);
  g.state = 'won';
  g.update(4, {});
  assert.equal(g.messages.length, 0);
  done();
});

test('keseimbangan: peluru di denah cukup untuk sebagian besar zombie, tidak berlebihan', () => {
  const ammo = ITEMS.filter((i) => i.item === 'ammo').reduce((n, i) => n + i.qty, 0);
  const shotsToKillAll = SPAWNS.reduce((n, s) => n + Math.ceil(ZOMBIE_TYPES[s.type].hp / GAME.damage), 0);
  assert.ok(ammo >= Math.ceil(shotsToKillAll * 0.7), `peluru ${ammo} vs butuh ${shotsToKillAll}`);
  assert.ok(ammo <= shotsToKillAll * 2, 'tidak berlebihan');
  assert.ok(ITEMS.filter((i) => i.item === 'tonik').length >= 2);
});

test('game deterministik: rng yang sama + input yang sama = hasil yang sama', () => {
  const play = () => {
    const { g, done } = fresh();
    const ev = run(g, 6, mv({ up: true }));
    const out = JSON.stringify([g.player.x.toFixed(4), g.player.z.toFixed(4), ev.length, g.zombies.map((z) => [z.x.toFixed(3), z.z.toFixed(3), z.state])]);
    done();
    return out;
  };
  assert.equal(play(), play());
});

test('semua jenis kejadian yang dipancarkan punya bentuk yang dikenal (kontrak untuk index.js)', () => {
  const { g, done } = fresh();
  const seen = new Set();
  const collect = (evs) => evs.forEach((e) => seen.add(e.type));
  collect(run(g, 8, mv({ up: true })));
  tp(g, item('pistol').x, item('pistol').z);
  collect(act(g, 'interact'));
  for (const t of seen) assert.match(t, /^(step|room|pickup|gate|shot|reload|heal|hurt|won|lost|notice|attack|miss|dead|hit|killed)$/, t);
  assert.ok(seen.has('step') && seen.has('room') && seen.has('pickup'));
  assert.ok(MANSION_RECT.length === 4);
  done();
});
