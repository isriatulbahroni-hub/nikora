// Pembentuk badan mobil: "loft" penampang superelips antar-stasiun (z) menjadi permukaan mulus, tanpa berkas model eksternal.
// Dipakai luxury-cars.js. Penampang = |x/hw|^n + |(y-ym)/hh|^n = 1: n=2 elips, n besar = kotak bersudut membulat.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { part, merge } from './villa-props.js';

export { part, merge };
const sgnPow = (v, e) => Math.sign(v) * Math.abs(v) ** e;

/**
 * stations: [{ z, hw, y0, y1, n = 3, cx = 0 }] urut dari belakang (z kecil) ke depan (z besar).
 * Mengembalikan geometri berindeks (position, normal, uv) tertutup di kedua ujung, normal menghadap keluar.
 */
export function loftGeometry(stations, { segments = 22, caps = true, arc = null } = {}) {
  if (stations.length < 2) throw new Error('loft butuh minimal dua stasiun');
  // arc = [a0, a1] (radian, 0 = sisi +x, PI/2 = atas): penampang terbuka (tanpa tutup ujung), mis. bak kabin tanpa atap.
  const open = Array.isArray(arc);
  const per = open ? segments + 1 : segments;
  const pos = [];
  for (const s of stations) {
    const e = 2 / (s.n ?? 3);
    const ym = (s.y0 + s.y1) / 2;
    const hh = (s.y1 - s.y0) / 2;
    for (let k = 0; k < per; k++) {
      const a = open ? arc[0] + ((arc[1] - arc[0]) * k) / segments : (k / segments) * Math.PI * 2;
      pos.push((s.cx ?? 0) + s.hw * sgnPow(Math.cos(a), e), ym + hh * sgnPow(Math.sin(a), e), s.z);
    }
  }
  const idx = [];
  const lim = open ? segments : segments;
  for (let i = 0; i < stations.length - 1; i++) {
    for (let k = 0; k < lim; k++) {
      const a = i * per + k;
      const b = i * per + (open ? k + 1 : (k + 1) % segments);
      const c = (i + 1) * per + k;
      const d = (i + 1) * per + (open ? k + 1 : (k + 1) % segments);
      idx.push(a, b, c, b, d, c);
    }
  }
  if (caps && !open) {
    for (const [si, front] of [[0, false], [stations.length - 1, true]]) {
      const s = stations[si];
      const ci = pos.length / 3;
      pos.push(s.cx ?? 0, (s.y0 + s.y1) / 2, s.z);
      for (let k = 0; k < segments; k++) {
        const a = si * segments + k;
        const b = si * segments + ((k + 1) % segments);
        if (front) idx.push(ci, a, b);
        else idx.push(ci, b, a);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Interpolasi linear nilai stasiun pada z (untuk menaruh detail tepat di permukaan badan). */
export function stationAt(stations, z) {
  const first = stations[0];
  const last = stations[stations.length - 1];
  if (z <= first.z) return { ...first };
  if (z >= last.z) return { ...last };
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i];
    const b = stations[i + 1];
    if (z >= a.z && z <= b.z) {
      const t = (z - a.z) / (b.z - a.z);
      const mix = (k) => a[k] + (b[k] - a[k]) * t;
      return { z, hw: mix('hw'), y0: mix('y0'), y1: mix('y1'), n: (a.n ?? 3) + ((b.n ?? 3) - (a.n ?? 3)) * t };
    }
  }
  return { ...last };
}

export const rbox = (w, h, d, r = 0.03, seg = 1) => new RoundedBoxGeometry(w, h, d, seg, r);
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt, rb, h, seg = 16) => new THREE.CylinderGeometry(rt, rb, h, seg);
