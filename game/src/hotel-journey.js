import * as THREE from 'three';
import { BOUNDS as VILLA_BOUNDS } from './villa-layout.js';
import { GATES, HIGHWAY_LIMIT } from './highway.js';
import { SEGMENTS, buildJourney, clamp, frameAt, nearestOnRoute, segmentAt, timeAt } from './journey.js';
import { startState } from './journey-drive.js';
import { setRoadProbe } from './vehicle.js';
import { FOG_FAR, createJourneyWorld, flareHalf } from './journey-world.js';
import { alongOf, endPoint, gatePsi, localToWorld, onRoute, planeBeyond, planeBehind, poseAt, rideSteer, startCheck, stepRide, villaAnchor, worldToLocal, wrap } from './hotel-journey-math.js';

// Perjalanan 20+ menit di DALAM dunia hotel (satu halaman, satu dunia): jalan raya hotel -> gerbang -> rute perjalanan (journey.js) -> tempat acara.
// Rute dipasang di gerbang jalan raya (hotel-journey-math.js): titik awal rute = titik gerbang, diputar menurut arah keluar gerbang. Bentuk rute
// (tikungan, bukit, jembatan, danau) tidak diubah sedikit pun; yang berubah hanya tempatnya: tidak ada pindah halaman.
//
// Mobil dikemudikan PEMAIN SENDIRI (autopilot dimatikan): joystick/pedal bekerja seperti di jalan raya hotel. Modul ini hanya melacak posisi
// mobil (atau pejalan kaki) di sepanjang rute untuk tinggi dunia, pemuatan potongan, dan pemasangan villa. Tidak ada batas kecepatan per bagian,
// tidak ada hitung mundur waktu, dan tidak ada HUD di atas layar: waktu tiba sepenuhnya tergantung kecepatan pengemudi.
// Mobil tetap dijaga di dalam badan jalan (dinding lunak di tepi aspal), karena tanah di luar jalan tidak punya tabrakan. Autopilot lama masih ada
// untuk pengujian: tambahkan ?otomatis=1 pada alamat halaman.
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
const BACK_OUT = -2; // mobil dianggap kembali ke jalan raya hotel saat sejauh ini di belakang gerbang (m): perjalanan selesai otomatis

const toPlane = (p) => new THREE.Plane(new THREE.Vector3(p.nx, 0, p.nz), p.c);

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
   * menggesek pembatas. Kecepatan tidak dibatasi per bagian rute: pengemudi bebas memakai kecepatan mobilnya sendiri.
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
      if (driving && r.s < j.length - 5) {
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

  // Aspal lorong dikenali fisika mobil sebagai 'road' (bukan tanah yang dibatasi 10 m/s = 36 km/jam): lihat vehicle.js setRoadProbe.
  setRoadProbe((x, z) => {
    for (const w of worlds.values()) if (onRoute(w.gate, w.j, x, z)) return true;
    return false;
  });

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
      const w = ensureWorld(gate);
      const st = startState(chk.s);
      st.v = Math.max(0, car.speed);
      ride = { w, gate, j: w.j, st, capture: autopilot ? 1.4 : 0, paused: false, anchored: false, loadPending: false };
      state = 'riding';
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
      } else {
        stepRideFrame(delta, driving, me);
        // mobil diputar balik dan keluar lewat gerbang kembali ke jalan raya hotel: perjalanan selesai tanpa tombol
        if (ride && ride.st.s < BACK_OUT) this.finish();
      }
      for (const w of worlds.values()) {
        const cl = worldToLocal(w.gate, camera.position.x, camera.position.z);
        const s = ride && ride.w === w ? ride.st.s : alongOf(w.gate, camera.position.x, camera.position.z).s;
        const built = w.world.ensure({ x: cl.x, z: cl.z }, clamp(s, 0, w.j.length), 2);
        if (built || w.clipDirty) {
          clipMaterials(w.world.group, w.planes);
          w.clipDirty = false;
        }
      }
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
