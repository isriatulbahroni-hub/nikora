import * as THREE from 'three';
import { BOUNDS as VILLA_BOUNDS } from './villa-layout.js';
import { GATES, HIGHWAY_LIMIT } from './highway.js';
import { ROAD, SEGMENTS, buildJourney, clamp, frameAt, nearestOnRoute, segmentAt, terrainHeight, timeAt } from './journey.js';
import { ARRIVE_WITHIN, targetSpeed } from './journey-drive.js';
import { FOG_FAR, createJourneyWorld } from './journey-world.js';
import { alongOf, endPoint, gatePsi, localToWorld, planeBeyond, planeBehind, poseAt, startCheck, villaAnchor, worldToLocal } from './hotel-journey-math.js';

// Lorong perjalanan 20+ menit di DALAM dunia hotel (satu halaman, satu dunia): jalan raya hotel -> gerbang -> lorong perjalanan (journey.js) -> tempat acara.
// Tiap tempat acara punya lorongnya sendiri, dipasang di gerbang jalan raya (hotel-journey-math.js): titik awal rute = titik gerbang, diputar menurut
// arah keluar gerbang. Bentuk rute (tikungan, bukit, jembatan, danau) tidak diubah sedikit pun; tidak ada pindah halaman.
//
// PEMAIN MENGEMUDI SENDIRI (setir dan gas, tidak ada autopilot). Yang dijaga lorong ini: (1) kecepatan dibatasi seperti autopilot lama (kecepatan bagian
// dan tikungan, melambat sebelum area penurunan), jadi menempuh rute tidak mungkin kurang dari ±20 menit; (2) mobil tidak keluar dari lorong
// (pagar tak terlihat di bahu jalan); (3) permukaan di luar aspal berlaku seperti tanah (lebih lambat). Mobil tetap di y = 0 dan seluruh dunia
// perjalanan digeser vertikal mengikuti tinggi medan di bawah pemain (hanya dunia perjalanan; hotel tetap), jadi fisika mobil, kursi, dan kamera
// hotel dipakai apa adanya. Di ujung rute villa dipasang (hotel-villa.js) dan bisa dimasuki langsung; tempat acara lain masih memakai halaman
// sendiri lewat tombol "Masuk" (tahap berikutnya: dipasang di ujung rute seperti villa).
const PRELOAD = 300; // dunia perjalanan sebuah gerbang dibangun saat pemain sedekat ini (m)
const KEEP = 460; // ... dan dibuang saat pemain menjauh dari sini
const ROAM = 30; // radius jalan kaki bebas di sekitar ujung rute (tempat acara selain villa)
const ANCHOR_BEFORE = 380; // villa dipasang saat sisa rute sependek ini (jalan sudah datar sepanjang itu)
const BOUND = ROAD.half + 5; // pagar tak terlihat: geseran samping terbesar dari sumbu jalan (m)
const BIG = Object.freeze({ minX: -60000, maxX: 60000, minZ: -60000, maxZ: 60000 }); // batas dunia mobil selama perjalanan

const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const toPlane = (p) => new THREE.Plane(new THREE.Vector3(p.nx, 0, p.nz), p.c);
const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };

/**
 * Titik dunia (x, z) terhadap lorong: s = jarak di sepanjang rute, d = geseran samping (+ = kiri), out = melewati pagar tak terlihat,
 * (x, z) = titik itu ditarik kembali ke pagar bila out. l dan r dipakai ulang untuk tinggi medan.
 */
function corridor(gate, j, x, z) {
  const l = worldToLocal(gate, x, z);
  const r = nearestOnRoute(j, l.x, l.z);
  const f = frameAt(j, r.s);
  const d = (l.x - f.x) * Math.cos(f.heading) - (l.z - f.z) * Math.sin(f.heading);
  const out = Math.abs(d) > BOUND;
  let wx = x;
  let wz = z;
  if (out) {
    const side = Math.sign(d);
    const w = localToWorld(gate, f.x + Math.cos(f.heading) * side * BOUND, f.z - Math.sin(f.heading) * side * BOUND);
    wx = w.x;
    wz = w.z;
  }
  return { s: r.s, d, out, x: wx, z: wz, l, r };
}

/** Buang bangunan SEMENTARA di area kedatangan (diganti tempat acara sungguhan): grup yang posisi dan arahnya = ujung rute. */
function dropArrivalPlaceholder(group, j) {
  const e = frameAt(j, j.length);
  let best = null;
  let bd = Infinity;
  for (const c of group.children) {
    if (!c.isGroup) continue;
    const d = Math.hypot(c.position.x - e.x, c.position.z - e.z);
    if (d < bd && Math.abs(c.rotation.y - e.heading) < 1e-6) {
      bd = d;
      best = c;
    }
  }
  if (!best || bd > 1e-3) return;
  group.remove(best);
  best.traverse((o) => {
    o.geometry?.dispose?.();
    const m = o.material;
    for (const mm of Array.isArray(m) ? m : m ? [m] : []) { mm.map?.dispose?.(); mm.dispose?.(); }
  });
}

/**
 * Potong semua bahan dunia perjalanan di belakang gerbang (sisi hotel), supaya tidak menimpa tanah dan jalan hotel. Sekaligus mengangkat
 * kecerahan aspal dan tanah: bahan standar yang gelap menjadi hampir hitam di bawah cahaya senja/malam hotel (aspal tampak hitam polos).
 */
function prepareMaterials(group, planes) {
  group.traverse((o) => {
    const m = o.material;
    for (const mm of Array.isArray(m) ? m : m ? [m] : []) {
      if (mm.userData.hjClip) continue;
      mm.clippingPlanes = planes;
      mm.userData.hjClip = true;
      if (mm.vertexColors && mm.emissive) {
        if (mm.polygonOffset) mm.emissive.setHex(0x2a2c31); // aspal, bahu, dan marka
        else mm.emissive.setHex(0x14240f); // tanah
      }
      mm.needsUpdate = true;
    }
  });
}

/**
 * scene: THREE.Scene hotel; villa: createHotelVilla(); approach: VILLA_APPROACH; search: location.search (?kecepatan=1..20 hanya untuk menguji);
 * enterUrl(gate): alamat halaman tempat acara (null = tempat acara ada di dunia ini); onReturn(gate): pemanggil memindahkan pemain kembali ke hotel.
 */
export function createHotelJourney({ scene, villa, approach, search = '', enterUrl = () => null, onReturn = () => {} }) {
  const timeScale = Math.min(20, Math.max(1, Number(new URLSearchParams(search).get('kecepatan')) || 1));
  const worlds = new Map(); // id gerbang -> { gate, j, world, planes, clipDirty }
  let state = 'idle'; // idle | riding | arrived
  let ride = null; // { w, gate, j, s, d, car, anchored, loadPending }
  let ui = null;
  let fog = null;
  let baseFog = null;
  let groundKey = '';

  function ensureWorld(gate) {
    let w = worlds.get(gate.id);
    if (w) return w;
    const j = buildJourney(gate.id);
    const world = createJourneyWorld(j, { shadows: false });
    world.group.position.set(gate.x, 0, gate.z);
    world.group.rotation.y = gatePsi(gate);
    if (gate.id === 'villa') dropArrivalPlaceholder(world.group, j);
    scene.add(world.group);
    w = { gate, j, world, planes: [toPlane(planeBeyond(gate))], clipDirty: true };
    worlds.set(gate.id, w);
    return w;
  }

  function disposeWorld(id) {
    const w = worlds.get(id);
    if (!w) return;
    scene.remove(w.world.group);
    w.world.dispose();
    w.world.group.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.isInstancedMesh) o.dispose?.();
    });
    worlds.delete(id);
  }

  // ---------------------------------------------------------------- HUD perjalanan (dibuat sekali, tanpa mengubah hotel.html)
  // Kecil dan diletakkan DI BAWAH deretan tombol HUD hotel (judul, Jelajah, Kamera, Peta), supaya tidak menutupinya.
  function buildUi() {
    if (ui || typeof document === 'undefined') return;
    const box = document.createElement('div');
    box.id = 'journey-hud';
    Object.assign(box.style, {
      position: 'fixed', left: '50%', transform: 'translateX(-50%)', top: 'calc(env(safe-area-inset-top, 0px) + 108px)', zIndex: '29',
      width: 'min(92vw, 380px)', padding: '6px 10px', borderRadius: '12px', background: 'rgba(20,18,12,0.72)', color: '#f5e6b0',
      font: '600 12px system-ui, sans-serif', display: 'none', boxSizing: 'border-box', border: '1px solid rgba(212,175,55,0.45)',
    });
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;justify-content:space-between;gap:8px;align-items:baseline';
    const title = document.createElement('span');
    title.style.cssText = 'font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    const eta = document.createElement('span');
    eta.style.cssText = 'opacity:.85;white-space:nowrap';
    head.append(title, eta);
    const part = document.createElement('div');
    part.style.cssText = 'opacity:.7;font-size:11px;margin:1px 0 4px';
    const track = document.createElement('div');
    track.style.cssText = 'height:4px;border-radius:2px;background:rgba(255,255,255,.18);overflow:hidden';
    const bar = document.createElement('div');
    bar.style.cssText = 'height:100%;width:0;background:#d4af37';
    track.appendChild(bar);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;margin-top:6px;flex-wrap:wrap';
    const mk = (label, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'flex:1;min-width:96px;padding:6px 8px;border-radius:9px;border:1px solid rgba(212,175,55,.75);background:rgba(40,34,20,.9);color:#f5e6b0;font:600 12px system-ui,sans-serif;cursor:pointer';
      b.addEventListener('click', fn);
      row.appendChild(b);
      return b;
    };
    const skip = mk('⏭ Lewati', () => {
      if (!ride || state !== 'riding' || !ride.car) return;
      const p = poseAt(ride.gate, ride.j, ride.j.length - 320); // loncat ke dekat area penurunan (pengujian dan tamu yang sudah pernah lewat)
      ride.car.x = p.x;
      ride.car.z = p.z;
      ride.car.heading = p.heading;
      ride.car.speed = Math.min(Math.abs(ride.car.speed), 8);
    });
    const enter = mk('Masuk', () => {
      const url = ride ? enterUrl(ride.gate) : null;
      if (url) window.location.href = url;
    });
    const back = mk('Kembali ke hotel', () => { if (ride) onReturn(ride.gate); });
    box.append(head, part, track, row);
    document.body.appendChild(box);
    ui = { box, title, part, eta, bar, skip, enter, back };
  }

  function renderUi() {
    if (!ui) return;
    if (!ride || state === 'idle') {
      ui.box.style.display = 'none';
      return;
    }
    ui.box.style.display = 'block';
    const { j, gate, s } = ride;
    if (state === 'riding') {
      const seg = segmentAt(j, s);
      setText(ui.title, seg.name);
      setText(ui.part, `${gate.label} · Bagian ${j.bounds.indexOf(seg) + 1}/${SEGMENTS.length}`);
      setText(ui.eta, `Sisa ± ${fmt(Math.max(0, j.duration - timeAt(j, s)))}`);
      ui.bar.style.width = `${(s / j.length) * 100}%`;
      ui.skip.style.display = s > j.length - 400 || !ride.car ? 'none' : 'block';
      ui.enter.style.display = 'none';
    } else {
      setText(ui.title, `Tiba di ${gate.label}`);
      setText(ui.part, 'Area penurunan tamu');
      setText(ui.eta, 'Tiba');
      ui.bar.style.width = '100%';
      ui.skip.style.display = 'none';
      const url = enterUrl(gate);
      ui.enter.style.display = url ? 'block' : 'none';
      setText(ui.enter, `Masuk ke ${gate.label}`);
    }
    ui.back.style.display = 'block';
  }

  // ---------------------------------------------------------------- langkah perjalanan (pemain mengemudi sendiri)
  function stepRideFrame(delta, driving, me) {
    if (!ride) return;
    const { j, gate, w } = ride;
    ride.car = driving ?? null;
    const src = driving ?? me; // mobil bila mengemudi, selain itu pemain yang berjalan kaki di lorong
    const c = corridor(gate, j, src.x, src.z);
    ride.s = clamp(c.s, 0, j.length);
    ride.d = c.d;
    if (state === 'riding' && driving) {
      if (c.out) { // pagar tak terlihat di bahu jalan: mobil tertahan dan melambat
        driving.x = c.x;
        driving.z = c.z;
        driving.speed *= 0.7;
      }
      // kecepatan dibatasi seperti autopilot lama: menempuh seluruh rute tidak mungkin kurang dari ±20 menit
      const cap = targetSpeed(j, ride.s) * timeScale;
      if (driving.speed > cap) driving.speed = Math.max(cap, driving.speed - 14 * delta);
      if (ride.s >= j.length - ARRIVE_WITHIN && Math.abs(driving.speed) < 0.5) state = 'arrived';
    }
    // dunia perjalanan digeser vertikal mengikuti tinggi medan di bawah pemain (mobil dan pemain tetap di y = 0); setelah villa dipasang, tetap
    const yTarget = ride.anchored ? -frameAt(j, j.length).y : -terrainHeight(j, c.l.x, c.l.z, c.r);
    const g = w.world.group;
    g.position.y += (yTarget - g.position.y) * (1 - Math.exp(-10 * delta));
    // villa dipasang di ujung rute saat jalan sudah datar dan dekat (dimuat satu frame kemudian supaya tidak menumpuk)
    if (gate.id === 'villa') {
      if (!ride.anchored && ride.s >= j.length - ANCHOR_BEFORE) {
        g.position.y = -frameAt(j, j.length).y;
        villa.anchor(villaAnchor(gate, j, VILLA_BOUNDS.maxZ, approach));
        ride.anchored = true;
        ride.loadPending = true;
      } else if (ride.loadPending) {
        villa.load();
        ride.loadPending = false;
      }
    }
  }

  return {
    get state() { return state; },
    get riding() { return state === 'riding'; },
    get arrived() { return state === 'arrived'; },
    get gate() { return ride?.gate ?? null; },

    /** Masuk lorong dari gerbang `gate` dengan mobil yang sedang dikemudikan `car` (objek Fleet). Mengembalikan { ok } atau { ok: false, reason }. */
    start(gate, car) {
      if (state !== 'idle') return { ok: false, reason: 'Perjalanan sedang berlangsung.' };
      const chk = startCheck(gate, car);
      if (!chk.ok) return chk;
      buildUi();
      const w = ensureWorld(gate);
      ride = { w, gate, j: w.j, s: Math.max(0, chk.s), d: 0, car, anchored: false, loadPending: false };
      state = 'riding';
      renderUi();
      return { ok: true };
    },

    /** Akhiri perjalanan (kembali ke hotel): villa dibongkar, dunia perjalanan kembali ke tinggi hotel. */
    finish() {
      if (ride) {
        ride.w.world.group.position.y = 0;
        if (villa.anchored) villa.release();
      }
      ride = null;
      state = 'idle';
      if (ui) ui.box.style.display = 'none';
    },

    /** Dipanggil tiap frame setelah mobil pemain melangkah. driving = mobil yang dikemudikan pemain (atau null). */
    update({ delta, camera, me, driving }) {
      if (state === 'idle') {
        for (const g of GATES) {
          const d = Math.hypot(me.x - g.x, me.z - g.z);
          if (d < PRELOAD) ensureWorld(g);
          else if (d > KEEP && worlds.has(g.id)) disposeWorld(g.id);
        }
      } else stepRideFrame(delta, driving, me);
      for (const w of worlds.values()) {
        const cl = worldToLocal(w.gate, camera.position.x, camera.position.z);
        const s = ride && ride.w === w ? ride.s : alongOf(w.gate, camera.position.x, camera.position.z).s;
        const built = w.world.ensure({ x: cl.x, z: cl.z }, clamp(s, 0, w.j.length), 2);
        if (built || w.clipDirty) {
          prepareMaterials(w.world.group, w.planes);
          w.clipDirty = false;
        }
      }
      renderUi();
    },

    /** Batas dunia mobil: lebar selama perjalanan dan setelah tiba, bawaan jalan raya hotel selain itu. Mengubah objek `limit` (dipakai Fleet). */
    syncLimit(limit) {
      Object.assign(limit, state === 'idle' ? HIGHWAY_LIMIT : BIG);
    },

    /**
     * Permukaan untuk fisika mobil (menggantikan surfaceAt hotel yang menganggap semua di luar hotel sebagai tanah dan membatasi 10 m/s):
     * di aspal lorong = 'road', di bahu/luar aspal = 'ground'. null = bukan urusan lorong (pakai surfaceAt hotel).
     */
    surfaceAt() {
      if (state === 'idle' || !ride) return null;
      return Math.abs(ride.d) <= ROAD.half ? 'road' : 'ground';
    },

    /** Rumput hotel dipotong di sisi luar gerbang yang dunia perjalanannya sedang dibangun (supaya tidak berimpit dengan tanah perjalanan). */
    syncGround(material) {
      const list = [...worlds.values()].map((w) => w.gate);
      const key = list.map((g) => g.id).join(',');
      if (key === groundKey) return;
      groundKey = key;
      material.clippingPlanes = list.length ? list.map((g) => toPlane(planeBehind(g))) : null;
      material.needsUpdate = true;
    },

    /** Kabut jarak dekat saat di luar gerbang (potongan medan hanya dimuat di sekitar kamera). Dipanggil sesudah langit memperbarui kabutnya. */
    applyFog(me) {
      let on = state !== 'idle';
      if (!on) for (const w of worlds.values()) if (alongOf(w.gate, me.x, me.z).s > 0) { on = true; break; }
      if (on) {
        if (scene.fog !== fog) {
          baseFog = scene.fog;
          fog ??= new THREE.Fog(0xbcd9ee, FOG_FAR * 0.35, FOG_FAR);
          const c = baseFog?.color ?? (scene.background?.isColor ? scene.background : null);
          if (c) fog.color.copy(c);
          scene.fog = fog;
        }
      } else if (fog && scene.fog === fog) scene.fog = baseFog;
    },

    /** Keterangan lokasi selama perjalanan atau di area penurunan, atau null. */
    place(me) {
      void me;
      if (!ride) return null;
      if (state === 'riding') {
        const seg = segmentAt(ride.j, ride.s);
        return { id: `perjalanan-${seg.id}`, name: `Perjalanan · ${seg.name}` };
      }
      return { id: 'perjalanan-tiba', name: `Area penurunan tamu · ${ride.gate.label}` };
    },

    /**
     * Jalan kaki selama lorong aktif. Di tengah rute: bebas di dalam pagar tak terlihat lorong. Di area penurunan tempat acara yang belum
     * dipasang di dunia ini: bebas dalam radius ROAM dari ujung rute.
     */
    walkFree(me, sx, sz) {
      if (!ride) return { x: me.x + sx, z: me.z + sz };
      let x = me.x + sx;
      let z = me.z + sz;
      if (state === 'riding') {
        const c = corridor(ride.gate, ride.j, x, z);
        return { x: c.x, z: c.z };
      }
      const e = endPoint(ride.gate, ride.j);
      const d = Math.hypot(x - e.x, z - e.z);
      if (d > ROAM) {
        x = e.x + ((x - e.x) / d) * ROAM;
        z = e.z + ((z - e.z) / d) * ROAM;
      }
      return { x, z };
    },

    info: () => ({
      state,
      gate: ride?.gate.id ?? null,
      s: ride ? Math.round(ride.s) : null,
      length: ride ? ride.j.length : null,
      anchored: villa.anchored,
      worlds: [...worlds.keys()],
      timeScale,
    }),
  };
}
