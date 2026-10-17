import * as THREE from 'three';
import { Batcher, archFrame, archPlane, domeProfile, domeRibs, wallWithArch, transform, instanced } from './hall-kit.js';

// Istana: gerbang agung berlengkung lancip, kubah besar berusuk emas, empat menara, dan dua sayap berjendela bercahaya.
export const PALACE_FRONT_Z = -26.4;
export const ARCH = Object.freeze({ width: 9.4, straight: 8, rise: 7.6, depth: 4 });

export function buildPalace(parent, mats, glowItems) {
  const FZ = PALACE_FRONT_Z;
  const b = new Batcher();

  // ---- Blok tengah dengan gerbang agung ----
  const H = 18;
  b.geometry(mats.stone, wallWithArch(32, H, ARCH.width, ARCH.straight, ARCH.rise, ARCH.depth), 0, 0, FZ - ARCH.depth);
  b.slab(mats.stone, 32, H, 9, 0, 0, FZ - ARCH.depth - 4.5); // badan di belakang
  // dinding belakang gerbang (tempat layar acara) + panel emas
  b.slab(mats.hallWall, 9.4, 15.6, 0.3, 0, 0, FZ - ARCH.depth + 0.15);
  for (const x of [-4.2, 4.2]) b.cyl(mats.gold, 0.22, 0.22, 11.5, x, 0.5, FZ - ARCH.depth + 0.5, 12);
  for (const x of [-3.0, 3.0]) b.slab(mats.gold, 0.12, 9.5, 0.1, x, 1.0, FZ - ARCH.depth + 0.36);

  // lampu gantung kristal di dalam gerbang
  const chZ = FZ - 2.0;
  b.cyl(mats.gold, 0.04, 0.04, 3.2, 0, 12.4, chZ, 6);
  b.lathe(mats.gold, [[0.05, 0], [1.4, 0.35], [1.1, 0.9], [0.5, 1.5], [0.12, 1.9]], 0, 10.7, chZ, 28);
  for (let k = 0; k < 10; k += 1) {
    const a = (k / 10) * Math.PI * 2;
    b.cyl(mats.gold, 0.03, 0.03, 0.9, Math.cos(a) * 1.2, 11.0, chZ + Math.sin(a) * 1.2, 5);
    glowItems.push({ x: Math.cos(a) * 1.2, y: 11.9, z: chZ + Math.sin(a) * 1.2, size: 1.2, color: 0xffe2a0, flicker: 0.12 });
  }
  glowItems.push({ x: 0, y: 11.2, z: chZ, size: 9, color: 0xffc070, flicker: 0.04 });
  for (const x of [-3.4, 3.4]) for (const y of [2.5, 7]) glowItems.push({ x, y, z: FZ - 3.4, size: 2.4, color: 0xffb25c });

  // bingkai emas berlapis di sekeliling gerbang
  for (const [t, d, z] of [[0.45, 0.35, 0.12], [1.0, 0.3, 0.05], [1.7, 0.3, 0.0]]) {
    const frame = archFrame(ARCH.width, ARCH.straight, ARCH.rise, t, d);
    b.geometry(t < 1 ? mats.gold : mats.stoneWhite, frame, 0, 0, FZ + z);
  }
  // pilar emas di sisi gerbang
  for (const x of [-5.9, 5.9]) {
    b.cyl(mats.stoneWhite, 0.55, 0.62, 8, x, 0, FZ + 0.4, 18);
    b.cyl(mats.gold, 0.7, 0.7, 0.35, x, 8, FZ + 0.4, 18);
    b.cyl(mats.gold, 0.7, 0.7, 0.35, x, 0, FZ + 0.4, 18);
  }

  // jendela lengkung bercahaya di kedua sisi gerbang
  const win = archPlane(2.3, 6.4, 1.7);
  const winFrame = archFrame(2.3, 6.4, 1.7, 0.22, 0.2);
  const winItems = [];
  for (const sx of [-1, 1]) {
    for (const x of [8.6, 12.6]) {
      const wx = sx * x;
      winItems.push({ x: wx, y: 2.4, z: FZ + 0.03 });
      b.geometry(mats.gold, winFrame.clone(), wx, 2.4, FZ + 0.01);
      glowItems.push({ x: wx, y: 6, z: FZ + 1.6, size: 4.2, color: 0xffb25c });
    }
  }
  parent.add(instanced(win, mats.windowGlow, winItems));

  // kornis, bilah horizontal, dan pagar atap
  b.slab(mats.gold, 33.4, 0.5, 1.2, 0, H - 0.2, FZ - 0.25);
  b.slab(mats.stoneWhite, 33, 0.35, 0.9, 0, 4.1, FZ - 0.1);
  b.slab(mats.stoneWhite, 33, 1.0, 0.3, 0, H + 0.3, FZ + 0.1);
  for (let x = -15.6; x <= 15.7; x += 0.9) if (Math.abs(x) > 5.5) b.slab(mats.stoneWhite, 0.22, 1.0, 0.22, x, H + 0.3, FZ + 0.1);

  // ---- Kubah utama ----
  const drumY = H + 0.7;
  const drumR = 8.4;
  b.cyl(mats.stone, drumR + 0.5, drumR + 0.7, 0.7, 0, H, FZ - 9, 40);
  b.cyl(mats.stone, drumR, drumR, 5.2, 0, drumY, FZ - 9, 40);
  b.cyl(mats.gold, drumR + 0.35, drumR + 0.35, 0.4, 0, drumY + 5.0, FZ - 9, 40);
  const drumWin = archPlane(1.5, 2.4, 0.9);
  const drumItems = [];
  for (let k = 0; k < 14; k += 1) {
    const a = (k / 14) * Math.PI * 2;
    drumItems.push({ x: Math.cos(a) * (drumR + 0.04), y: drumY + 1.2, z: FZ - 9 + Math.sin(a) * (drumR + 0.04), ry: Math.PI / 2 - a });
    b.cyl(mats.stoneWhite, 0.2, 0.24, 4.6, Math.cos(a + Math.PI / 14) * (drumR + 0.05), drumY, FZ - 9 + Math.sin(a + Math.PI / 14) * (drumR + 0.05), 10);
  }
  parent.add(instanced(drumWin, mats.windowGlow, drumItems));
  const domeBase = drumY + 5.2;
  const domeProf = domeProfile(drumR + 0.2, 9.2, { onion: 0.05, steps: 22 });
  b.lathe(mats.domeBlue, domeProf, 0, domeBase, FZ - 9, 48);
  const ribs = domeRibs(drumR + 0.2, 9.2, 16, 0.09, 0.05);
  b.geometry(mats.gold, ribs, 0, domeBase, FZ - 9);
  b.cyl(mats.gold, 1.2, 1.4, 0.5, 0, domeBase + 9.1, FZ - 9, 20);
  b.cyl(mats.stoneWhite, 0.85, 1.0, 1.7, 0, domeBase + 9.4, FZ - 9, 16);
  b.lathe(mats.domeBlue, domeProfile2(1.0, 1.5), 0, domeBase + 11.0, FZ - 9, 20);
  b.cyl(mats.gold, 0.03, 0.12, 3.2, 0, domeBase + 12.4, FZ - 9, 8);
  b.sphere(mats.gold, 0.26, 0, domeBase + 12.0, FZ - 9);

  // ---- Kubah-kubah kecil di sudut atap ----
  for (const [x, z] of [[-12.5, FZ - 3], [12.5, FZ - 3], [-12.5, FZ - 9], [12.5, FZ - 9]]) smallDome(b, mats, x, H, z, 3.0, mats.domeTeal);

  // ---- Sayap kiri-kanan ----
  const WH = 13;
  const wingFront = FZ - 1.0;
  for (const s of [-1, 1]) {
    const cx = s * 28.5;
    b.slab(mats.stone, 24, WH, 11, cx, 0, wingFront - 5.5);
    b.slab(mats.gold, 24.6, 0.45, 1.1, cx, WH - 0.2, wingFront - 0.1);
    b.slab(mats.stoneWhite, 24.4, 0.3, 0.8, cx, 5.2, wingFront - 0.05);
    b.slab(mats.stoneWhite, 24.4, 0.9, 0.3, cx, WH + 0.2, wingFront + 0.1);
    // pilaster dan jendela dua baris
    const wwin = archPlane(1.9, 3.0, 1.2);
    const wf = archFrame(1.9, 3.0, 1.2, 0.2, 0.18);
    const items = [];
    for (let i = 0; i < 7; i += 1) {
      const x = cx - 10.8 + i * 3.6;
      for (const y of [0.6, 6.0]) {
        items.push({ x, y, z: wingFront + 0.03 });
        b.geometry(mats.gold, wf.clone(), x, y, wingFront + 0.01);
      }
      if (i < 6) {
        b.slab(mats.stoneWhite, 0.55, WH - 0.3, 0.4, x + 1.8, 0, wingFront + 0.05);
      }
      glowItems.push({ x, y: 4.1, z: wingFront + 1.4, size: 3.4, color: 0xffb25c });
      glowItems.push({ x, y: 9.4, z: wingFront + 1.4, size: 3.0, color: 0xffb25c });
    }
    b.slab(mats.stoneWhite, 0.55, WH - 0.3, 0.4, cx - 12.6, 0, wingFront + 0.05);
    parent.add(instanced(wwin, mats.windowGlow, items));
    for (let x = cx - 12; x <= cx + 12; x += 0.9) b.slab(mats.stoneWhite, 0.2, 0.9, 0.2, x, WH + 0.2, wingFront + 0.1);

    // paviliun ujung dengan kubah hijau kebiruan
    const ex = s * 46;
    b.slab(mats.stone, 10, 17, 11, ex, 0, wingFront - 5.5);
    b.slab(mats.gold, 10.6, 0.45, 1.1, ex, 16.8, wingFront - 0.1);
    smallDome(b, mats, ex, 17, wingFront - 5.2, 4.2, mats.domeTeal);
    const ew = archPlane(2.1, 5.5, 1.7);
    const ewi = [{ x: ex - 2.2, y: 3.0, z: wingFront + 0.03 }, { x: ex + 2.2, y: 3.0, z: wingFront + 0.03 }, { x: ex - 2.2, y: 10.8, z: wingFront + 0.03 }, { x: ex + 2.2, y: 10.8, z: wingFront + 0.03 }];
    parent.add(instanced(ew, mats.windowGlow, ewi));
    for (const x of [ex - 2.2, ex + 2.2]) b.geometry(mats.gold, archFrame(2.1, 5.5, 1.7, 0.2, 0.18), x, 3.0, wingFront + 0.01);
  }

  // ---- Empat menara ----
  for (const [x, z, h] of [[-19.4, FZ - 2.4, 30], [19.4, FZ - 2.4, 30], [-38.5, FZ - 4, 25], [38.5, FZ - 4, 25]]) minaret(b, mats, x, z, h, glowItems);

  b.build(parent);
}

function domeProfile2(r, h) {
  return domeProfile(r, h, { onion: 0.1, steps: 12 });
}

function smallDome(b, mats, x, y, z, r, mat) {
  b.cyl(mats.stone, r + 0.35, r + 0.45, 0.5, x, y, z, 24);
  b.cyl(mats.stone, r, r, 1.8, x, y + 0.5, z, 24);
  b.cyl(mats.gold, r + 0.2, r + 0.2, 0.25, x, y + 2.2, z, 24);
  b.lathe(mat, domeProfile(r + 0.1, r * 1.2, { onion: 0.12, steps: 14 }), x, y + 2.4, z, 28);
  b.geometry(mats.gold, domeRibs(r + 0.1, r * 1.2, 10, 0.05, 0.12), x, y + 2.4, z);
  b.cyl(mats.gold, 0.02, 0.09, 1.6, x, y + 2.4 + r * 1.2 - 0.1, z, 8);
  b.sphere(mats.gold, 0.16, x, y + 2.4 + r * 1.2 + 0.2, z);
}

function minaret(b, mats, x, z, h, glowItems) {
  b.slab(mats.stone, 3.4, 8, 3.4, x, 0, z);
  b.slab(mats.gold, 3.8, 0.35, 3.8, x, 7.8, z);
  b.cyl(mats.stone, 1.2, 1.35, h - 12, x, 8, z, 18);
  for (const y of [8.2, h * 0.52, h * 0.78]) b.cyl(mats.gold, 1.45, 1.45, 0.3, x, y, z, 18);
  // balkon dengan pagar
  for (const y of [h * 0.52, h * 0.78]) {
    b.cyl(mats.stoneWhite, 2.0, 1.6, 0.4, x, y + 0.3, z, 18);
    b.cyl(mats.stoneWhite, 1.95, 1.95, 0.08, x, y + 1.3, z, 18);
    for (let k = 0; k < 16; k += 1) {
      const a = (k / 16) * Math.PI * 2;
      b.cyl(mats.stoneWhite, 0.05, 0.05, 0.6, x + Math.cos(a) * 1.9, y + 0.7, z + Math.sin(a) * 1.9, 6);
    }
    glowItems.push({ x, y: y + 2.2, z: z + 1.4, size: 1.8, color: 0xffc070 });
  }
  const topY = h - 4;
  b.cyl(mats.stone, 1.5, 1.4, 4.2, x, topY, z, 18);
  b.cyl(mats.gold, 1.7, 1.7, 0.3, x, topY + 4.0, z, 18);
  b.lathe(mats.domeBlue, domeProfile(1.7, 3.4, { onion: 0.18, steps: 14 }), x, topY + 4.2, z, 24);
  b.cyl(mats.gold, 0.03, 0.12, 2.6, x, topY + 7.4, z, 8);
  b.sphere(mats.gold, 0.2, x, topY + 7.2, z);
  // celah jendela bercahaya
  for (const y of [h * 0.34, h * 0.64, h * 0.9]) {
    glowItems.push({ x, y, z: z + 1.5, size: 1.1, color: 0xffd080 });
  }
}

export { transform };
