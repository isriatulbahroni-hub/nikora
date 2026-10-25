import * as THREE from 'three';
import { BOUNDS as VILLA_BOUNDS } from './villa-layout.js';
import { GATES, HIGHWAY_LIMIT } from './highway.js';
import { SEGMENTS, buildJourney, clamp, frameAt, nearestOnRoute, segmentAt, timeAt } from './journey.js';
import { startState } from './journey-drive.js';
import { FOG_FAR, createJourneyWorld, flareHalf } from './journey-world.js';
import { alongOf, endPoint, gatePsi, localToWorld, planeBeyond, planeBehind, poseAt, rideSteer, startCheck, stepRide, villaAnchor, worldToLocal, wrap } from './hotel-journey-math.js';

// Perjalanan 20+ menit di DALAM dunia hotel (satu halaman, satu dunia): jalan raya hotel -> gerbang -> rute perjalanan (journey.js) -> tempat acara.
// Rute dipasang di gerbang jalan raya (hotel-journey-math.js): titik awal rute = titik gerbang, diputar menurut arah keluar gerbang. Bentuk rute
// (tikungan, bukit, jembatan, danau, durasi >= 20 menit) tidak diubah sedikit pun; yang berubah hanya tempatnya: tidak ada pindah halaman.
//
// Mobil dikemudikan PEMAIN SENDIRI (autopilot dimatikan): joystick/pedal bekerja seperti di jalan raya hotel. Modul ini hanya melacak posisi
// mobil (atau pejalan kaki) di sepanjang rute untuk HUD, tinggi dunia, pemuatan potongan, dan pemasangan villa. Supaya perjalanan tetap
// >= 20 menit, kecepatan mobil dibatasi sebesar kecepatan jelajah tiap bagian rute (batas kecepatan jalan: 50, 45, 36, 32, 25 km/jam).
// Mobil dijaga tetap di dalam badan jalan (dinding lunak di tepi aspal), karena tanah di luar jalan tidak punya tabrakan. Autopilot lama
// masih ada untuk pengujian: tambahkan ?otomatis=1 pada alamat halaman.
// Mobil tetap di y = 0 dan seluruh dunia perjalanan digeser vertikal mengikuti tinggi jalan di bawah pemain (hanya dunia perjalanan; hotel tetap),
// jadi fisika mobil, kursi, dan kamera hotel dipakai apa adanya.
// Di ujung rute villa dipasang (hotel-villa.js) dan bisa dimasuki langsung; tempat acara lain masih memakai halaman sendiri lewat tombol "Masuk"
// (tahap berikutnya: dipasang di ujung rute seperti villa).
const PRELOAD = 300; // dunia perjalanan sebuah gerbang dibangun saat pemain sedekat ini (m)
const KEEP = 460; // ... dan dibuang saat pemain menjauh dari sini
const ROAM = 30; // radius jalan kaki bebas di sekitar ujung rute (tempat acara selain villa)
const ANCHOR_BEFORE = 380; // villa dipasang saat sisa rute sependek ini (jalan sudah datar sepanjang itu)
const ARRIVE_BEFORE = 15; // dianggap tiba saat sisa rute sependek ini (mengemudi sendiri)
const EDGE_MARGIN = 0.9; // dinding lunak: mobil tidak boleh lebih dekat dari ini ke tepi aspal
const BIG = Object.freeze({ minX: -60000, maxX: 60000, minZ: -60000, maxZ: 60000 }); // batas dunia mobil selama perjalanan

const fmt = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const toPlane = (p) => new THREE.Plane(new THREE.Vector3(p.nx, 0, p.nz), p.c);
const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };

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

/** Potong semua bahan dunia perjalanan di belakang gerbang (sisi hotel), supaya tidak menimpa tanah dan jalan hotel. */
function clipMaterials(group, planes) {
  group.traverse((o) => {
    const m = o.material;
    for (const mm of Array.isArray(m) ? m : m ? [m] : []) {
      if (mm.userData.hjClip) continue;
      mm.clippingPlanes = planes;
      mm.userData.hjClip = true;
      mm.needsUpdate = true;
    }
  });
}

/**
 * scene: THREE.Scene hotel; villa: createHotelVilla(); approach: VILLA_APPROACH; search: location.search (?kecepatan=1..20 dan ?otomatis=1 hanya untuk menguji);
 * enterUrl(gate): alamat halaman tempat acara (null = tempat acara ada di dunia ini); onReturn(gate): pemanggil memindahkan pemain kembali ke hotel.
 */
export function createHotelJourney({ scene, villa, approach, search = '', enterUrl = () => null, onReturn = () => {} }) {
  const query = new URLSearchParams(search);
  const timeScale = Math.min(20, Math.max(1, Number(query.get('kecepatan')) || 1));
  const autopilot = query.get('otomatis') === '1'; // bawaan MATI: pemain mengemudi sendiri
  const worlds = new Map(); // id gerbang -> { gate, j, world, planes, clipDirty }
  let state = 'idle'; // idle | riding | arrived
  let ride = null; // { w, gate, j, st, capture, paused, anchored, loadPending }
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
  function buildUi() {
    if (ui || typeof document === 'undefined') return;
    const box = document.createElement('div');
    box.id = 'journey-hud';
    Object.assign(box.style, {
      position: 'fixed', left: '50%', transform: 'translateX(-50%)', top: 'calc(env(safe-area-inset-top, 0px) + 10px)', zIndex: '31',
      width: 'min(92vw, 420px)', padding: '10px 14px', borderRadius: '14px', background: 'rgba(20,18,12,0.84)', color: '#f5e6b0',
      font: '600 13px system-ui, sans-serif', display: 'none', boxSizing: 'border-box', border: '1px solid rgba(212,175,55,0.5)',
    });
    const title = document.createElement('div');
    title.style.cssText = 'font-size:15px;margin-bottom:4px';
    const meta = document.createElement('div');
    meta.style.cssText = 'display:flex;justify-content:space-between;opacity:.85;margin-bottom:6px';
    const part = document.createElement('span');
    const eta = document.createElement('span');
    meta.append(part, eta);
    const track = document.createElement('div');
    track.style.cssText = 'height:5px;border-radius:3px;background:rgba(255,255,255,.18);overflow:hidden';
    const bar = document.createElement('div');
    bar.style.cssText = 'height:100%;width:0;background:#d4af37';
    track.appendChild(bar);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;margin-top:8px;flex-wrap:wrap';
    const mk = (label, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'flex:1;min-width:110px;padding:9px 12px;border-radius:10px;border:1px solid rgba(212,175,55,.8);background:rgba(40,34,20,.9);color:#f5e6b0;font:600 13px system-ui,sans-serif;cursor:pointer';
      b.addEventListener('click', fn);
      row.appendChild(b);
      return b;
    };
    const pause = mk('⏸ Jeda', () => {
      if (!ride || state !== 'riding' || !autopilot) return;
      ride.paused = !ride.paused;
      if (ride.paused) ride.st.v = 0;
      pause.textContent = ride.paused ? '▶ Lanjut' : '⏸ Jeda';
    });
    const skip = mk('⏭ Lewati', () => {
      if (!ride || state !== 'riding' || !autopilot) return;
      ride.st.s = Math.max(ride.st.s, ride.j.length - 320);
      ride.st.v = Math.min(ride.st.v, 8);
      ride.capture = 0;
    });
    const enter = mk('Masuk', () => {
      const url = ride ? enterUrl(ride.gate) : null;
      if (url) window.location.href = url;
    });
    const back = mk('Kembali ke hotel', () => { if (ride) onReturn(ride.gate); });
    box.append(title, meta, track, row);
    document.body.appendChild(box);
    ui = { box, title, part, eta, bar, pause, skip, enter, back };
  }

  function renderUi() {
    if (!ui) return;
    if (!ride || state === 'idle') {
      ui.box.style.display = 'none';
      return;
    }
    ui.box.style.display = 'block';
    const { j, gate, st } = ride;
    if (state === 'riding') {
      const seg = segmentAt(j, clamp(st.s, 0, j.length));
      setText(ui.title, seg.name);
      const limit = autopilot ? '' : ` · Batas ${Math.round(seg.cruise * 3.6)} km/jam`;
      setText(ui.part, `${gate.label} · Bagian ${j.bounds.indexOf(seg) + 1}/${SEGMENTS.length}${limit}`);
      setText(ui.eta, `Sisa ± ${fmt(Math.max(0, j.duration - timeAt(j, clamp(st.s, 0, j.length))))}`);
      ui.bar.style.width = `${(clamp(st.s, 0, j.length) / j.length) * 100}%`;
      ui.pause.style.display = autopilot ? 'block' : 'none';
      ui.skip.style.display = autopilot && st.s <= j.length - 400 ? 'block' : 'none';
      ui.enter.style.display = 'none';
      ui.back.style.display = autopilot ? 'none' : 'block'; // mengemudi sendiri: selalu boleh putar balik ke hotel
    } else {
      setText(ui.title, `Tiba di ${gate.label}`);
      setText(ui.part, 'Area penurunan tamu');
      setText(ui.eta, 'Tiba');
      ui.bar.style.width = '100%';
      ui.pause.style.display = 'none';
      ui.skip.style.display = 'none';
      const url = enterUrl(gate);
      ui.enter.style.display = url ? 'block' : 'none';
      setText(ui.enter, `Masuk ke ${gate.label}`);
      ui.back.style.display = 'block';
    }
  }

  // ---------------------------------------------------------------- langkah perjalanan
  /** Autopilot lama (hanya dengan ?otomatis=1): mobil digeser di sepanjang rute. */
  function stepAutopilot(delta, driving) {
    const { j, gate } = ride;
    if (!ride.paused) stepRide(j, ride.st, delta * timeScale);
    const target = poseAt(gate, j, ride.st.s);
    const k = ride.capture > 0 ? 1 - Math.exp(-delta * 5) : 1; // awal: mobil dihaluskan ke lajur rute, tidak melompat
    ride.capture = Math.max(0, ride.capture - delta);
    driving.x += (target.x - driving.x) * k;
    driving.z += (target.z - driving.z) * k;
    driving.heading = wrap(driving.heading + wrap(target.heading - driving.heading) * k);
    driving.speed = ride.paused ? 0 : ride.st.v;
    driving.steer = rideSteer(target.curvature);
    driving.engine = true;
    if (ride.st.arrived) {
      state = 'arrived';
      ride.st.v = 0;
      driving.speed = 0;
    }
  }

  /**
   * Mengemudi sendiri: hanya MELACAK posisi (mobil, atau pejalan kaki bila pemain turun) pada rute. Mobil didorong kembali ke badan jalan
   * bila keluar dari tepi aspal (tanah di luar jalan tidak punya tabrakan dan tingginya tidak sama dengan jalan) dan melambat seperti
   * menggesek pembatas. Kecepatan dibatasi kecepatan jelajah bagian rute itu, jadi perjalanan penuh tidak pernah kurang dari durasi rute (20+ menit).
   */
  function trackManual(delta, driving, me) {
    const { j, gate, st } = ride;
    const who = driving ?? me;
    const a = alongOf(gate, who.x, who.z);
    let s = a.s; // sebelum gerbang (s < 0): masih di jalan raya hotel, lurus
    if (a.s >= 0) {
      const cl = worldToLocal(gate, who.x, who.z);
      const r = nearestOnRoute(j, cl.x, cl.z);
      s = r.s;
      if (driving) {
        const cap = segmentAt(j, clamp(s, 0, j.length)).cruise; // m/s
        if (Math.abs(driving.speed) > cap) driving.speed = Math.sign(driving.speed) * cap;
        if (r.s < j.length - 5) {
          const over = Math.abs(r.d) - (flareHalf(r.s) - EDGE_MARGIN);
          if (over > 0) {
            const h = j.hs[r.i];
            const sg = Math.sign(r.d); // + = sisi kiri jalan; vektor kiri = (cos h, -sin h)
            const p = localToWorld(gate, cl.x - sg * over * Math.cos(h), cl.z + sg * over * Math.sin(h));
            driving.x = p.x;
            driving.z = p.z;
            driving.speed *= Math.max(0, 1 - 3 * delta);
          }
        }
      }
    }
    st.s = s;
    st.v = driving ? Math.abs(driving.speed) : 0;
    if (state === 'riding' && s >= j.length - ARRIVE_BEFORE) state = 'arrived';
  }

  function stepRideFrame(delta, driving, me) {
    if (!ride) return;
    const { j, gate, w } = ride;
    if (autopilot && state === 'riding' && driving) stepAutopilot(delta, driving);
    else if (!autopilot) trackManual(delta, driving, me);
    // dunia perjalanan digeser vertikal mengikuti tinggi jalan di bawah mobil (mobil tetap di y = 0)
    w.world.group.position.y = -frameAt(j, clamp(ride.st.s, 0, j.length)).y;
    // villa dipasang di ujung rute saat jalan sudah datar dan dekat (dimuat satu frame kemudian supaya tidak menumpuk)
    if (gate.id === 'villa') {
      if (!ride.anchored && ride.st.s >= j.length - ANCHOR_BEFORE) {
        villa.anchor(villaAnchor(gate, j, VILLA_BOUNDS.maxZ, approach));
        ride.anchored = true;
        ride.loadPending = true;
      } else if (ride.loadPending) {
        villa.load();
        ride.loadPending = false;
      }
    }
  }

  /**
   * Saat tidak sedang "perjalanan" (mis. berjalan kaki melewati gerbang) dunia perjalanan tetap harus naik-turun mengikuti jalan di bawah pemain,
   * kalau tidak pemain berjalan menembus bukit. Dekat gerbang jalan datar, jadi tidak ada lompatan.
   */
  function followGround(me) {
    for (const w of worlds.values()) {
      const a = alongOf(w.gate, me.x, me.z);
      let y = 0;
      if (a.s > 0 && me.level === 0) {
        const cl = worldToLocal(w.gate, me.x, me.z);
        const r = nearestOnRoute(w.j, cl.x, cl.z);
        const k = clamp((220 - r.dist) / 100, 0, 1); // jauh dari jalan: kembali ke tinggi hotel perlahan
        y = -frameAt(w.j, r.s).y * k;
      }
      if (Math.abs(w.world.group.position.y - y) > 1e-4) w.world.group.position.y = y;
    }
  }

  return {
    get state() { return state; },
    /** Perjalanan OTOMATIS sedang berlangsung (input pemain dikunci). Mengemudi sendiri tidak pernah mengunci input. */
    get riding() { return autopilot && state === 'riding'; },
    get arrived() { return state === 'arrived'; },
    get autopilot() { return autopilot; },
    get gate() { return ride?.gate ?? null; },

    /** Mulai perjalanan dari gerbang `gate` dengan mobil yang sedang dikemudikan `car` (objek Fleet). Mengembalikan { ok } atau { ok: false, reason }. */
    start(gate, car) {
      if (state !== 'idle') return { ok: false, reason: 'Perjalanan sedang berlangsung.' };
      const chk = startCheck(gate, car);
      if (!chk.ok) return chk;
      buildUi();
      const w = ensureWorld(gate);
      const st = startState(chk.s);
      st.v = Math.max(0, car.speed);
      ride = { w, gate, j: w.j, st, capture: autopilot ? 1.4 : 0, paused: false, anchored: false, loadPending: false };
      state = 'riding';
      if (ui) {
        ui.pause.textContent = '⏸ Jeda';
        renderUi();
      }
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
        followGround(me);
      } else stepRideFrame(delta, driving, me);
      for (const w of worlds.values()) {
        const cl = worldToLocal(w.gate, camera.position.x, camera.position.z);
        const s = ride && ride.w === w ? ride.st.s : alongOf(w.gate, camera.position.x, camera.position.z).s;
        const built = w.world.ensure({ x: cl.x, z: cl.z }, clamp(s, 0, w.j.length), 2);
        if (built || w.clipDirty) {
          clipMaterials(w.world.group, w.planes);
          w.clipDirty = false;
        }
      }
      renderUi();
    },

    /** Batas dunia mobil: lebar selama perjalanan dan setelah tiba, bawaan jalan raya hotel selain itu. Mengubah objek `limit` (dipakai Fleet). */
    syncLimit(limit) {
      Object.assign(limit, state === 'idle' ? HIGHWAY_LIMIT : BIG);
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
        const seg = segmentAt(ride.j, clamp(ride.st.s, 0, ride.j.length));
        return { id: `perjalanan-${seg.id}`, name: `Perjalanan · ${seg.name}` };
      }
      return { id: 'perjalanan-tiba', name: `Area penurunan tamu · ${ride.gate.label}` };
    },

    /**
     * Jalan kaki selama perjalanan atau di area penurunan. Di tengah perjalanan (mengemudi sendiri, pemain turun dari mobil) bebas sepenuhnya.
     * Di area penurunan tempat acara yang belum dipasang di dunia ini: bebas dalam radius ROAM dari ujung rute.
     */
    walkFree(me, sx, sz) {
      if (!ride || state !== 'arrived') return { x: me.x + sx, z: me.z + sz };
      const e = endPoint(ride.gate, ride.j);
      let x = me.x + sx;
      let z = me.z + sz;
      const d = Math.hypot(x - e.x, z - e.z);
      if (d > ROAM) {
        x = e.x + ((x - e.x) / d) * ROAM;
        z = e.z + ((z - e.z) / d) * ROAM;
      }
      return { x, z };
    },

    info: () => ({
      state,
      autopilot,
      gate: ride?.gate.id ?? null,
      s: ride ? Math.round(ride.st.s) : null,
      length: ride ? ride.j.length : null,
      anchored: villa.anchored,
      worlds: [...worlds.keys()],
      timeScale,
    }),
  };
}
