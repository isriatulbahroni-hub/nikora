// Hujan 3D di dunia hotel (THREE): tetes jatuh di dalam kotak di sekitar pemain, bukan lapisan di layar, sehingga
//  - tidak turun di bawah kanopi drop-off, kanopi parkir motor, Royal Garage, atau podium (rain-cover.js): tetes memercik di atapnya, di bawahnya kering;
//  - terlihat DI LUAR kaca saat di kabin mobil (tetes di dalam badan mobil dibuang), miring ditiup angin dan memanjang saat mobil melaju;
//  - tetes memercik di tanah, air menetes dari tepi kanopi seperti tirai, genangan beriak di halaman, dan dunia ikut basah (wet-look.js).
// Dipasang dari hotel-life.js (dipanggil hotel-main.js tiap frame); rain-boot.js tetap mengurus jadwal, langit gelap, kilat, suara, dan getar.
// Sesudah dipasang, rain-boot.js tidak lagi menggambar guratan 2D (window.__rain3d.active()). ?hujan3d=0 mematikan hujan 3D (guratan 2D kembali dipakai).
// Galat di sini mematikan hanya hujan 3D (objeknya dilepas), bukan game.
import * as THREE from 'three';
import { eaveEdges, puddleSpots, roofOver } from './rain-cover.js';
import { createDrops, rainCount, seedDrops, stepDrops, streakTail, windAt } from './rain-physics.js';
import { createWetLook } from './wet-look.js';
import { hotelFallback, readShelter } from './weather-shelter.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const SPLASH_POOL = 48;
const HIDDEN = -9999;

export function createRain3D({ scene, low = false, search = '' } = {}) {
  const enabled = new URLSearchParams(search).get('hujan3d') !== '0';
  if (!enabled || !scene) {
    const off = { active: () => false, update() {}, info: () => null, wind: () => ({ x: 0, z: 0, speed: 0, gust: 0 }), dispose() {} };
    return off;
  }
  const win = globalThis.window ?? globalThis;
  const max = low ? 420 : 900;
  const root = new THREE.Group();
  root.name = 'nikora-rain';
  scene.add(root);
  const owned = [];
  const own = (x) => { owned.push(x); return x; };
  let failed = false;

  // ---- guratan tetes
  const drops = createDrops(max);
  const linePos = new Float32Array(max * 6);
  const lineGeo = own(new THREE.BufferGeometry());
  lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3).setUsage(THREE.DynamicDrawUsage));
  lineGeo.setDrawRange(0, 0);
  const lineMat = own(new THREE.LineBasicMaterial({ color: 0xcfdcec, transparent: true, opacity: 0.35, depthWrite: false }));
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.frustumCulled = false;
  lines.renderOrder = 6;
  lines.name = 'hujan-guratan';
  root.add(lines);

  // ---- percikan di tanah dan atap
  const splPos = new Float32Array(SPLASH_POOL * 3).fill(HIDDEN);
  const splAge = new Float32Array(SPLASH_POOL).fill(9);
  const splGeo = own(new THREE.BufferGeometry());
  splGeo.setAttribute('position', new THREE.BufferAttribute(splPos, 3).setUsage(THREE.DynamicDrawUsage));
  const splMat = own(new THREE.PointsMaterial({ color: 0xe8f2ff, size: 0.11, sizeAttenuation: true, transparent: true, opacity: 0.6, depthWrite: false }));
  const splash = new THREE.Points(splGeo, splMat);
  splash.frustumCulled = false;
  splash.renderOrder = 6;
  splash.name = 'hujan-percikan';
  root.add(splash);
  let splNext = 0;
  const addSplash = (x, y, z) => {
    const k = splNext;
    splNext = (splNext + 1) % SPLASH_POOL;
    splPos[k * 3] = x;
    splPos[k * 3 + 1] = y + 0.03;
    splPos[k * 3 + 2] = z;
    splAge[k] = 0;
  };

  // ---- tirai air dari tepi kanopi
  const edges = eaveEdges();
  const dripN = low ? 30 : 70;
  const drip = { e: new Uint8Array(dripN), t: new Float32Array(dripN), y: new Float32Array(dripN), v: new Float32Array(dripN) };
  const dripPos = new Float32Array(dripN * 6);
  for (let i = 0; i < dripN && edges.length; i++) {
    drip.e[i] = Math.floor(Math.random() * edges.length);
    drip.t[i] = Math.random();
    drip.y[i] = Math.random() * edges[drip.e[i]].y;
    drip.v[i] = 5.5 + Math.random() * 2;
  }
  const dripGeo = own(new THREE.BufferGeometry());
  dripGeo.setAttribute('position', new THREE.BufferAttribute(dripPos, 3).setUsage(THREE.DynamicDrawUsage));
  dripGeo.setDrawRange(0, 0);
  const dripMat = own(new THREE.LineBasicMaterial({ color: 0xdbe7f3, transparent: true, opacity: 0.5, depthWrite: false }));
  const dripLines = new THREE.LineSegments(dripGeo, dripMat);
  dripLines.frustumCulled = false;
  dripLines.renderOrder = 6;
  dripLines.name = 'hujan-tirai';
  root.add(dripLines);

  // ---- genangan beriak di halaman drop-off dan parkir karyawan
  const spots = puddleSpots(low ? 14 : 30);
  const puddles = new THREE.Group();
  puddles.name = 'hujan-genangan';
  root.add(puddles);
  const fillGeo = own(new THREE.CircleGeometry(1, 20));
  const ringGeo = own(new THREE.RingGeometry(0.82, 1, 28));
  const fillMat = own(new THREE.MeshBasicMaterial({ color: 0x0b121c, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const rings = spots.map((s) => {
    const fill = new THREE.Mesh(fillGeo, fillMat);
    fill.rotation.x = -Math.PI / 2;
    fill.position.set(s.x, 0.075, s.z);
    fill.scale.set(s.r, s.r, 1);
    const mat = own(new THREE.MeshBasicMaterial({ color: 0xdce9f5, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    const ring = new THREE.Mesh(ringGeo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.x, 0.08, s.z);
    puddles.add(fill, ring);
    return { ring, mat };
  });
  puddles.visible = false;

  const wetLook = createWetLook({ scene });
  let avatar = null;
  let avatarCheck = -1e9;
  let personWet = 0;
  let seeded = false;
  let lastT = null;
  let prev = null;
  const pv = { x: 0, y: 0, z: 0 };
  let windNow = { x: 0, z: 0, speed: 0, gust: 0 };
  let lastN = 0;
  let lastWet = 0;

  // avatar pemain = anak langsung scene yang punya userData.seated (diisi hotel-main.js tiap frame) dan berada di posisi pemain
  function findAvatar(me, time) {
    if (avatar && avatar.parent === scene && Math.hypot(avatar.position.x - me.x, avatar.position.z - me.z) < 0.5) return avatar;
    if (time - avatarCheck < 1) return avatar;
    avatarCheck = time;
    avatar = null;
    for (const o of scene.children) {
      if (o.userData && 'seated' in o.userData && Math.hypot(o.position.x - me.x, o.position.z - me.z) < 0.35) { avatar = o; break; }
    }
    return avatar;
  }

  // mobil yang sedang dikendarai: tetes di dalam badannya dibuang (hujan tidak masuk kabin)
  function drivenCar(me, hot) {
    try {
      if (!hot?.driving?.()) return null;
      let best = null;
      let bd = 6;
      for (const c of hot.cars?.() ?? []) {
        const d = Math.hypot(c.x - me.x, c.z - me.z);
        if (d < bd) { bd = d; best = c; }
      }
      return best;
    } catch {
      return null;
    }
  }

  function updateEaves(dt, me, k, groundY) {
    if (!edges.length || k <= 0.01) { dripGeo.setDrawRange(0, 0); return; }
    const n = Math.round(dripN * k);
    let w = 0;
    for (let i = 0; i < n; i++) {
      let E = edges[drip.e[i]];
      drip.y[i] -= drip.v[i] * dt;
      if (drip.y[i] <= groundY + 0.05) {
        const sx = E.x1 + (E.x2 - E.x1) * drip.t[i] + E.nx * 0.12;
        const sz = E.z1 + (E.z2 - E.z1) * drip.t[i] + E.nz * 0.12;
        if ((sx - me.x) ** 2 + (sz - me.z) ** 2 < 900) addSplash(sx, groundY, sz);
        drip.e[i] = Math.floor(Math.random() * edges.length);
        E = edges[drip.e[i]];
        drip.t[i] = Math.random();
        drip.y[i] = E.y;
        drip.v[i] = 5.5 + Math.random() * 2;
      }
      const x = E.x1 + (E.x2 - E.x1) * drip.t[i] + E.nx * 0.12;
      const z = E.z1 + (E.z2 - E.z1) * drip.t[i] + E.nz * 0.12;
      if ((x - me.x) ** 2 + (z - me.z) ** 2 > 3025) continue; // lebih jauh dari 55 m: tidak digambar
      const o = w * 6;
      dripPos[o] = x; dripPos[o + 1] = drip.y[i]; dripPos[o + 2] = z;
      dripPos[o + 3] = x; dripPos[o + 4] = drip.y[i] + 0.5; dripPos[o + 5] = z;
      w++;
    }
    dripGeo.setDrawRange(0, w * 2);
    dripGeo.attributes.position.needsUpdate = true;
  }

  function step({ time, me, rain = 0, active = true }) {
    const dt = lastT === null ? 0 : clamp(time - lastT, 0, 0.1);
    lastT = time;
    const y = Number.isFinite(me.y) ? me.y : 0;
    const c = { x: me.x, y, z: me.z };
    const level = clamp(Number(rain) || 0, 0, 1);
    const wet = clamp(Number(win.__weather?.wet?.()) || 0, 0, 1);
    lastWet = wet;
    const sh = readShelter({ fallback: hotelFallback });
    const fourD = win.__weather4d?.on?.() !== false;
    const wind = windAt(time, level, fourD ? 1 : 0.35);
    windNow = wind;

    // kecepatan pemain (dari selisih posisi; lompatan teleport/lift diabaikan) membuat guratan menyilang saat mobil melaju
    if (prev && dt > 1e-4) {
      const ddx = me.x - prev.x;
      const ddy = y - prev.y;
      const ddz = me.z - prev.z;
      if (Math.hypot(ddx, ddy, ddz) > 8) { pv.x = 0; pv.y = 0; pv.z = 0; } else { pv.x = clamp(ddx / dt, -90, 90); pv.y = clamp(ddy / dt, -90, 90); pv.z = clamp(ddz / dt, -90, 90); }
    }
    prev = { x: me.x, y, z: me.z };

    // tetes
    const indoorK = clamp(sh.indoor, 0, 1);
    const n = Math.round(rainCount(level, { low }) * (1 - indoorK));
    lastN = n;
    if (!seeded) { seedDrops(drops, c, y); seeded = true; }
    const car = drivenCar(me, win.__hotel);
    const cull = car ? (x, py, z) => py < y + 2.1 && (x - car.x) ** 2 + (z - car.z) ** 2 < 8.4 : null;
    const hits = n > 0 ? stepDrops(drops, n, dt, { c, groundY: y, wind, cull }) : [];
    for (const s of hits) addSplash(s.x, s.y, s.z);
    for (let i = 0; i < n; i++) {
      const t = streakTail({ x: wind.x - pv.x, y: -drops.v[i] - pv.y, z: wind.z - pv.z }, drops.l[i]);
      const o = i * 6;
      linePos[o] = drops.x[i]; linePos[o + 1] = drops.y[i]; linePos[o + 2] = drops.z[i];
      linePos[o + 3] = drops.x[i] + t.x; linePos[o + 4] = drops.y[i] + t.y; linePos[o + 5] = drops.z[i] + t.z;
    }
    lineGeo.setDrawRange(0, n * 2);
    lineGeo.attributes.position.needsUpdate = true;
    lineMat.opacity = 0.18 + 0.32 * level;
    lines.visible = n > 0;

    // percikan: tumbuh lalu hilang dalam 0,2 detik
    for (let k = 0; k < SPLASH_POOL; k++) {
      if (splAge[k] > 0.2) { splPos[k * 3 + 1] = HIDDEN; continue; }
      splAge[k] += dt;
    }
    splGeo.attributes.position.needsUpdate = true;

    // tirai air dari kanopi (hanya di lantai dasar, terlihat dari luar ruangan)
    const ground = (me.level ?? 0) === 0 && active && indoorK < 0.5;
    updateEaves(dt, me, ground ? clamp((level - 0.2) / 0.5, 0, 1) : 0, 0);

    // genangan beriak (hanya di lantai dasar dan bukan di lorong perjalanan)
    const pw = clamp((wet - 0.25) / 0.6, 0, 1);
    const showP = ground && pw > 0.01;
    puddles.visible = showP;
    if (showP) {
      fillMat.opacity = 0.5 * pw;
      const rippling = clamp(level * 3, 0, 1);
      for (let i = 0; i < rings.length; i++) {
        const ph = (time * 0.8 + i * 0.37) % 1;
        const sc = spots[i].r * (0.2 + 0.8 * ph);
        rings[i].ring.scale.set(sc, sc, 1);
        rings[i].mat.opacity = (1 - ph) * 0.5 * pw * rippling;
      }
    }

    // basah: avatar basah bila berdiri di bawah langit terbuka (bukan kabin, bukan di bawah atap), kering pelan bila berteduh
    const exposed = !sh.cabin && indoorK < 0.4 && !roofOver(me.x, y + 1.8, me.z);
    const rise = exposed ? level / 25 : 0;
    const fall = !exposed || level < 0.02 ? 1 / 45 : 0;
    personWet = clamp(personWet + dt * (rise - fall), 0, 1);
    wetLook.update({ time, wet, personWet, avatar: findAvatar(me, time) });
  }

  const api = {
    root,
    /** Tiap frame dari hotel-life.js: time detik, me = pemain, rain = intensitas 0..1, active = false selama lorong perjalanan. */
    update(args) {
      if (failed || !args?.me) return;
      try {
        step(args);
      } catch (error) {
        failed = true;
        console.warn('[hotel] hujan 3D dimatikan karena galat', error);
        try { api.dispose(); } catch { /* sudah dibuang */ }
      }
    },
    active: () => enabled && !failed,
    wind: () => windNow,
    wetness: () => ({ ground: lastWet, person: personWet }),
    info: () => ({ drops: lastN, wind: windNow, puddles: spots.length, edges: edges.length, ...wetLook.info(), person: personWet, failed }),
    dispose() {
      try { wetLook.restore(avatar); } catch { /* bahan sudah dibuang */ }
      scene.remove(root);
      for (const x of owned) x.dispose?.();
      if (win.__rain3d === api) win.__rain3d = null;
    },
  };
  win.__rain3d = api;
  return api;
}
