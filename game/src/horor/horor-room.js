// Pembangun ruangan untuk Mansion Horor.
//
// Diport dari KantLex/yoru-no-gakko (MIT, Copyright (c) 2026 KantLex), src/05a-builder.js.
// Teks lisensi ada di docs/horor/THIRD_PARTY_NOTICES.md.
// Perubahan: modul ES; tekstur opsional (tanpa DOM tetap bisa dibangun, dipakai untuk uji); perabot sekolah dan teks
// Jepang dibuang; pintu memakai `tex`/`sign` opsional; ditambah `tickFlickers`.
//
// Koordinat dalam meter, y ke atas, lantai di y = 0. Karakter dengan rotasi r menghadap (sin r, cos r).
import * as THREE from 'three';
import { B, TAU, mat, mergeMeshes, texMat, TEX, worldUV } from './horor-core.js';

export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const FACE = Object.freeze({ N: Math.PI, S: 0, E: Math.PI / 2, W: -Math.PI / 2 });

export class Room {
  constructor(id, o = {}) {
    Object.assign(this, {
      id,
      name: o.name ?? id,
      surface: o.surface || 'wood',
      ambience: o.ambience || [0.12, 0.05, 0],
      acoustics: o.acoustics || 'room',
    });
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x010207);
    this.scene.fog = new THREE.Fog(0x010207, o.fogNear ?? 7, o.fogFar ?? 24);
    this.statics = [];
    this.colliders = [];
    this.cams = [];
    this.doors = [];
    this.spots = [];
    this.spawns = [];
    this.triggers = [];
    this.updaters = [];
    this.flickers = [];
    this.floorY = () => 0;
  }

  put(mesh, o = {}) {
    mesh.castShadow = o.cast !== false;
    mesh.receiveShadow = o.recv !== false;
    if (o.dyn) this.scene.add(mesh);
    else this.statics.push(mesh);
    return mesh;
  }

  /** y = dasar kotak. `solid` menambah collider; `ry` memutar kotak. */
  box(w, h, d, material, x, y, z, o = {}) {
    const geo = B(w, h, d);
    if (o.uv) worldUV(geo, w, h, d, o.uv);
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y + h / 2, z);
    if (o.ry) m.rotation.y = o.ry;
    if (o.solid) {
      const swap = o.ry && Math.abs(Math.sin(o.ry)) > 0.7;
      const sw = swap ? d : w;
      const sd = swap ? w : d;
      this.solid(x - sw / 2, z - sd / 2, x + sw / 2, z + sd / 2, o.solid === true ? 'furn' : o.solid);
    }
    return this.put(m, o);
  }

  cyl(rt, rb, h, seg, material, x, y, z, o = {}) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
    m.position.set(x, y + h / 2, z);
    if (o.rx) m.rotation.x = o.rx;
    if (o.rz) m.rotation.z = o.rz;
    if (o.solid) this.solid(x - rb, z - rb, x + rb, z + rb, 'furn');
    return this.put(m, o);
  }

  plane(w, h, material, x, y, z, ry = 0, o = {}) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    if (o.rx) m.rotation.x = o.rx;
    return this.put(m, { cast: false, ...o });
  }

  solid(x0, z0, x1, z1, kind = 'furn') {
    const c = { x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), kind };
    this.colliders.push(c);
    return c;
  }

  cam(zone, pos, look, fov = 55) {
    this.cams.push({ zone, pos: V3(...pos), look: V3(...look), fov });
  }
  spot(o) {
    this.spots.push({ r: 1.0, y: 1, ...o });
    return o;
  }
  enemy(o) {
    this.spawns.push(o);
  }
  trigger(rect, fn) {
    this.triggers.push({ rect, fn });
  }

  floor(x0, z0, x1, z1, material, uv = 2, y = 0) {
    this.box(x1 - x0, 0.1, z1 - z0, material, (x0 + x1) / 2, y - 0.1, (z0 + z1) / 2, { uv, cast: false });
  }
  ceiling(x0, z0, x1, z1, h, material = texMat('ceiling', 0xbdb9ad), uv = 1.8) {
    this.box(x1 - x0, 0.12, z1 - z0, material, (x0 + x1) / 2, h, (z0 + z1) / 2, { uv });
  }

  /**
   * Dinding sepanjang X (di z = at) atau sepanjang Z (di x = at). `inner` = +1/-1, sisi tempat ruangan berada.
   * `o.win` = daftar bukaan jendela {a, b, y0, y1}.
   */
  wall(axis, at, from, to, inner, o = {}) {
    const h = o.h ?? 3;
    const t = 0.2;
    const base = o.base ?? 0;
    const material = o.mat ?? texMat('plaster', 0xc9c1ab);
    const ops = (o.win || []).slice().sort((a, b) => a.a - b.a);
    const segs = [];
    let cur = from;
    for (const op of ops) {
      if (op.a > cur) segs.push([cur, op.a, 0, h]);
      segs.push([op.a, op.b, 0, op.y0]);
      segs.push([op.a, op.b, op.y1, h]);
      cur = op.b;
    }
    if (cur < to) segs.push([cur, to, 0, h]);
    for (const [a, b, y0, y1] of segs) {
      if (b - a < 0.001 || y1 - y0 < 0.001) continue;
      if (axis === 'x') this.box(b - a, y1 - y0, t, material, (a + b) / 2, base + y0, at, { uv: o.uv ?? 2 });
      else this.box(t, y1 - y0, b - a, material, at, base + y0, (a + b) / 2, { uv: o.uv ?? 2 });
    }
    if (axis === 'x') this.solid(from, at - t / 2, to, at + t / 2, 'wall');
    else this.solid(at - t / 2, from, at + t / 2, to, 'wall');

    const off = inner * (t / 2 + 0.015);
    if (o.wains) {
      const wm = o.wainsMat ?? texMat('panel', 0x5a3f28);
      if (axis === 'x') this.box(to - from, o.wains, 0.03, wm, (from + to) / 2, base, at + off, { uv: 1 });
      else this.box(0.03, o.wains, to - from, wm, at + off, base, (from + to) / 2, { uv: 1 });
    }
    const baseboard = mat(0x2a2320);
    if (axis === 'x') this.box(to - from, 0.1, 0.04, baseboard, (from + to) / 2, base, at + off);
    else this.box(0.04, 0.1, to - from, baseboard, at + off, base, (from + to) / 2);

    // kaca jendela, bingkai, ambang (kisi-kisinya melempar bayangan cahaya bulan ke lantai)
    const frame = mat(0x9aa0a6);
    const glass = new THREE.MeshBasicMaterial({
      color: 0x5a6f9a,
      transparent: true,
      opacity: o.frosted ? 0.85 : 0.12,
      depthWrite: false,
      fog: false,
      map: o.frosted ? TEX.frosted ?? null : null,
    });
    for (const op of ops) {
      const len = op.b - op.a;
      const mid = (op.a + op.b) / 2;
      const oh = op.y1 - op.y0;
      if (axis === 'x') {
        this.plane(len, oh, glass, mid, base + op.y0 + oh / 2, at, 0, { dyn: true, cast: false, recv: false });
        this.box(0.05, oh, 0.08, frame, mid, base + op.y0, at);
        this.box(len, 0.05, 0.08, frame, mid, base + op.y0 + oh * 0.62, at);
        this.box(len + 0.1, 0.05, 0.28, frame, mid, base + op.y0 - 0.05, at + inner * 0.05);
      } else {
        this.plane(len, oh, glass, at, base + op.y0 + oh / 2, mid, Math.PI / 2, { dyn: true, cast: false, recv: false });
        this.box(0.08, oh, 0.05, frame, at, base + op.y0, mid);
        this.box(0.08, 0.05, len, frame, at, base + op.y0 + oh * 0.62, mid);
        this.box(0.28, 0.05, len + 0.1, frame, at + inner * 0.05, base + op.y0 - 0.05, mid);
      }
    }
    if (ops.length && !o.frosted && TEX.sky) {
      // langit malam di balik kaca
      const sky = new THREE.MeshBasicMaterial({ map: TEX.sky, fog: false });
      const len = to - from + 16;
      const out = -inner * 9;
      if (axis === 'x') this.plane(len, 14, sky, (from + to) / 2, base + 3, at + out, inner > 0 ? 0 : Math.PI, { dyn: true, recv: false });
      else this.plane(len, 14, sky, at + out, base + 3, (from + to) / 2, inner > 0 ? Math.PI / 2 : -Math.PI / 2, { dyn: true, recv: false });
    }
  }

  /**
   * Pintu pada dinding. `o.wall` = 'x' | 'z', `o.at` = posisi dinding, `o.pos` = posisi pintu sepanjang dinding,
   * `o.inner` = +1/-1. Mengisi `rect` (zona pemicu), `spawn` (titik muncul di sisi ini), `face` (arah menghadap pintu).
   * `o.shutter` memasang gerbang yang bisa dibuka lewat setShutter().
   */
  door(o) {
    const w = o.w ?? 1.0;
    const h = o.h ?? 2.0;
    const base = o.base ?? 0;
    const inner = o.inner;
    const tex = TEX[o.tex ?? 'doorWood'];
    const dm = tex ? mat(0xffffff, { map: tex }) : mat(o.color ?? 0x5d646e);
    const frame = mat(0x2a2622);
    const off = inner * 0.13;
    const signTex = o.sign ? TEX.signs?.[o.sign] : null;
    let rect;
    let spawn;
    let face;
    const depth = o.shutter ? 0.95 : 0.62;
    if (o.wall === 'x') {
      this.box(w, h, 0.05, dm, o.pos, base, o.at + off);
      this.box(w + 0.16, 0.08, 0.07, frame, o.pos, base + h, o.at + off);
      this.box(0.08, h, 0.07, frame, o.pos - w / 2 - 0.04, base, o.at + off);
      this.box(0.08, h, 0.07, frame, o.pos + w / 2 + 0.04, base, o.at + off);
      rect = [o.pos - w / 2 + 0.12, Math.min(o.at, o.at + inner * depth), o.pos + w / 2 - 0.12, Math.max(o.at, o.at + inner * depth)];
      spawn = { x: o.pos, z: o.at + inner * 1.0, rot: inner > 0 ? FACE.S : FACE.N };
      face = inner > 0 ? FACE.N : FACE.S;
      if (signTex) this.box(0.035, 0.24, 0.84, mat(0xffffff, { map: signTex }), o.pos + w / 2 + 0.25, base + h + 0.28, o.at + inner * 0.52);
    } else {
      this.box(0.05, h, w, dm, o.at + off, base, o.pos);
      this.box(0.07, 0.08, w + 0.16, frame, o.at + off, base + h, o.pos);
      this.box(0.07, h, 0.08, frame, o.at + off, base, o.pos - w / 2 - 0.04);
      this.box(0.07, h, 0.08, frame, o.at + off, base, o.pos + w / 2 + 0.04);
      rect = [Math.min(o.at, o.at + inner * depth), o.pos - w / 2 + 0.12, Math.max(o.at, o.at + inner * depth), o.pos + w / 2 - 0.12];
      spawn = { x: o.at + inner * 1.0, z: o.pos, rot: inner > 0 ? FACE.E : FACE.W };
      face = inner > 0 ? FACE.W : FACE.E;
      if (signTex) this.box(0.84, 0.24, 0.035, mat(0xffffff, { map: signTex }), o.at + inner * 0.52, base + h + 0.28, o.pos + w / 2 + 0.25);
    }
    if (o.shutter) {
      // gerbang diturunkan di depan pintu, punya collider sendiri selama turun
      const sm = texMat('shutter', 0x6c7076);
      const off2 = inner * 0.4;
      const mesh =
        o.wall === 'x'
          ? this.box(w + 0.4, h + 0.3, 0.08, sm, o.pos, base, o.at + off2, { dyn: true })
          : this.box(0.08, h + 0.3, w + 0.4, sm, o.at + off2, base, o.pos, { dyn: true });
      const c =
        o.wall === 'x'
          ? { x0: o.pos - w / 2 - 0.2, x1: o.pos + w / 2 + 0.2, z0: Math.min(o.at, o.at + inner * 0.46), z1: Math.max(o.at, o.at + inner * 0.46), kind: 'wall' }
          : { x0: Math.min(o.at, o.at + inner * 0.46), x1: Math.max(o.at, o.at + inner * 0.46), z0: o.pos - w / 2 - 0.2, z1: o.pos + w / 2 + 0.2, kind: 'wall' };
      this.colliders.push(c);
      (this.shutters ||= {})[o.id] = { mesh, c, saved: { ...c }, y: mesh.position.y };
    }
    const door = { ...o, rect, spawn, face };
    this.doors.push(door);
    return door;
  }

  /** Naikkan (down = false) atau turunkan gerbang; naik bisa dianimasikan masuk ke langit-langit. */
  setShutter(id, down, animate = false) {
    const s = this.shutters?.[id];
    if (!s) return;
    if (down) {
      Object.assign(s.c, s.saved);
      s.mesh.visible = true;
      s.mesh.position.y = s.y;
      s.rising = false;
      return;
    }
    s.c.x0 = s.c.x1 = s.c.z0 = s.c.z1 = 9999;
    if (animate) s.rising = true;
    else s.mesh.visible = false;
  }
  updateShutters(dt) {
    for (const s of Object.values(this.shutters || {})) {
      if (!s.rising) continue;
      s.mesh.position.y += dt * 1.1;
      if (s.mesh.position.y > s.y + 2.4) {
        s.rising = false;
        s.mesh.visible = false;
      }
    }
  }

  ambient(color, i) {
    this.scene.add(new THREE.AmbientLight(color, i * 3.2));
  }
  hemi(sky, ground, i) {
    this.scene.add(new THREE.HemisphereLight(sky, ground, i));
  }
  moon(from, target, i = 2.2, span = 10, color = 0x8ea6ff) {
    const l = new THREE.DirectionalLight(color, i * 2.1);
    l.position.set(...from);
    l.target.position.set(...target);
    l.castShadow = true;
    l.shadow.mapSize.set(1024, 1024);
    const c = l.shadow.camera;
    c.left = -span;
    c.right = span;
    c.top = span;
    c.bottom = -span;
    c.near = 1;
    c.far = 70;
    l.shadow.bias = -0.0008;
    l.shadow.normalBias = 0.03;
    this.scene.add(l, l.target);
    return l;
  }
  /** `flicker` = 'lamp' (berkedip halus) atau 'dying' (hampir mati); kosong = menyala tetap. */
  point(color, i, d, x, y, z, flicker) {
    const l = new THREE.PointLight(color, i * 1.6, d, 1.3);
    l.position.set(x, y, z);
    this.scene.add(l);
    if (flicker) this.flickers.push({ l, base: l.intensity, kind: flicker, t: Math.random() * TAU });
    return l;
  }
  /** Perbarui lampu berkedip (tambahan; kode asli mengurusnya di luar pembangun). */
  tickFlickers(time) {
    for (const f of this.flickers) {
      const k = f.kind === 'dying' ? (Math.sin(time * 37 + f.t) > 0.2 ? 1 : 0.15) : 0.88 + 0.12 * Math.sin(time * 23 + f.t);
      f.l.intensity = f.base * k;
    }
  }

  /** Gabungkan semua mesh statis (panggil sekali setelah ruangan selesai dibangun). */
  finalize() {
    for (const m of mergeMeshes(this.statics)) this.scene.add(m);
    this.statics = [];
    return this;
  }

  /** Lepas geometri dan material dinamis ruangan ini. Material bersama (mat) dilepas lewat disposeMaterials(). */
  dispose() {
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    this.scene.clear();
    this.statics = [];
  }
}
