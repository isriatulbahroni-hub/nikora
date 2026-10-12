import * as THREE from 'three';
import { EW, EH, FH, LW, LH, FLAP_PTS, POCKET_PTS } from './designs.js';
import { pocketTextures, flapFrontTextures, flapBackTextures, letterTextures, sealFace, glowSprite } from './textures.js';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const E = { out: (t) => 1 - Math.pow(1 - t, 3), io: (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) };

/** Jadwal satu amplop (detik, relatif). Dipakai juga oleh kamera di world.js. */
export const TL = { glow: [0.9, 1.55], brk: [1.55, 1.8], flap: [1.7, 2.4], slide: [2.0, 2.5], lift: [2.5, 3.2] };

const shapeOf = (pts, w, h, oy) => { const s = new THREE.Shape(); pts.forEach(([px, py], i) => { const x = (px / 100 - .5) * w, y = oy - (py / 100) * h; i ? s.lineTo(x, y) : s.moveTo(x, y); }); s.closePath(); return s; };
function fixUV(g, w, h, oy) { const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + .5, (p.getY(i) - oy) / h + 1); uv.needsUpdate = true; }
const metalMat = (t) => new THREE.MeshStandardMaterial({ map: t.map, roughnessMap: t.mr, metalnessMap: t.mr, roughness: 1, metalness: 1 });

function sealMesh(d) {
  const g = new THREE.Group(), s = d.seal;
  const goldMat = new THREE.MeshStandardMaterial({ color: s.base, metalness: .9, roughness: .3 });
  let geo, top = .16, face;
  if (s.kind === 'wax') {
    const sh = new THREE.Shape(), n = 18; for (let i = 0; i <= n * 8; i++) { const a = i / (n * 8) * Math.PI * 2, r = 1.7 + Math.sin(a * n) * .1; const X = Math.cos(a) * r, Y = Math.sin(a) * r; i ? sh.lineTo(X, Y) : sh.moveTo(X, Y); }
    geo = new THREE.ExtrudeGeometry(sh, { depth: .12, bevelEnabled: true, bevelThickness: .1, bevelSize: .1, bevelSegments: 5, curveSegments: 48 }); top = .34;
  } else if (s.kind === 'sticker') { geo = new THREE.CylinderGeometry(1.7, 1.7, .08, 64).rotateX(Math.PI / 2); geo.translate(0, 0, .04); top = .09; }
  else if (s.kind === 'star8') {
    const sh = new THREE.Shape(); for (let i = 0; i < 16; i++) { const r = i % 2 ? 1.5 : 2.1, a = -Math.PI / 2 + i * Math.PI / 8; const X = Math.cos(a) * r, Y = Math.sin(a) * r; i ? sh.lineTo(X, Y) : sh.moveTo(X, Y); } sh.closePath();
    geo = new THREE.ExtrudeGeometry(sh, { depth: .1, bevelEnabled: true, bevelThickness: .06, bevelSize: .05, bevelSegments: 3 }); top = .22;
  } else { // holo
    const w = 5.2, h = 1.9, r = .32, sh = new THREE.Shape(); sh.moveTo(-w / 2 + r, -h / 2); sh.lineTo(w / 2 - r, -h / 2); sh.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r); sh.lineTo(w / 2, h / 2 - r); sh.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); sh.lineTo(-w / 2 + r, h / 2); sh.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); sh.lineTo(-w / 2, -h / 2 + r); sh.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    geo = new THREE.ExtrudeGeometry(sh, { depth: .06, bevelEnabled: true, bevelThickness: .04, bevelSize: .04, bevelSegments: 3 }); top = .15;
  }
  const mat = s.kind === 'holo' ? new THREE.MeshPhysicalMaterial({ color: 0xdfe6ff, metalness: .55, roughness: .22, iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessRange: [180, 820], clearcoat: 1 }) : goldMat;
  const body = new THREE.Mesh(geo, mat); body.castShadow = true; g.add(body);
  const plane = s.kind === 'holo' ? new THREE.PlaneGeometry(4.6, 1.7) : new THREE.CircleGeometry(1.25, 48);
  const faceMesh = new THREE.Mesh(plane, new THREE.MeshStandardMaterial({ map: sealFace(d, s.kind === 'holo'), transparent: true, roughness: .4, metalness: .5, polygonOffset: true, polygonOffsetFactor: -2 }));
  faceMesh.position.z = top + .01; g.add(faceMesh);
  return g;
}

/** Bangun satu amplop 3D di atas lantai. Semua animasi lewat update(lt, ...). */
export function buildEnvelope(d, glowTex) {
  const root = new THREE.Group();
  const flat = new THREE.Group(); flat.rotation.x = -Math.PI / 2; flat.position.y = 0.12; root.add(flat);
  const plain = (c, r = .85) => new THREE.MeshStandardMaterial({ color: c, roughness: r });

  const back = new THREE.Mesh(new THREE.BoxGeometry(EW, EH, .08), plain(d.dark)); back.position.z = -.06; back.receiveShadow = true; flat.add(back);

  const pt = pocketTextures(d), pg = new THREE.ExtrudeGeometry(shapeOf(POCKET_PTS, EW, EH, EH / 2), { depth: .1, bevelEnabled: true, bevelThickness: .02, bevelSize: .02, bevelSegments: 1 });
  fixUV(pg, EW, EH, EH / 2);
  const pocket = new THREE.Mesh(pg, [metalMat(pt), plain(d.body)]); pocket.castShadow = pocket.receiveShadow = true; flat.add(pocket);

  const hinge = new THREE.Group(); hinge.position.set(0, EH / 2, .1); flat.add(hinge);
  const fs = shapeOf(FLAP_PTS[d.flap], EW, FH, 0);
  const edge = new THREE.Mesh(new THREE.ExtrudeGeometry(fs, { depth: .06, bevelEnabled: false }), plain(d.body)); edge.castShadow = true; hinge.add(edge);
  const fg = new THREE.ShapeGeometry(fs); fixUV(fg, EW, FH, 0);
  const front = new THREE.Mesh(fg, metalMat(flapFrontTextures(d))); front.position.z = .062; front.receiveShadow = true; hinge.add(front);
  const bg = new THREE.ShapeGeometry(fs); fixUV(bg, EW, FH, 0); bg.rotateY(Math.PI);
  const bt = flapBackTextures(d); const backFace = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ map: bt.map, roughness: .75 })); backFace.position.z = -.002; hinge.add(backFace);

  const seal = sealMesh(d); seal.position.set(0, EH / 2 - FH, .165); flat.add(seal);

  const lt = letterTextures(d);
  const lm = new THREE.MeshStandardMaterial({ map: lt.map, roughnessMap: lt.mr, metalnessMap: lt.mr, roughness: 1, metalness: 1 });
  const side = plain(d.letterBg, .9);
  const letter = new THREE.Mesh(new THREE.BoxGeometry(LW, LH, .03), [side, side, side, side, lm, plain(d.letterBg, .9)]);
  letter.castShadow = true; letter.receiveShadow = true; root.add(letter);

  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: d.glow, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
  glow.scale.set(11, 11, 1); glow.position.set(0, .8, EH / 2 - (EH / 2 - FH) * -1 - EH / 2 + 0); root.add(glow);
  const sealWorld = new THREE.Vector3(0, .5, -(EH / 2 - FH));            // posisi segel di dunia (relatif root)
  glow.position.copy(sealWorld).add(new THREE.Vector3(0, 1.2, 0));

  const api = {
    root, sealWorld, letterWorld: new THREE.Vector3(0, 5, -2.5), glowStrength: 0,
    update(t) {
      const g = t < TL.brk[0] ? seg(t, ...TL.glow) * (.65 + .35 * Math.sin((t - TL.glow[0]) * 13)) : 1 - seg(t, TL.brk[0], TL.brk[1] + .45);
      api.glowStrength = clamp(g);
      glow.material.opacity = clamp(g) * .5; glow.scale.setScalar(4 + g * 5);
      // segel: berdenyut, lalu pecah
      const b = seg(t, ...TL.brk);
      const pulse = t > TL.glow[0] && t < TL.brk[0] ? 1 + .05 * Math.sin(t * 11) : 1;
      const sc = b < .5 ? pulse + .35 * (b / .5) : 1.35 * (1 - (b - .5) / .5);
      seal.scale.setScalar(Math.max(.0001, sc)); seal.rotation.z = b * .9; seal.visible = b < 1;
      // tutup
      hinge.rotation.x = -E.io(seg(t, ...TL.flap)) * (Math.PI + .03);
      // surat: di dalam -> keluar (datar) -> naik berdiri menghadap kamera
      const s1 = E.io(seg(t, ...TL.slide)), s2 = E.io(seg(t, ...TL.lift));
      const A = new THREE.Vector3(0, .108, 0), B = new THREE.Vector3(0, .9, -4.8), C = new THREE.Vector3(0, 6.7, -2.6);
      const rise = seg(s1, .35, 1), lift = rise * rise * (3 - 2 * rise);   // tetap di bawah saku sampai keluar lewat celah
      letter.position.set(0, A.y + (B.y - A.y) * lift, A.z + (B.z - A.z) * s1).lerp(C, s2);
      letter.rotation.x = -Math.PI / 2 + s2 * (Math.PI / 2 - .13);
      letter.rotation.z = Math.sin(t * 1.6) * .012 * s2;
      letter.position.y += Math.sin(t * 1.9) * .08 * s2;
      api.letterWorld.copy(letter.position);
    },
  };
  api.update(0);
  return api;
}
