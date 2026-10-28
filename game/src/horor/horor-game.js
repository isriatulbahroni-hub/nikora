// Logika permainan Mansion Horor tanpa render (tanpa THREE/DOM): gerak, ambil item, gerbang berkunci, tembak, zombie,
// menang/kalah. horor/index.js hanya menggambar state ini dan meneruskan input.
//
// Diadaptasi dari fitur/horor-game (commit 176cad7, tidak pernah masuk main) ke denah dan gerak yang sekarang ada:
//   - data dari horor-layout.js (ROOMS, SPAWNS, kamera tetap) dan `spots` hasil buildMansion() (item dan gerbang);
//   - gerak lewat stepPlayer (horor-player.js): dua skema kontrol (tank / relatif kamera), siklus langkah, tabrakan;
//   - gerbang memakai room.setShutter() yang sudah ada.
// Logika ambil item, gerbang, tembak, serangan zombie, dan menang/kalah tetap dari versi lama.
//
// Konvensi: rot 0 menghadap +z, maju = (sin rot, cos rot); rot bertambah = belok ke kiri.
// Satu langkah:  const events = game.update(dt, input)
//   input = { intent, scheme?, frozen?, interact?, fire?, reload?, heal? }
//     intent = createHororInput().intent() (x, y, mag, analog, up/down/left/right, run); empat aksi terakhir = tepi (sekali tekan).
//   events = [{ type: 'step' | 'room' | 'pickup' | 'gate' | 'shot' | 'reload' | 'heal' | 'hurt' | 'won' | 'lost' | kejadian zombie }]
import { moveCircleWithColliders } from './vendor/collision.js';
import { CAMS, MANSION_RECT, PLAYER_START, SPAWNS, camAt, roomAt } from './horor-layout.js';
import { createNavWorld } from './horor-nav.js';
import { camYawOf, createPlayer as createBody, normalizeScheme, stepPlayer } from './horor-player.js';
import {
  addItem, createInventory, createPlayer as createVitals, createWeapon, damagePlayer, fireWeapon, hasItem, itemDef, reloadWeapon,
  removeItem, tickWeapon, useHeal,
} from './horor-rules.js';
import { createZombie, hearNoise, hitZombie, raycastZombies, updateZombie } from './horor-zombie.js';

export const GAME = Object.freeze({ hurtInv: 0.9, hurtKnock: 1.8, pickupR: 1.1, gateR: 1.9, shotRange: 14, damage: 2, exitMargin: 0.4 });

/** Akustik suara per ruangan (kunci ACOUSTICS di horor-audio.js). */
export const ACOUSTICS = Object.freeze({
  lorong: 'corridor', lobi: 'hall', gudang: 'hall', dapur: 'tile', perpustakaan: 'room', ruang_kerja: 'room', ruang_makan: 'room',
});

const IDLE = Object.freeze({ x: 0, y: 0, mag: 0, analog: false, up: false, down: false, left: false, right: false, run: false });

/**
 * @param {import('./horor-room.js').Room} room  Hasil buildMansion() (memuat `spots`, `colliders`, `shutters`)
 * @param {object} [o]
 * @param {() => number} [o.rng]  Pembangkit acak 0..1 (uji: deterministik)
 * @param {'tank'|'modern'} [o.scheme]
 * @param {readonly object[]} [o.spawns]  Titik muncul zombie (default SPAWNS)
 */
export function createGame(room, { rng = Math.random, scheme = 'tank', spawns = SPAWNS } = {}) {
  const nav = createNavWorld(room, MANSION_RECT);
  const player = Object.assign(createBody(PLAYER_START), createVitals(), { invT: 0 });
  const startRoom = roomAt(PLAYER_START.x, PLAYER_START.z);
  const g = {
    room, nav, rng, player, scheme: normalizeScheme(scheme),
    inventory: createInventory(),
    weapon: createWeapon(),
    zombies: spawns.map((s) => createZombie(s)),
    pickups: room.spots.filter((s) => s.kind === 'item').map((s) => ({ id: s.id, item: s.item, qty: s.qty ?? 1, x: s.x, z: s.z, room: s.room, mesh: s.mesh })),
    gates: new Map(room.spots.filter((s) => s.kind === 'gate').map((s) => [s.id, { id: s.id, x: s.x, z: s.z, key: s.lock, exit: !!s.exit, open: false }])),
    state: 'playing', // playing | won | lost
    time: 0,
    exitOpen: false,
    roomId: startRoom?.id ?? null,
    acoustic: ACOUSTICS[startRoom?.id] ?? 'room',
    camera: camAt(PLAYER_START.x, PLAYER_START.z, CAMS),
    messages: [],
    stats: { shots: 0, kills: 0 },
  };
  const say = (text) => g.messages.push({ text, ttl: 3.2 });
  g.say = say;
  g.armed = () => hasItem(g.inventory, 'pistol');

  const nearest = (list, r, p) => {
    let best = null;
    let bd = r;
    for (const it of list) {
      const d = Math.hypot(it.x - p.x, it.z - p.z);
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  };
  const gateLabel = (gt) => `Terkunci. Butuh ${itemDef(gt.key)?.name ?? 'kunci'}.`;

  /** Yang akan terjadi bila pemain menekan Aksi sekarang: { kind, id, label } atau null (dipakai HUD). */
  g.target = () => {
    const p = g.player;
    const pk = nearest(g.pickups, GAME.pickupR, p);
    if (pk) {
      const def = itemDef(pk.item);
      return { kind: 'pickup', id: pk.id, label: `Ambil ${def.name}${pk.qty > 1 ? ` x${pk.qty}` : ''}` };
    }
    const gt = nearest([...g.gates.values()].filter((x) => !x.open), GAME.gateR, p);
    if (gt) return { kind: 'gate', id: gt.id, label: hasItem(g.inventory, gt.key) ? 'Buka gerbang' : gateLabel(gt) };
    return null;
  };

  function interact(ev) {
    const p = g.player;
    const pk = nearest(g.pickups, GAME.pickupR, p);
    if (pk) {
      const def = itemDef(pk.item);
      const { added, left } = addItem(g.inventory, pk.item, pk.qty);
      if (added === 0) return say('Inventori penuh.');
      pk.qty = left;
      if (left === 0) {
        g.pickups.splice(g.pickups.indexOf(pk), 1);
        if (pk.mesh) pk.mesh.visible = false;
      }
      say(`Mengambil ${def.name}${added > 1 ? ` x${added}` : ''}.`);
      ev.push({ type: 'pickup', item: pk.item, id: pk.id });
      return undefined;
    }
    const gate = nearest([...g.gates.values()].filter((x) => !x.open), GAME.gateR, p);
    if (!gate) return say('Tidak ada yang bisa dipakai di sini.');
    if (!hasItem(g.inventory, gate.key)) return say(gateLabel(gate));
    removeItem(g.inventory, gate.key, 1);
    gate.open = true;
    if (gate.exit) g.exitOpen = true;
    g.room.setShutter(gate.id, false, true);
    g.nav.refresh();
    say(gate.exit ? 'Gerbang depan terbuka. Keluar!' : 'Gerbang terbuka.');
    ev.push({ type: 'gate', id: gate.id, exit: gate.exit });
    return undefined;
  }

  function fire(ev) {
    const p = g.player;
    if (!g.armed()) return say('Belum punya senjata.');
    const r = fireWeapon(g.weapon);
    if (r.empty) return say('Magasin kosong. Isi ulang.');
    if (!r.fired) return undefined;
    g.stats.shots += 1;
    ev.push({ type: 'shot' });
    const hit = raycastZombies(p.x, p.z, p.rot, GAME.shotRange, g.zombies, g.nav.boxes);
    if (hit) {
      for (const e of hitZombie(hit.zombie, GAME.damage, { fromX: p.x, fromZ: p.z, kb: 2 })) {
        ev.push(e);
        if (e.type === 'killed') g.stats.kills += 1;
      }
    }
    for (const z of g.zombies) hearNoise(z, p.x, p.z, r.noise);
    return undefined;
  }

  g.update = (dt, input = {}) => {
    const ev = [];
    for (const m of g.messages) m.ttl -= dt;
    g.messages = g.messages.filter((m) => m.ttl > 0);
    if (g.state !== 'playing') return ev;
    g.time += dt;
    const p = g.player;
    p.invT = Math.max(0, p.invT - dt);
    tickWeapon(g.weapon, dt);

    // gerak: kamera tetap menentukan arah "atas" pada skema relatif kamera
    g.camera = camAt(p.x, p.z, CAMS) ?? g.camera;
    const intent = input.intent ?? IDLE;
    const res = stepPlayer(p, intent, dt, {
      colliders: g.room.colliders,
      floorY: (x, z) => g.room.floorY(x, z),
      scheme: normalizeScheme(input.scheme ?? g.scheme),
      camYaw: camYawOf(g.camera),
      frozen: !!input.frozen,
    });
    if (res.stepped) ev.push({ type: 'step', surface: roomAt(p.x, p.z)?.surface ?? 'wood', amp: res.amp, run: !!intent.run });

    if (!input.frozen) {
      if (input.interact) interact(ev);
      if (input.fire) fire(ev);
      if (input.reload) {
        const n = g.armed() ? reloadWeapon(g.weapon, g.inventory) : 0;
        if (n > 0) {
          say(`Mengisi ${n} peluru.`);
          ev.push({ type: 'reload', n });
        } else say('Tidak bisa mengisi ulang.');
      }
      if (input.heal) {
        const r = useHeal(g.inventory, p);
        if (r.ok) {
          say(`Pulih ${r.healed}.`);
          ev.push({ type: 'heal', n: r.healed });
        } else say('Tidak ada yang perlu dipulihkan.');
      }
    }

    for (const z of g.zombies) {
      for (const e of updateZombie(z, dt, { player: p, boxes: g.nav.boxes, grid: g.nav.grid, rand: rng })) {
        ev.push(e);
        if (e.type === 'attack' && p.invT <= 0 && !p.dead) {
          damagePlayer(p, e.dmg);
          p.invT = GAME.hurtInv;
          ev.push({ type: 'hurt', dmg: e.dmg, hp: p.hp });
          const dx = p.x - z.x;
          const dz = p.z - z.z;
          const d = Math.hypot(dx, dz) || 1;
          p.kx = (dx / d) * GAME.hurtKnock; // meluruh di stepPlayer; tabrakan dinding tetap berlaku
          p.kz = (dz / d) * GAME.hurtKnock;
        }
      }
      const minD = z.T.r + p.r;
      const d = Math.hypot(p.x - z.x, p.z - z.z);
      if (d < minD && d > 1e-3 && z.state !== 'dead') { // zombie tidak boleh menumpuk di atas pemain
        const k = (minD - d) / d;
        [z.x, z.z] = moveCircleWithColliders(z.x, z.z, -(p.x - z.x) * k, -(p.z - z.z) * k, z.T.r, g.nav.boxes);
      }
    }

    const here = roomAt(p.x, p.z);
    if (here && here.id !== g.roomId) {
      g.roomId = here.id;
      g.acoustic = ACOUSTICS[here.id] ?? 'room';
      ev.push({ type: 'room', id: here.id, name: here.name, acoustic: g.acoustic });
    }
    if (p.dead) {
      g.state = 'lost';
      ev.push({ type: 'lost' });
    } else if (g.exitOpen && p.z > MANSION_RECT[3] + GAME.exitMargin) {
      g.state = 'won';
      ev.push({ type: 'won', time: g.time });
    }
    return ev;
  };
  return g;
}
