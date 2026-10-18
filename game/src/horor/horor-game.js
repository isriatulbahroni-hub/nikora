// Logika permainan Mansion Horor tanpa render (tanpa THREE/DOM): gerak ala tank, ambil item, gerbang berkunci,
// tembak, zombie, menang/kalah. index.js hanya menggambar state ini dan meneruskan input.
//
// Konvensi: rot = 0 menghadap +z (selatan), maju = (sin rot, cos rot); rot bertambah = belok ke kiri.
// input per frame: { turn: -1..1 (+ = kanan), move: -1..1 (+ = maju), run, interact, fire, reload, heal } (empat terakhir = tepi, sekali tekan).
import { moveCircleWithColliders } from './vendor/collision.js';
import { inRect } from './horor-core.js';
import { createNavWorld } from './horor-nav.js';
import { MANSION, roomAt } from './horor-layout.js';
import {
  addItem, createInventory, createPlayer, createWeapon, damagePlayer, fireWeapon, hasItem, itemDef, reloadWeapon, removeItem, tickWeapon, useHeal,
} from './horor-rules.js';
import { createZombie, hearNoise, hitZombie, raycastZombies, updateZombie } from './horor-zombie.js';

export const PLAYER = Object.freeze({ r: 0.28, turn: 2.6, walk: 1.9, run: 3.0, back: 0.9, hurtInv: 0.9, pickupR: 1.1, gateR: 1.9, shotRange: 14, damage: 2 });

/** layout: MANSION; room: Room hasil buildMansion(); gates: peta id -> gerbang dari buildMansion(). */
export function createGame(layout, room, gates, { rng = Math.random } = {}) {
  const nav = createNavWorld(room, layout.size);
  const player = Object.assign(createPlayer(), { x: layout.start.x, z: layout.start.z, rot: layout.start.rot ?? 0, invT: 0 });
  const g = {
    layout, room, nav, rng, player,
    inventory: createInventory(),
    weapon: createWeapon(),
    zombies: layout.zombies.map((s) => createZombie(s)),
    pickups: layout.pickups.map((p) => ({ ...p, qty: p.qty ?? 1 })),
    gates: new Map(layout.gates.map((gt) => [gt.id, { ...gt, ...gates[gt.id], open: false }])),
    state: 'playing', // playing | won | lost
    time: 0,
    roomId: roomAt(layout, layout.start.x, layout.start.z)?.id ?? null,
    messages: [],
    stats: { shots: 0, kills: 0 },
  };
  const say = (text) => g.messages.push({ text, ttl: 3.2 });
  g.say = say;
  g.armed = () => hasItem(g.inventory, 'pistol');

  function interact(ev) {
    const p = g.player;
    let pk = null;
    let best = PLAYER.pickupR;
    for (const it of g.pickups) {
      const d = Math.hypot(it.x - p.x, it.z - p.z);
      if (d < best) { best = d; pk = it; }
    }
    if (pk) {
      const def = itemDef(pk.item);
      const { added, left } = addItem(g.inventory, pk.item, pk.qty);
      if (added === 0) return say('Inventori penuh.');
      pk.qty = left;
      if (left === 0) g.pickups.splice(g.pickups.indexOf(pk), 1);
      say(`Mengambil ${def.name}${added > 1 ? ` x${added}` : ''}.`);
      ev.push({ type: 'pickup', item: pk.item, id: pk.id });
      return undefined;
    }
    let gate = null;
    let gd = PLAYER.gateR;
    for (const gt of g.gates.values()) {
      if (gt.open) continue;
      const d = Math.hypot(gt.x - p.x, gt.z - p.z);
      if (d < gd) { gd = d; gate = gt; }
    }
    if (!gate) return say('Tidak ada yang bisa dipakai di sini.');
    if (!hasItem(g.inventory, gate.key)) return say(gate.label);
    removeItem(g.inventory, gate.key, 1);
    gate.open = true;
    g.room.setShutter(gate.id, false, true);
    g.nav.refresh();
    say('Gerbang terbuka.');
    ev.push({ type: 'gate', id: gate.id });
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
    const hit = raycastZombies(p.x, p.z, p.rot, PLAYER.shotRange, g.zombies, g.nav.boxes);
    if (hit) {
      for (const e of hitZombie(hit.zombie, PLAYER.damage, { fromX: p.x, fromZ: p.z, kb: 2 })) {
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

    p.rot -= (input.turn ?? 0) * PLAYER.turn * dt;
    const mv = input.move ?? 0;
    const speed = mv > 0 ? (input.run ? PLAYER.run : PLAYER.walk) * mv : PLAYER.back * mv; // mundur: mv negatif membalik arah
    if (speed !== 0) {
      [p.x, p.z] = moveCircleWithColliders(p.x, p.z, Math.sin(p.rot) * speed * dt, Math.cos(p.rot) * speed * dt, PLAYER.r, g.nav.boxes);
    }
    if (input.interact) interact(ev);
    if (input.fire) fire(ev);
    if (input.reload) {
      const n = g.armed() ? reloadWeapon(g.weapon, g.inventory) : 0;
      if (n > 0) { say(`Mengisi ${n} peluru.`); ev.push({ type: 'reload', n }); } else say('Tidak bisa mengisi ulang.');
    }
    if (input.heal) {
      const r = useHeal(g.inventory, p);
      if (r.ok) { say(`Pulih ${r.healed}.`); ev.push({ type: 'heal', n: r.healed }); } else say('Tidak ada yang perlu dipulihkan.');
    }

    for (const z of g.zombies) {
      for (const e of updateZombie(z, dt, { player: p, boxes: g.nav.boxes, grid: g.nav.grid, rand: rng })) {
        ev.push(e);
        if (e.type === 'attack' && p.invT <= 0 && !p.dead) {
          damagePlayer(p, e.dmg);
          p.invT = PLAYER.hurtInv;
          ev.push({ type: 'hurt', dmg: e.dmg, hp: p.hp });
          const dx = p.x - z.x;
          const dz = p.z - z.z;
          const d = Math.hypot(dx, dz) || 1;
          [p.x, p.z] = moveCircleWithColliders(p.x, p.z, (dx / d) * 0.5, (dz / d) * 0.5, PLAYER.r, g.nav.boxes);
        }
      }
      const minD = z.T.r + PLAYER.r;
      const d = Math.hypot(p.x - z.x, p.z - z.z);
      if (d < minD && d > 1e-3 && z.state !== 'dead') { // zombie tidak boleh menumpuk di atas pemain
        const k = (minD - d) / d;
        [z.x, z.z] = moveCircleWithColliders(z.x, z.z, -(p.x - z.x) * k, -(p.z - z.z) * k, z.T.r, g.nav.boxes);
      }
    }
    g.roomId = roomAt(g.layout, p.x, p.z)?.id ?? g.roomId;
    if (p.dead) {
      g.state = 'lost';
      ev.push({ type: 'lost' });
    } else if (inRect(p.x, p.z, g.layout.exit.rect)) {
      g.state = 'won';
      ev.push({ type: 'won', time: g.time });
    }
    return ev;
  };
  return g;
}

export { MANSION };
