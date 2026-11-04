import * as THREE from 'three';
import { SCENES, SHAKE_MAX, WATER_MAX, cinemaSeatPlan, clamp, comfortFromSearch, rumbleBeat, sceneAt, seatDistance, shakeOffset, showAt } from './cinema-5d-data.js';
import { createCinemaSound } from './cinema-5d-sound.js';
import { engineHapticsEnabled } from './haptics.js';
import { createLagoonSpray } from './hotel-lagoon-4d.js';
import { hotelLevelY, hotelRoomsAtLevel } from './hotel-layout.js';

// Bioskop 5D di hotel (Mini Cinema, lantai 3 sayap barat): menjalankan jadwal tayang dan menerjemahkan nilai adegan (cinema-5d-data.js)
// menjadi pengalaman: horizon miring dan kamera berguncang (transformasi kanvas), air naik di lantai, percikan di layar, ruangan menggelap,
// kilatan, kursi hantu yang bergeser, suara (cinema-5d-sound.js), dan getaran HP. Hanya terasa saat pemain berada di dalam ruang bioskop.
// Tayangan serentak untuk semua tamu karena jadwalnya mengikuti jam epoch (showAt). ?bioskop=0 mematikan semuanya, ?nyaman=gentle|calm
// mengurangi gerakan dan kilatan, ?getar=0 mematikan getaran HP. "Kurangi gerakan" dari sistem selalu memakai mode calm.
// Dibuat dengan try/catch di hotel-main.js: bila gagal, bioskop biasa tetap jalan.

export const CINEMA_LEVEL = 3;
export const CINEMA_ID = 'cinema';
export const EYE_WATER = 1.0; // air setinggi ini menenggelamkan kepala: suara teredam, layar kebiruan
const SEAT_FACE = -Math.PI / 2; // kursi menghadap barat (ke layar)
const STORE_KEY = 'nikora.bioskop.nyaman';
export const COMFORT_LABEL = Object.freeze({ full: 'Penuh', gentle: 'Lembut', calm: 'Tenang' });
const COMFORT_CYCLE = ['full', 'gentle', 'calm'];

// ---------------------------------------------------------------- matematika murni (diuji)
/** Skala kanvas agar sudut layar tidak terbuka saat diputar `deg` derajat pada layar beraspek `aspect` (+ cadangan untuk guncangan). */
export function tiltScale(deg, aspect = 1.8) {
  const a = (Math.abs(clamp(deg, -45, 45)) * Math.PI) / 180;
  const long = Math.max(aspect, 1 / aspect);
  return Math.cos(a) + long * Math.sin(a) + 0.04;
}

/** Transformasi CSS kanvas untuk miring (derajat) dan guncangan (-1..1 per sumbu); '' bila tidak ada gerakan. */
export function canvasTransform({ tilt = 0, shake = { x: 0, y: 0 }, aspect = 1.8 } = {}) {
  const px = (shake.x / SHAKE_MAX) * 14;
  const py = (shake.y / SHAKE_MAX) * 14;
  if (Math.abs(tilt) < 0.05 && Math.abs(px) < 0.05 && Math.abs(py) < 0.05) return '';
  return `translate(${px.toFixed(2)}px, ${py.toFixed(2)}px) rotate(${tilt.toFixed(2)}deg) scale(${tiltScale(tilt, aspect).toFixed(3)})`;
}

/** Kegelapan ruangan, kilatan, dan nuansa bawah air sebagai opasitas lapisan layar (0..1). */
export function overlayLevels({ dim = 0, flash = 0, water = 0 } = {}) {
  return {
    dim: clamp(dim * 0.85, 0, 0.9),
    flash: clamp(flash * 0.9, 0, 0.9),
    tint: clamp((water - EYE_WATER) / (WATER_MAX - EYE_WATER), 0, 1) * 0.4,
  };
}

/** ?getar=0 dan "kurangi gerakan" mematikan getaran; ?bioskop=0 mematikan seluruh bioskop 5D. */
export const cinemaHapticsEnabled = (search = '', reducedMotion = false) => engineHapticsEnabled(search, reducedMotion) && new URLSearchParams(search).get('bioskop') !== '0';

/** Pembuat getaran gemuruh. Dipanggil tiap frame: (now detik, level). Mengembalikan ms yang dipakai (0 = tidak bergetar). */
export function createRumbleHaptics({ vibrate = (ms) => globalThis.navigator?.vibrate?.(ms), enabled = true } = {}) {
  let next = -Infinity;
  return (now, level) => {
    if (!enabled) return 0;
    const beat = rumbleBeat(level);
    if (!beat || now < next) return 0;
    next = now + beat.gap;
    try { vibrate(beat.ms); } catch { /* getaran gagal: abaikan */ }
    return beat.ms;
  };
}

const titleOf = (id) => SCENES[id]?.title ?? id;
const NONE = Object.freeze({ rumble: 0, wind: 0, shake: 0, tilt: 0, mist: 0, water: 0, dim: 0, flash: 0, whisper: 0, chair: 0 });
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.ceil(s % 60) % 60).padStart(2, '0')}`;
const inside = (rect, x, z) => x >= rect[0] && x <= rect[2] && z >= rect[1] && z <= rect[3];

function readStored(win) {
  try {
    const v = win?.localStorage?.getItem(STORE_KEY);
    return COMFORT_CYCLE.includes(v) ? v : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- pemasangan
/**
 * Mengembalikan { update({ me, delta, nowMs, active }), setComfort(mode), cycleComfort(), info(), dispose() }.
 * me = { x, z, level, villa? }; active = false selama lorong perjalanan atau di dalam mobil. Tanpa ruang bioskop atau dengan ?bioskop=0
 * semuanya tidak berbuat apa-apa.
 */
export function createHotelCinema({ scene, renderer, low = false, search = '', doc = globalThis.document, win = globalThis.window, room = hotelRoomsAtLevel(CINEMA_LEVEL).find((r) => r.id === CINEMA_ID) } = {}) {
  const none = { update() {}, setComfort() {}, cycleComfort: () => 'full', info: () => ({ on: false }), dispose() {} };
  if (!room || new URLSearchParams(search).get('bioskop') === '0') return none;

  const reduced = !!win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const params = new URLSearchParams(search);
  let comfort = reduced ? 'calm' : params.has('nyaman') ? comfortFromSearch(search, false) : readStored(win) ?? 'full';
  const plan = cinemaSeatPlan(room.rect);
  const floorY = hotelLevelY(CINEMA_LEVEL);
  const cx = (room.rect[0] + room.rect[2]) / 2;
  const cz = (room.rect[1] + room.rect[3]) / 2;
  const canvas = renderer?.domElement ?? null;
  const spray = createLagoonSpray({ search: '', low, doc, win });
  const sound = createCinemaSound({ search });
  const haptic = createRumbleHaptics({ enabled: cinemaHapticsEnabled(search, reduced) });
  const owned = [];

  // air yang naik di lantai bioskop
  const waterMat = new THREE.MeshBasicMaterial({ color: 0x2d7ea6, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  const waterGeo = new THREE.PlaneGeometry(room.rect[2] - room.rect[0] - 0.6, room.rect[3] - room.rect[1] - 0.6);
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(cx, floorY + 0.02, cz);
  water.visible = false;
  water.name = 'bioskop-air';
  scene?.add(water);
  owned.push(waterGeo, waterMat);

  // kursi hantu: menempati kursi yang sengaja dikosongkan di denah; tampak seperti kursi lain sampai adegan hantu menggesernya
  let ghost = null;
  if (plan.ghost) {
    ghost = new THREE.Group();
    ghost.name = 'bioskop-kursi-hantu';
    const mat = new THREE.MeshStandardMaterial({ color: 0x7a1f2b, roughness: 0.8 });
    const seatGeo = new THREE.BoxGeometry(0.55, 0.5, 0.55);
    const backGeo = new THREE.BoxGeometry(0.55, 0.6, 0.12);
    const base = new THREE.Mesh(seatGeo, mat);
    base.position.set(0, 0.28, 0);
    const back = new THREE.Mesh(backGeo, mat);
    back.position.set(0, 0.72, -0.24);
    ghost.add(base, back);
    ghost.position.set(plan.ghost.x, floorY, plan.ghost.z);
    ghost.rotation.y = SEAT_FACE;
    scene?.add(ghost);
    owned.push(mat, seatGeo, backGeo);
  }

  // lapisan layar: gelap, kilatan, dan nuansa bawah air
  let root = null;
  let dimEl = null;
  let flashEl = null;
  let tintEl = null;
  let hud = null;
  let hudText = null;
  let hudBtn = null;
  if (doc?.createElement && doc.body) {
    root = doc.createElement('div');
    root.setAttribute?.('aria-hidden', 'true');
    Object.assign(root.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '4' });
    const layer = (color) => {
      const el = doc.createElement('div');
      Object.assign(el.style, { position: 'absolute', inset: '0', opacity: '0', background: color });
      root.appendChild(el);
      return el;
    };
    tintEl = layer('rgb(20, 90, 130)');
    dimEl = layer('radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.95) 100%)');
    flashEl = layer('#fff');
    doc.body.appendChild(root);

    hud = doc.createElement('div');
    Object.assign(hud.style, {
      position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 8px)', left: '50%', transform: 'translateX(-50%)', zIndex: '6', display: 'none',
      maxWidth: '92%', padding: '6px 12px', borderRadius: '14px', background: 'rgba(10,10,14,0.72)', color: '#fff', font: '600 12px system-ui, sans-serif',
      alignItems: 'center', gap: '10px', whiteSpace: 'nowrap',
    });
    hudText = doc.createElement('span');
    hudBtn = doc.createElement('button');
    hudBtn.type = 'button';
    Object.assign(hudBtn.style, { font: 'inherit', color: '#fff', background: 'rgba(255,255,255,0.16)', border: '0', borderRadius: '10px', padding: '4px 8px' });
    hudBtn.addEventListener('click', () => cycle());
    hud.appendChild(hudText);
    hud.appendChild(hudBtn);
    doc.body.appendChild(hud);
  }

  function setComfort(mode) {
    if (reduced || !COMFORT_CYCLE.includes(mode)) return comfort;
    comfort = mode;
    try { win?.localStorage?.setItem(STORE_KEY, mode); } catch { /* penyimpanan tidak tersedia */ }
    return comfort;
  }
  function cycle() {
    return setComfort(COMFORT_CYCLE[(COMFORT_CYCLE.indexOf(comfort) + 1) % COMFORT_CYCLE.length]);
  }

  let fade = 0;
  let first = true;
  let lastFlash = 0;
  let lastTransform = '';
  let lastParentOverflow = null;
  let state = { inside: false, id: null, playing: false, t: 0, values: NONE };

  function setTransform(value) {
    if (!canvas || value === lastTransform) return;
    lastTransform = value;
    canvas.style.transform = value;
    canvas.style.transformOrigin = 'center center';
    const parent = canvas.parentElement;
    if (parent) {
      if (value && lastParentOverflow === null) {
        lastParentOverflow = parent.style.overflow ?? '';
        parent.style.overflow = 'hidden';
      } else if (!value && lastParentOverflow !== null) {
        parent.style.overflow = lastParentOverflow;
        lastParentOverflow = null;
      }
    }
  }

  function update({ me, delta = 0.016, nowMs = Date.now(), active = true } = {}) {
    const here = !!(active && me && me.level === CINEMA_LEVEL && !me.villa && inside(room.rect, me.x, me.z));
    if (first) {
      fade = here ? 1 : 0;
      first = false;
    }
    fade += ((here ? 1 : 0) - fade) * (1 - Math.exp(-4 * clamp(delta, 0, 0.1)));
    if (!here && fade < 0.005) fade = 0;
    const show = showAt(nowMs);
    const raw = here && show.playing ? sceneAt(show.scene, show.t, { dist: seatDistance(me.x, plan.screen.x), comfort }) : NONE;
    const v = fade >= 0.999 ? raw : Object.fromEntries(Object.entries(raw).map(([k, val]) => [k, val * fade]));
    state = { inside: here, id: show.id, playing: show.playing, t: show.t, values: v };

    // kamera: horizon miring dan guncangan
    const aspect = canvas && canvas.clientHeight ? canvas.clientWidth / canvas.clientHeight : 1.8;
    setTransform(canvasTransform({ tilt: v.tilt, shake: shakeOffset(v.shake, nowMs / 1000), aspect }));

    // lapisan layar
    const o = overlayLevels(v);
    if (dimEl) {
      dimEl.style.opacity = o.dim.toFixed(3);
      flashEl.style.opacity = o.flash.toFixed(3);
      tintEl.style.opacity = o.tint.toFixed(3);
    }
    spray.update({ level: v.mist, delta });

    // air di lantai dan kursi hantu
    water.visible = v.water > 0.01;
    water.position.y = floorY + 0.02 + v.water;
    if (ghost) {
      ghost.visible = me?.level === CINEMA_LEVEL;
      ghost.rotation.y = SEAT_FACE + v.chair * 1.2;
      ghost.position.x = plan.ghost.x - v.chair * 0.9;
    }

    // getaran dan suara
    const now = nowMs / 1000;
    haptic(now, v.rumble);
    if (v.flash > 0.5 && lastFlash <= 0.5) sound.sting();
    lastFlash = v.flash;
    sound.update({ rumble: v.rumble, wind: v.wind, whisper: v.whisper, underwater: v.water > EYE_WATER, active: here && show.playing });

    // papan info dan tombol kenyamanan
    if (hud) {
      hud.style.display = here ? 'flex' : 'none';
      if (here) {
        hudText.textContent = show.playing ? `Bioskop 5D · sedang tayang: ${show.scene.title}` : `Bioskop 5D · berikutnya ${titleOf(show.nextId)} dalam ${mmss(show.nextIn)}`;
        hudBtn.textContent = `Kenyamanan: ${COMFORT_LABEL[comfort]}`;
        hudBtn.disabled = reduced;
      }
    }
  }

  return {
    update,
    setComfort,
    cycleComfort: cycle,
    info: () => ({ on: true, ...state, comfort, reducedMotion: reduced, water: { visible: water.visible, y: water.position.y }, transform: lastTransform }),
    dispose() {
      setTransform('');
      scene?.remove(water);
      if (ghost) scene?.remove(ghost);
      for (const r of owned) r.dispose?.();
      root?.remove?.();
      hud?.remove?.();
      spray.dispose?.();
      sound.dispose();
    },
  };
}
