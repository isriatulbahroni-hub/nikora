// Geometri empat mobil mewah (THREE, prosedural, tanpa berkas model). Kerangka: depan = +z, kanan mobil = -x (setir kanan).
// buildLuxuryCar(id, { paint }) -> ember geometri yang digabung per bahan agar jumlah draw call kecil:
//   paint (putih, diwarnai bahan), trim (warna vertex: krom, plastik, jok, dasbor), glass, head/tail/rev (lampu, warna diatur view),
//   wheel (satu roda: ban+pelek+kaliper, sumbu x, sisi luar +x), doors (satu geometri per pintu, cat sudah dibakar), wheels/plates (jangkar).
import * as THREE from 'three';
import { CAR_MODELS } from './car-models.js';
import { box, cyl, loftGeometry, merge, part, rbox, stationAt } from './car-loft.js';

const W = '#ffffff';
const CHROME = '#d9dde3';
const DARK = '#0d0e11';
const GUN = '#2a2d33';
const RUBBER = '#101010';
const GLASSY = '#7fa3bd';

const buckets = () => ({ paint: [], trim: [], glass: [], head: [], tail: [], rev: [] });
const both = (fn) => { fn(-1); fn(1); }; // s = -1 (kanan mobil) dan +1 (kiri mobil) di sumbu x

/** Potong tabel stasiun badan di [z0, z1]: belakang | tengah (kabin) | depan, dengan stasiun sambungan di z0 dan z1. */
export function splitTub(tub, z0, z1) {
  const a = stationAt(tub, z0);
  const b = stationAt(tub, z1);
  return {
    rear: [...tub.filter((s) => s.z < z0), a],
    mid: [a, ...tub.filter((s) => s.z > z0 && s.z < z1), b],
    front: [b, ...tub.filter((s) => s.z > z1)],
  };
}

// ---------------------------------------------------------------- roda
/** style: { spokes, spokeW, rim, lip, caliper, disc, dish }. Sumbu x, sisi luar +x, pusat di asal. */
export function wheelGeometry(m, style) {
  const R = m.wheelRadius;
  const hw = m.tireWidth / 2;
  const Rr = R * 0.66;
  const parts = [];
  const prof = [[Rr * 0.9, -hw], [R - 0.05, -hw], [R - 0.014, -hw + 0.035], [R, -hw + 0.09], [R, hw - 0.09], [R - 0.014, hw - 0.035], [R - 0.05, hw], [Rr * 0.9, hw]].map(([x, y]) => new THREE.Vector2(x, y));
  parts.push(part(new THREE.LatheGeometry(prof, 20), RUBBER, { rz: -Math.PI / 2 }));
  parts.push(part(cyl(Rr * 0.97, Rr * 0.97, m.tireWidth * 0.8, 16), style.barrel ?? GUN, { rz: Math.PI / 2 }));
  parts.push(part(cyl(Rr * 0.82, Rr * 0.82, 0.02, 16), style.disc ?? '#4a4d52', { x: hw * 0.35, rz: Math.PI / 2 }));
  const face = hw - 0.025;
  parts.push(part(new THREE.TorusGeometry(Rr, 0.013, 5, 20), style.lip ?? style.rim, { x: face, ry: Math.PI / 2 }));
  parts.push(part(cyl(Rr * 0.2, Rr * 0.2, 0.04, 14), style.hub ?? CHROME, { x: face + 0.005, rz: Math.PI / 2 }));
  for (let i = 0; i < style.spokes; i++) {
    const a = (i / style.spokes) * Math.PI * 2;
    parts.push(part(box(0.035, Rr * 0.84, style.spokeW), style.rim, { x: face - (style.dish ?? 0.02), y: Math.cos(a) * Rr * 0.46, z: Math.sin(a) * Rr * 0.46, rx: a }));
  }
  parts.push(part(rbox(0.07, 0.13, 0.22, 0.02), style.caliper, { x: hw * 0.5, y: Rr * 0.55, z: 0.04 }));
  return merge(parts);
}

const WHEEL_STYLES = {
  royale: { spokes: 10, spokeW: 0.028, rim: CHROME, lip: CHROME, caliper: '#8a8f96', dish: 0.015 },
  noir: { spokes: 10, spokeW: 0.04, rim: '#6b5a3a', lip: '#c9a24b', caliper: '#e0a800', dish: 0.02 },
  argent: { spokes: 5, spokeW: 0.1, rim: '#18191c', lip: '#c01822', caliper: '#c01822', dish: 0.03 },
  rubis: { spokes: 8, spokeW: 0.06, rim: '#2c2f35', lip: '#7d828a', caliper: '#c8ccd2', dish: 0.02 },
};

// ---------------------------------------------------------------- bagian kabin (jok, setir, dasbor, lantai)
function cabinInterior(b, m, { z0, z1, floorY, dashY, dashH = 0.3, dashZ }) {
  const top = 0.665 + m.seatLift; // permukaan dudukan = pinggul avatar (lihat seatPose di vehicle-fleet.js)
  const inter = m.interior;
  const widthIn = m.width * 0.72;
  b.trim.push(part(rbox(widthIn, 0.05, z1 - z0 - 0.1, 0.02), '#121316', { y: floorY, z: (z0 + z1) / 2 }));
  m.seats.forEach((s, i) => {
    const x = -s.side;
    b.trim.push(part(rbox(0.5, 0.13, 0.54, 0.05), inter, { x, y: top - 0.065, z: s.fwd }));
    b.trim.push(part(rbox(0.36, top - floorY - 0.1, 0.4, 0.03), '#16171a', { x, y: floorY + (top - floorY) / 2 - 0.02, z: s.fwd }));
    b.trim.push(part(rbox(0.5, 0.62, 0.13, 0.05), inter, { x, y: top + 0.31, z: s.fwd - 0.27, rx: -0.2 }));
    b.trim.push(part(rbox(0.24, 0.2, 0.11, 0.05), inter, { x, y: top + 0.74, z: s.fwd - 0.33, rx: -0.2 }));
    if (i === 0) { // setir di kanan
      b.trim.push(part(new THREE.TorusGeometry(0.17, 0.02, 8, 22), '#15161a', { x, y: top + 0.36, z: s.fwd + 0.62, rx: -0.35 }));
      b.trim.push(part(cyl(0.025, 0.025, 0.36, 8), GUN, { x, y: top + 0.24, z: s.fwd + 0.74, rx: Math.PI / 2 - 0.35 }));
    }
  });
  b.trim.push(part(rbox(m.width * 0.8, dashH, 0.36, 0.06), '#17181c', { y: dashY, z: dashZ }));
  b.trim.push(part(rbox(m.width * 0.76, 0.03, 0.3, 0.015), inter, { y: dashY + dashH / 2 + 0.01, z: dashZ }));
  b.trim.push(part(rbox(0.22, 0.25, z1 - z0 - 0.5, 0.05), '#1b1c20', { y: floorY + 0.14, z: (z0 + z1) / 2 }));
}

// ---------------------------------------------------------------- pintu (satu geometri per pintu, cat dibakar)
function doorGeometry(def, paint, handleColor = CHROME) {
  const { side, len, h, thick = 0.055, dir } = def;
  const parts = [part(rbox(thick, h, len, 0.022), paint, { x: side * thick * 0.5, z: dir * len / 2 })];
  parts.push(part(rbox(0.03, 0.03, 0.2, 0.012), handleColor, { x: side * (thick + 0.008), y: h * 0.18, z: dir * len * (dir > 0 ? 0.82 : 0.82) }));
  return merge(parts);
}

/** Bakar geometri pintu dengan cat sebuah mobil. specs = doorSpecs milik model (lihat buildLuxuryCar). */
export function bakeDoors(m, specs, paint) {
  return specs.map((d) => {
    const hingeX = d.side * d.x; // d.x > 0 = jarak ke sumbu; side: +1 = kiri mobil (+x), -1 = kanan mobil (-x)
    const geometry = doorGeometry({ ...d, dir: d.dir }, paint);
    return {
      seats: d.seats, side: d.side, style: m.doors.style, open: m.doors.open,
      pivot: { x: hingeX, y: d.y, z: d.hingeZ }, axis: d.axis ?? 'y',
      sign: d.axis === 'x' ? 1 : d.side * d.dir, geometry,
    };
  });
}

// ---------------------------------------------------------------- model 1: coupe mewah panjang (Royale Sweep)
function royale(b, m, paint) {
  const tub = [
    { z: -2.775, hw: 0.36, y0: 0.46, y1: 0.86, n: 2.4 }, { z: -2.62, hw: 0.76, y0: 0.32, y1: 1.0, n: 3 }, { z: -2.2, hw: 0.93, y0: 0.27, y1: 1.1, n: 3.2 },
    { z: -1.0, hw: 1.0, y0: 0.25, y1: 1.15, n: 3.4 }, { z: 0.4, hw: 1.0, y0: 0.25, y1: 1.13, n: 3.4 }, { z: 1.3, hw: 0.99, y0: 0.25, y1: 1.07, n: 3.4 },
    { z: 2.2, hw: 0.95, y0: 0.27, y1: 1.02, n: 3.2 }, { z: 2.62, hw: 0.92, y0: 0.28, y1: 1.02, n: 3.2 }, { z: 2.775, hw: 0.8, y0: 0.32, y1: 0.98, n: 3 },
  ];
  const cabin = [
    { z: -2.05, hw: 0.24, y0: 1.1, y1: 1.16, n: 2.2 }, { z: -1.5, hw: 0.68, y0: 1.08, y1: 1.38, n: 2.4 }, { z: -0.3, hw: 0.82, y0: 1.08, y1: 1.5, n: 2.6 },
    { z: 0.55, hw: 0.82, y0: 1.06, y1: 1.46, n: 2.6 }, { z: 1.05, hw: 0.78, y0: 1.04, y1: 1.14, n: 2.4 },
  ];
  const { rear, mid, front } = splitTub(tub, -0.9, 1.05);
  b.paint.push(part(loftGeometry(rear), W), part(loftGeometry(front), W));
  b.paint.push(part(loftGeometry(mid, { arc: [Math.PI * 0.62, Math.PI * 2.38], segments: 16 }), W));
  b.glass.push(part(loftGeometry(cabin, { segments: 24 }), GLASSY));
  cabinInterior(b, m, { z0: -0.9, z1: 1.05, floorY: 0.42, dashY: 0.92, dashZ: 0.82 });
  const L = m.length / 2;
  // gril krom besar bergaya kuil + bumper krom + lampu bulat
  b.trim.push(part(rbox(0.74, 0.68, 0.08, 0.025), CHROME, { y: 0.7, z: L + 0.02 }));
  b.trim.push(part(rbox(0.64, 0.58, 0.04, 0.015), DARK, { y: 0.7, z: L + 0.055 }));
  for (let i = 0; i < 13; i++) b.trim.push(part(box(0.016, 0.56, 0.04), CHROME, { x: -0.288 + i * 0.048, y: 0.7, z: L + 0.075 }));
  b.trim.push(part(cyl(0.0, 0.035, 0.1, 8), CHROME, { y: 1.07, z: L - 0.04, rx: -0.2 }));
  b.trim.push(part(rbox(1.7, 0.24, 0.07, 0.03), '#0e0f12', { y: 0.46, z: L - 0.06 }));
  b.trim.push(part(rbox(1.5, 0.1, 0.1, 0.04), CHROME, { y: 0.33, z: L + 0.0 }));
  b.trim.push(part(rbox(0.5, 0.12, 0.02, 0.01), '#f2f2ec', { y: 0.33, z: L + 0.062 }));
  both((s) => {
    b.trim.push(part(cyl(0.125, 0.125, 0.07, 16), CHROME, { x: s * 0.66, y: 0.64, z: L - 0.05, rx: Math.PI / 2 }));
    b.head.push(part(cyl(0.1, 0.1, 0.05, 16), W, { x: s * 0.66, y: 0.64, z: L - 0.02, rx: Math.PI / 2 }));
    b.tail.push(part(rbox(0.3, 0.05, 0.04, 0.02), W, { x: s * 0.5, y: 0.93, z: -L + 0.07 }));
    b.rev.push(part(rbox(0.1, 0.04, 0.04, 0.015), W, { x: s * 0.2, y: 0.86, z: -L + 0.1 }));
    b.trim.push(part(cyl(0.05, 0.05, 0.16, 12), '#33363c', { x: s * 0.5, y: 0.34, z: -L + 0.0, rx: Math.PI / 2 }));
    b.paint.push(part(rbox(0.17, 0.11, 0.1, 0.04), W, { x: s * 1.04, y: 1.1, z: 0.95 }));
    b.trim.push(part(box(0.03, 0.01, 3.5), CHROME, { x: s * 0.995, y: 1.0, z: 0.1 }));
  });
  b.trim.push(part(rbox(0.5, 0.12, 0.02, 0.01), '#f2f2ec', { y: 0.7, z: -L - 0.01 }));
  const doorSpecs = [
    { seats: [0], side: -1, x: 1.012, y: 0.64, hingeZ: -0.55, len: 1.5, h: 0.62, dir: 1 },
    { seats: [1], side: 1, x: 1.012, y: 0.64, hingeZ: -0.55, len: 1.5, h: 0.62, dir: 1 },
  ];
  return { doorSpecs, axles: { front: L - 1.0, rear: -L + 1.05 }, track: 0.95, plates: [{ x: 0, y: 0.33, z: L + 0.072, ry: 0 }, { x: 0, y: 0.7, z: -L - 0.02, ry: Math.PI }], wheelStyle: 'royale' };
}

// ---------------------------------------------------------------- model 2: roadster hitam (Noir Aero)
function noir(b, m, paint) {
  const tub = [
    { z: -2.31, hw: 0.62, y0: 0.34, y1: 0.78, n: 3 }, { z: -2.15, hw: 0.9, y0: 0.25, y1: 0.92, n: 3 }, { z: -1.6, hw: 0.98, y0: 0.22, y1: 0.95, n: 3.4 },
    { z: -0.2, hw: 1.02, y0: 0.2, y1: 0.88, n: 3.6 }, { z: 0.9, hw: 1.0, y0: 0.2, y1: 0.82, n: 3.6 }, { z: 1.6, hw: 0.96, y0: 0.2, y1: 0.7, n: 3.4 },
    { z: 2.1, hw: 0.86, y0: 0.22, y1: 0.56, n: 3 }, { z: 2.31, hw: 0.66, y0: 0.25, y1: 0.45, n: 2.6 },
  ];
  const { rear, mid, front } = splitTub(tub, -0.9, 1.0);
  b.paint.push(part(loftGeometry(rear), W), part(loftGeometry(front), W));
  b.paint.push(part(loftGeometry(mid, { arc: [Math.PI * 0.6, Math.PI * 2.4], segments: 16 }), W));
  cabinInterior(b, m, { z0: -0.9, z1: 1.0, floorY: 0.4, dashY: 0.74, dashH: 0.26, dashZ: 0.8 });
  const L = m.length / 2;
  // kaca depan miring, tiang hitam, tulang punggung + dua punuk di belakang jok
  b.glass.push(part(box(1.5, 0.02, 0.62), GLASSY, { y: 1.0, z: 0.66, rx: -0.62 }));
  both((s) => {
    b.trim.push(part(rbox(0.04, 0.04, 0.7, 0.015), DARK, { x: s * 0.76, y: 1.0, z: 0.66, rx: -0.62 }));
    b.paint.push(part(rbox(0.44, 0.22, 1.05, 0.1), W, { x: s * 0.52, y: 0.98, z: -1.22, rx: 0.1 }));
    b.trim.push(part(rbox(0.12, 0.22, 0.32, 0.03), DARK, { x: s * 0.8, y: 0.62, z: 1.95 }));
    b.head.push(part(rbox(0.5, 0.045, 0.04, 0.02), W, { x: s * 0.62, y: 0.58, z: L - 0.18, ry: s * -0.35 }));
    b.tail.push(part(rbox(0.55, 0.05, 0.04, 0.02), W, { x: s * 0.42, y: 0.82, z: -L + 0.05 }));
    b.rev.push(part(rbox(0.1, 0.04, 0.04, 0.015), W, { x: s * 0.82, y: 0.7, z: -L + 0.14 }));
    b.trim.push(part(rbox(0.012, 0.02, 1.4, 0.006), '#e0a800', { x: s * 1.02, y: 0.4, z: 0.3 }));
    b.paint.push(part(rbox(0.15, 0.1, 0.1, 0.04), W, { x: s * 1.06, y: 0.9, z: 0.55 }));
  });
  b.trim.push(part(rbox(0.56, 0.16, 0.5, 0.03), '#0e0f12', { y: 0.98, z: -0.62 }));
  for (let i = 0; i < 6; i++) b.trim.push(part(box(0.5, 0.012, 0.03), '#3a3d44', { y: 1.07 + i * 0.002, z: -1.9 + i * 0.07 }));
  // gril tapal kuda: busur krom terbalik + dua batang tegak + celah gelap
  b.trim.push(part(rbox(0.55, 0.36, 0.06, 0.03), DARK, { y: 0.4, z: L - 0.03 }));
  b.trim.push(part(new THREE.TorusGeometry(0.27, 0.028, 8, 20, Math.PI), CHROME, { y: 0.44, z: L + 0.02 }));
  b.trim.push(part(rbox(0.045, 0.3, 0.05, 0.015), CHROME, { x: -0.27, y: 0.29, z: L + 0.02 }));
  b.trim.push(part(rbox(0.045, 0.3, 0.05, 0.015), CHROME, { x: 0.27, y: 0.29, z: L + 0.02 }));
  b.trim.push(part(rbox(1.5, 0.05, 0.4, 0.02), '#0b0b0d', { y: 0.18, z: L - 0.16 }));
  b.trim.push(part(rbox(1.2, 0.08, 0.14, 0.03), '#0b0b0d', { y: 0.26, z: -L + 0.04 }));
  for (const x of [-0.5, -0.17, 0.17, 0.5]) b.trim.push(part(cyl(0.05, 0.05, 0.2, 10), '#46484e', { x, y: 0.3, z: -L - 0.02, rx: Math.PI / 2 }));
  b.trim.push(part(rbox(0.5, 0.12, 0.02, 0.01), '#f2f2ec', { y: 0.55, z: -L - 0.0 }));
  const doorSpecs = [
    { seats: [0], side: -1, x: 1.03, y: 0.52, hingeZ: 0.62, len: 1.25, h: 0.42, dir: -1 },
    { seats: [1], side: 1, x: 1.03, y: 0.52, hingeZ: 0.62, len: 1.25, h: 0.42, dir: -1 },
  ];
  return { doorSpecs, axles: { front: L - 0.95, rear: -L + 0.93 }, track: 0.99, plates: [{ x: 0, y: 0.24, z: L + 0.02, ry: 0 }, { x: 0, y: 0.55, z: -L - 0.012, ry: Math.PI }], wheelStyle: 'noir' };
}

// ---------------------------------------------------------------- model 3: hypercar baji perak-merah (Argent Fury)
function argent(b, m, paint) {
  const tub = [
    { z: -2.425, hw: 0.8, y0: 0.34, y1: 0.98, n: 4 }, { z: -2.2, hw: 1.0, y0: 0.24, y1: 1.04, n: 3.6 }, { z: -1.2, hw: 1.03, y0: 0.19, y1: 1.08, n: 3.6 },
    { z: -0.2, hw: 1.03, y0: 0.17, y1: 0.98, n: 3.8 }, { z: 0.8, hw: 0.99, y0: 0.17, y1: 0.78, n: 3.8 }, { z: 1.6, hw: 0.95, y0: 0.17, y1: 0.52, n: 3.8 },
    { z: 2.2, hw: 0.88, y0: 0.17, y1: 0.38, n: 4.5 }, { z: 2.425, hw: 0.84, y0: 0.19, y1: 0.33, n: 5 },
  ];
  const cabin = [
    { z: -1.0, hw: 0.5, y0: 0.96, y1: 1.1, n: 2.2 }, { z: -0.4, hw: 0.8, y0: 0.94, y1: 1.18, n: 2.4 }, { z: 0.5, hw: 0.8, y0: 0.84, y1: 1.16, n: 2.4 },
    { z: 1.18, hw: 0.76, y0: 0.6, y1: 0.7, n: 2.3 },
  ];
  const { rear, mid, front } = splitTub(tub, -0.7, 1.05);
  b.paint.push(part(loftGeometry(rear), W), part(loftGeometry(front), W));
  b.paint.push(part(loftGeometry(mid, { arc: [Math.PI * 0.62, Math.PI * 2.38], segments: 16 }), W));
  b.glass.push(part(loftGeometry(cabin, { segments: 22 }), GLASSY));
  b.paint.push(part(loftGeometry(cabin.slice(0, 3).map((s) => ({ ...s, hw: s.hw * 0.7, y0: s.y1 - 0.045, y1: s.y1 + 0.012 })), { segments: 16 }), W));
  cabinInterior(b, m, { z0: -0.7, z1: 1.05, floorY: 0.36, dashY: 0.62, dashH: 0.22, dashZ: 0.86 });
  const L = m.length / 2;
  // splitter karbon bergaris merah, intake besar, sayap belakang, difuser, knalpot segi enam, lampu bentuk Y
  b.trim.push(part(rbox(1.66, 0.035, 0.22, 0.012), DARK, { y: 0.13, z: L - 0.02 }));
  b.trim.push(part(rbox(1.66, 0.015, 0.025, 0.006), '#c01822', { y: 0.155, z: L + 0.09 }));
  b.trim.push(part(rbox(0.9, 0.14, 0.06, 0.02), DARK, { y: 0.26, z: L - 0.02 }));
  for (const x of [-0.18, 0.18]) b.trim.push(part(rbox(0.06, 0.16, 0.5, 0.02), '#0e0f12', { x, y: 1.14, z: -1.5, rx: 0.1 }));
  b.trim.push(part(rbox(0.5, 0.15, 0.45, 0.04), '#0b0b0d', { y: 1.22, z: -0.45, rx: -0.2 }));
  b.trim.push(part(rbox(1.3, 0.16, 0.22, 0.03), '#0b0b0d', { y: 0.3, z: -L + 0.06 }));
  for (let i = -1; i <= 1; i++) b.trim.push(part(cyl(0.065, 0.065, 0.24, 6), '#3f4147', { x: i * 0.17, y: 0.62, z: -L + 0.04, rx: Math.PI / 2 }));
  b.paint.push(part(rbox(1.78, 0.045, 0.42, 0.02), W, { y: 1.34, z: -L + 0.15, rx: 0.08 }));
  b.trim.push(part(rbox(1.78, 0.015, 0.03, 0.006), '#c01822', { y: 1.35, z: -L + 0.36 }));
  both((s) => {
    b.trim.push(part(rbox(0.05, 0.4, 0.05, 0.02), GUN, { x: s * 0.55, y: 1.14, z: -L + 0.16 }));
    b.trim.push(part(rbox(0.14, 0.2, 0.9, 0.04), '#0b0b0d', { x: s * 1.0, y: 0.5, z: -0.9 }));
    b.trim.push(part(rbox(0.5, 0.1, 0.05, 0.02), '#0b0b0d', { x: s * 0.62, y: 0.3, z: L - 0.1 }));
    b.trim.push(part(rbox(0.02, 0.035, 2.2, 0.01), '#c01822', { x: s * 1.0, y: 0.22, z: 0.2 }));
    b.head.push(part(rbox(0.46, 0.04, 0.04, 0.015), W, { x: s * 0.6, y: 0.36, z: L - 0.14, ry: s * -0.28 }));
    b.head.push(part(rbox(0.04, 0.04, 0.26, 0.015), W, { x: s * 0.88, y: 0.36, z: L - 0.3 }));
    b.tail.push(part(rbox(0.5, 0.05, 0.04, 0.02), W, { x: s * 0.52, y: 0.84, z: -L + 0.02 }));
    b.tail.push(part(rbox(0.05, 0.3, 0.04, 0.02), W, { x: s * 0.82, y: 0.72, z: -L + 0.06, rz: s * 0.4 }));
    b.rev.push(part(rbox(0.1, 0.04, 0.04, 0.015), W, { x: s * 0.36, y: 0.52, z: -L + 0.0 }));
    b.paint.push(part(rbox(0.15, 0.09, 0.1, 0.04), W, { x: s * 1.04, y: 0.92, z: 0.62 }));
  });
  b.trim.push(part(rbox(0.5, 0.12, 0.02, 0.01), '#f2f2ec', { y: 0.2, z: L + 0.03 }));
  b.trim.push(part(rbox(0.5, 0.1, 0.02, 0.01), '#f2f2ec', { y: 0.46, z: -L - 0.01 }));
  const doorSpecs = [
    { seats: [0], side: -1, x: 1.045, y: 0.62, hingeZ: 0.55, len: 1.35, h: 0.44, dir: -1, axis: 'x' },
    { seats: [1], side: 1, x: 1.045, y: 0.62, hingeZ: 0.55, len: 1.35, h: 0.44, dir: -1, axis: 'x' },
  ];
  return { doorSpecs, axles: { front: L - 1.0, rear: -L + 0.95 }, track: 1.0, plates: [{ x: 0, y: 0.2, z: L + 0.04, ry: 0 }, { x: 0, y: 0.46, z: -L - 0.02, ry: Math.PI }], wheelStyle: 'argent' };
}

// ---------------------------------------------------------------- model 4: SUV mewah merah (Rubis Grand)
function rubis(b, m, paint) {
  const tub = [
    { z: -2.67, hw: 0.84, y0: 0.5, y1: 1.3, n: 3.2 }, { z: -2.5, hw: 0.98, y0: 0.4, y1: 1.34, n: 3.4 }, { z: -0.5, hw: 1.0, y0: 0.38, y1: 1.34, n: 3.6 },
    { z: 1.2, hw: 1.0, y0: 0.38, y1: 1.3, n: 3.6 }, { z: 2.0, hw: 0.98, y0: 0.36, y1: 1.22, n: 3.4 }, { z: 2.55, hw: 0.94, y0: 0.34, y1: 1.15, n: 3.2 },
    { z: 2.67, hw: 0.86, y0: 0.4, y1: 1.05, n: 3 },
  ];
  const cabin = [
    { z: -2.45, hw: 0.78, y0: 1.26, y1: 1.58, n: 2.6 }, { z: -2.2, hw: 0.88, y0: 1.26, y1: 1.78, n: 2.6 }, { z: -0.2, hw: 0.9, y0: 1.26, y1: 1.83, n: 2.8 },
    { z: 0.9, hw: 0.9, y0: 1.26, y1: 1.8, n: 2.8 }, { z: 1.35, hw: 0.86, y0: 1.24, y1: 1.4, n: 2.5 },
  ];
  const { rear, mid, front } = splitTub(tub, -2.3, 1.2);
  b.paint.push(part(loftGeometry(rear), W), part(loftGeometry(front), W));
  b.paint.push(part(loftGeometry(mid, { arc: [Math.PI * 0.64, Math.PI * 2.36], segments: 16 }), W));
  b.glass.push(part(loftGeometry(cabin, { segments: 24 }), GLASSY));
  b.paint.push(part(loftGeometry(cabin.slice(1, 4).map((s) => ({ ...s, hw: s.hw * 0.82, y0: s.y1 - 0.07, y1: s.y1 + 0.012 })), { segments: 16 }), W));
  cabinInterior(b, m, { z0: -2.3, z1: 1.2, floorY: 0.5, dashY: 1.0, dashH: 0.34, dashZ: 1.0 });
  const L = m.length / 2;
  // gril kuil krom tinggi, lampu LED tipis, bemper krom, rel atap, garis kaca krom, knalpot ganda
  b.trim.push(part(rbox(0.86, 1.0, 0.1, 0.03), CHROME, { y: 0.78, z: L + 0.02 }));
  b.trim.push(part(rbox(0.74, 0.88, 0.05, 0.02), DARK, { y: 0.78, z: L + 0.06 }));
  for (let i = 0; i < 17; i++) b.trim.push(part(box(0.016, 0.84, 0.04), CHROME, { x: -0.34 + i * 0.0425, y: 0.78, z: L + 0.08 }));
  b.trim.push(part(rbox(1.74, 0.28, 0.08, 0.03), '#0e0f12', { y: 0.5, z: L - 0.06 }));
  b.trim.push(part(rbox(1.5, 0.12, 0.1, 0.04), CHROME, { y: 0.42, z: L - 0.02 }));
  b.trim.push(part(rbox(0.5, 0.12, 0.02, 0.01), '#f2f2ec', { y: 0.42, z: L + 0.04 }));
  b.trim.push(part(rbox(1.8, 0.14, 0.1, 0.04), CHROME, { y: 0.52, z: -L + 0.02 }));
  b.trim.push(part(rbox(0.5, 0.12, 0.02, 0.01), '#f2f2ec', { y: 0.95, z: -L - 0.02 }));
  both((s) => {
    b.head.push(part(rbox(0.5, 0.07, 0.04, 0.02), W, { x: s * 0.66, y: 1.0, z: L - 0.1 }));
    b.head.push(part(rbox(0.36, 0.05, 0.04, 0.02), W, { x: s * 0.68, y: 0.84, z: L - 0.04 }));
    b.tail.push(part(rbox(0.1, 0.32, 0.04, 0.02), W, { x: s * 0.76, y: 1.1, z: -L + 0.03 }));
    b.rev.push(part(rbox(0.1, 0.05, 0.04, 0.015), W, { x: s * 0.5, y: 0.7, z: -L + 0.02 }));
    b.trim.push(part(cyl(0.05, 0.05, 0.16, 12), CHROME, { x: s * 0.55, y: 0.42, z: -L + 0.0, rx: Math.PI / 2 }));
    b.trim.push(part(box(0.03, 0.012, 3.3), CHROME, { x: s * 0.912, y: 1.28, z: -0.45 }));
    b.paint.push(part(rbox(0.18, 0.12, 0.11, 0.04), W, { x: s * 1.06, y: 1.28, z: 1.0 }));
  });
  const doorSpecs = [
    { seats: [0], side: -1, x: 1.016, y: 0.83, hingeZ: 1.1, len: 1.05, h: 0.8, dir: -1 },
    { seats: [1], side: 1, x: 1.016, y: 0.83, hingeZ: 1.1, len: 1.05, h: 0.8, dir: -1 },
    { seats: [2], side: -1, x: 1.016, y: 0.83, hingeZ: -1.9, len: 1.05, h: 0.8, dir: 1 },
    { seats: [3], side: 1, x: 1.016, y: 0.83, hingeZ: -1.9, len: 1.05, h: 0.8, dir: 1 },
  ];
  return { doorSpecs, axles: { front: L - 0.95, rear: -L + 1.09 }, track: 0.96, plates: [{ x: 0, y: 0.42, z: L + 0.05, ry: 0 }, { x: 0, y: 0.95, z: -L - 0.03, ry: Math.PI }], wheelStyle: 'rubis' };
}

const BUILDERS = { royale, noir, argent, rubis };

/** Bangun satu model. paint = warna cat untuk pintu (badan memakai bahan bercat per mobil). */
export function buildLuxuryCar(id, { paint } = {}) {
  const m = CAR_MODELS[id];
  if (!m) throw new Error(`model mobil tidak dikenal: ${id}`);
  const b = buckets();
  const d = BUILDERS[id](b, m, paint ?? m.paint);
  const out = { model: m };
  for (const k of Object.keys(b)) out[k] = merge(b[k]);
  out.wheel = wheelGeometry(m, WHEEL_STYLES[d.wheelStyle]);
  const wy = m.wheelRadius;
  out.wheels = [];
  for (const [zk, front] of [['front', true], ['rear', false]]) for (const side of [-1, 1]) out.wheels.push({ x: side * d.track, y: wy, z: d.axles[zk], front, side });
  out.doorSpecs = d.doorSpecs;
  out.doors = bakeDoors(m, d.doorSpecs, paint ?? m.paint);
  out.plates = d.plates;
  return out;
}

export { CAR_MODELS };
