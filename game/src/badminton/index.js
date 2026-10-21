// Bulu tangkis untuk GameHost (kontrak: docs/horor/GAMEHOST.md): pemain melawan bot di layar penuh.
// Fisika kok, aturan reli, dan bot ada di activities/ (murni dan sudah punya tes); modul ini hanya tampilan 2D + kontrol.
//
// Kontrol: joystick layar (kiri) atau WASD/panah untuk bergerak; tombol bulat (kanan) atau Spasi untuk Servis/Pukul.
// Tombol Pukul bisa DITAHAN: selama ditekan, pukulan otomatis keluar begitu kok masuk jangkauan (tidak perlu mengetuk
// tepat waktu), dan bidikan mengikuti arah joystick saat itu. Dorong joystick ke kiri/kanan untuk membidik ke samping
// lapangan. Cincin di kaki = jangkauan pukul (hijau bila kok sudah dalam jangkauan).
//
// Kemulusan: simulasi berjalan dengan langkah tetap (FIXED_DT) dan gambar diinterpolasi antar-langkah, sehingga gerak
// pemain/bot/kok halus di layar 60/90/120 Hz dan tidak bergantung pada naik-turunnya frame rate. Lapangan (statis)
// digambar sekali ke kanvas cadangan. Raket menyentuh titik kontak kok tepat saat arah kok berubah.
import { createPractice } from '../activities/badminton-practice.js';
import { COURT } from '../activities/badminton.js';
import { PLAYER_START, aimFromInput, courtLineSegments, createProjector, stepPlayer } from './court-view.js';

const SWING_TIME = 0.35;
const PENDING_HIT = 0.45; // menekan "Pukul" sedikit lebih awal tetap dihitung (jendela pukulan singkat)
const HIT_RADIUS = 1.0; // sama dengan HAND.horizontal di badminton-practice.js
const JOY_RADIUS = 56;
const JOY_DEAD = 0.12;
const FIXED_DT = 1 / 120; // langkah simulasi tetap
const MAX_STEPS = 8; // batas langkah per frame (cegah spiral kematian setelah tab tertahan)
const MAX_DPR = 1.5; // kanvas HP beresolusi tinggi sangat berat bila dpr penuh
const SERVE_SPOT = 1.9; // sama dengan SERVE_SPOT di badminton.js (titik kok muncul saat servis)
const KEYS = Object.freeze({
  w: [0, 1], arrowup: [0, 1], s: [0, -1], arrowdown: [0, -1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0],
});
const isActionKey = (k) => k === ' ' || k === 'enter' || k === 'e';

const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) });
const ease = (t) => t * t * (3 - 2 * t);

/**
 * Pose tangan + ujung raket. Saat mengayun, ujung raket mulai tepat di titik kontak `at` (posisi kok ketika dipukul),
 * lalu mengikuti gerak lanjutan dan kembali ke posisi diam. Tanpa `at`, raket di posisi diam.
 */
function racketPose(x, z, swing, dirZ, at) {
  const grip = { x: x + 0.38, y: 1.1, z };
  const rest = { hand: grip, tip: { x: x + 0.38, y: 1.1 + 0.75 * Math.cos(-0.5), z: z + dirZ * 0.75 * Math.sin(-0.5) } };
  if (!(swing > 0) || !at) return rest;
  const u = Math.min(1, Math.max(0, 1 - swing / SWING_TIME));
  const dx = at.x - grip.x;
  const dy = at.y - grip.y;
  const dz = at.z - grip.z;
  const dist = Math.hypot(dx, dy, dz) || 1;
  const arm = Math.min(0.5, dist * 0.5); // lengan ikut menjulur ke arah kok
  const contact = { hand: { x: grip.x + (dx / dist) * arm, y: grip.y + (dy / dist) * arm, z: grip.z + (dz / dist) * arm }, tip: at };
  const follow = {
    hand: { x: grip.x - 0.05, y: grip.y + 0.15, z: grip.z + dirZ * 0.25 },
    tip: { x: grip.x - 0.1, y: grip.y + 0.55, z: grip.z + dirZ * 0.7 },
  };
  if (u < 0.45) {
    const t = ease(u / 0.45);
    return { hand: lerp3(contact.hand, follow.hand, t), tip: lerp3(contact.tip, follow.tip, t) };
  }
  const t = ease((u - 0.45) / 0.55);
  return { hand: lerp3(follow.hand, rest.hand, t), tip: lerp3(follow.tip, rest.tip, t) };
}

function createSfx(win) {
  let ac = null;
  const beep = (freq, dur, vol = 0.12, type = 'triangle', at = 0) => {
    try {
      const Ctor = win.AudioContext ?? win.webkitAudioContext;
      if (!Ctor) return;
      ac ??= new Ctor();
      if (ac.state === 'suspended') ac.resume?.();
      const t = ac.currentTime + at;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(ac.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch {
      /* suara tidak tersedia: permainan tetap jalan */
    }
  };
  return {
    hit: () => beep(820, 0.07, 0.14, 'square'),
    point: () => {
      beep(520, 0.12);
      beep(780, 0.16, 0.12, 'triangle', 0.1);
    },
    lose: () => beep(300, 0.22, 0.12, 'sawtooth'),
    close: () => {
      try {
        ac?.close?.();
      } catch {
        /* sudah tertutup */
      }
      ac = null;
    },
  };
}

export default {
  mount(ctx) {
    const services = ctx.services ?? {};
    const doc = services.doc ?? document;
    const win = doc.defaultView ?? window;
    const host = ctx.container;
    const hw = COURT.width / 2;
    const hl = COURT.length / 2;
    const segments = courtLineSegments();

    const root = doc.createElement('div');
    root.style.cssText = 'position:absolute;inset:0;overflow:hidden;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;background:linear-gradient(#0e1a2b,#16314f 55%,#1d4a38)';
    const canvas = doc.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    const hud = doc.createElement('div');
    hud.style.cssText = 'position:absolute;top:10px;left:50%;transform:translateX(-50%);padding:6px 14px;border-radius:999px;background:rgba(20,32,26,.78);color:#fff;font:600 14px system-ui,sans-serif;max-width:94%;text-align:center;pointer-events:none';
    const joyZone = doc.createElement('div');
    joyZone.style.cssText = 'position:absolute;left:0;bottom:0;width:58%;height:45%;touch-action:none';
    const joyBase = doc.createElement('div');
    joyBase.style.cssText = `position:absolute;display:none;width:${JOY_RADIUS * 2}px;height:${JOY_RADIUS * 2}px;border-radius:50%;background:rgba(255,255,255,.18);border:2px solid rgba(255,255,255,.4);pointer-events:none`;
    const joyKnob = doc.createElement('div');
    joyKnob.style.cssText = 'position:absolute;left:50%;top:50%;width:48px;height:48px;margin:-24px 0 0 -24px;border-radius:50%;background:rgba(255,255,255,.5)';
    joyBase.appendChild(joyKnob);
    joyZone.appendChild(joyBase);
    const actBtn = doc.createElement('button');
    actBtn.type = 'button';
    // touch-action:none + tanpa callout/seleksi: menahan tombol tidak memicu menu tekan-lama atau membatalkan sentuhan
    actBtn.style.cssText = 'position:absolute;right:calc(20px + env(safe-area-inset-right));bottom:calc(28px + env(safe-area-inset-bottom));width:96px;height:96px;border-radius:50%;border:3px solid rgba(255,255,255,.85);background:rgba(57,217,138,.88);color:#06210f;font:700 16px system-ui,sans-serif;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent';
    const hint = doc.createElement('div');
    hint.textContent = 'Geser kiri untuk bergerak';
    hint.style.cssText = 'position:absolute;left:18px;bottom:calc(10px + env(safe-area-inset-bottom));color:rgba(255,255,255,.55);font:12px system-ui,sans-serif;pointer-events:none';
    root.append(canvas, hud, joyZone, actBtn, hint);
    host.appendChild(root);

    const g = canvas.getContext('2d', { desynchronized: true }) ?? canvas.getContext('2d');
    if (!g) {
      ctx.notice?.('Layar ini tidak mendukung permainan bulu tangkis.');
      root.remove();
      queueMicrotask(() => ctx.exit?.({ error: 'canvas' }));
      return { destroy() {} };
    }
    // Lapangan + garis tidak berubah: digambar sekali ke kanvas cadangan lalu cukup di-blit tiap frame.
    const courtLayer = doc.createElement('canvas');
    const layerCtx = courtLayer.getContext('2d');
    let layerReady = false;

    const practice = createPractice();
    practice.start();
    const sfx = createSfx(win);
    let player = { ...PLAYER_START };
    let prevPlayer = { ...player };
    let prevBot = { x: practice.bot.x, z: practice.bot.z };
    let prevShuttle = null;
    let swingMe = 0;
    let swingBot = 0;
    let swingMeAt = null;
    let swingBotAt = null;
    let pending = 0;
    let pendingAim = 0;
    let btnHeld = false; // tombol Pukul sedang ditahan (layar)
    let keyHeld = false; // tombol aksi keyboard sedang ditahan
    let prevPhase = practice.phase;
    let hudText = '';
    let btnLabel = null;
    let paused = false;
    let destroyed = false;
    let rafId = 0;
    let acc = 0;
    let last = win.performance.now();

    // ---------- input ----------
    const held = new Set();
    const joy = { x: 0, z: 0 };
    const readInput = () => {
      let x = joy.x;
      let z = joy.z;
      for (const k of held) {
        x += KEYS[k][0];
        z += KEYS[k][1];
      }
      const len = Math.hypot(x, z);
      return len > 1 ? { x: x / len, z: z / len } : { x, z };
    };
    const releaseHolds = () => {
      btnHeld = false;
      keyHeld = false;
      btnId = null;
    };
    const action = () => {
      if (paused || destroyed) return;
      if (practice.phase === 'over') {
        practice.start();
        player = { ...PLAYER_START };
        prevPlayer = { ...player };
        prevBot = { x: practice.bot.x, z: practice.bot.z };
        prevShuttle = null;
        return;
      }
      const input = readInput();
      if (practice.canServe()) {
        const r = practice.serve({ power: 0.62, aimX: aimFromInput(input) * 0.6 });
        if (r.ok) {
          swingMe = SWING_TIME;
          swingMeAt = r.at ?? null;
          sfx.hit();
        }
        return;
      }
      if (practice.phase === 'rally') {
        pending = PENDING_HIT;
        pendingAim = aimFromInput(input);
      }
    };
    const onKeyDown = (e) => {
      const k = String(e.key).toLowerCase();
      if (Object.hasOwn(KEYS, k)) {
        held.add(k);
        e.preventDefault();
      } else if (isActionKey(k)) {
        keyHeld = true; // ditahan (termasuk pengulangan tombol) = pukulan tetap siaga
        if (!e.repeat) action();
        e.preventDefault();
      }
    };
    const onKeyUp = (e) => {
      const k = String(e.key).toLowerCase();
      held.delete(k);
      if (isActionKey(k)) keyHeld = false;
    };
    const onBlur = () => {
      held.clear();
      keyHeld = false;
      btnHeld = false;
    };
    doc.addEventListener('keydown', onKeyDown);
    doc.addEventListener('keyup', onKeyUp);
    win.addEventListener('blur', onBlur);

    let joyId = null;
    let joyOrigin = null;
    const joyUpdate = (e) => {
      let dx = e.clientX - joyOrigin.x;
      let dy = e.clientY - joyOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len > JOY_RADIUS) {
        dx = (dx / len) * JOY_RADIUS;
        dy = (dy / len) * JOY_RADIUS;
      }
      joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      const nx = dx / JOY_RADIUS;
      const nz = -dy / JOY_RADIUS; // dorong ke atas = maju ke net
      const mag = Math.hypot(nx, nz);
      if (mag < JOY_DEAD) {
        joy.x = 0;
        joy.z = 0;
      } else {
        joy.x = nx;
        joy.z = nz;
      }
    };
    const joyEnd = (e) => {
      if (e.pointerId !== joyId) return;
      joyId = null;
      joy.x = 0;
      joy.z = 0;
      joyKnob.style.transform = '';
      joyBase.style.display = 'none';
      hint.style.display = 'none';
    };
    joyZone.addEventListener('pointerdown', (e) => {
      if (joyId !== null) return;
      joyId = e.pointerId;
      joyZone.setPointerCapture?.(e.pointerId);
      const r = joyZone.getBoundingClientRect();
      joyOrigin = { x: e.clientX, y: e.clientY };
      joyBase.style.left = `${e.clientX - r.left - JOY_RADIUS}px`;
      joyBase.style.top = `${e.clientY - r.top - JOY_RADIUS}px`;
      joyBase.style.display = 'block';
      joyUpdate(e);
      e.preventDefault();
    });
    joyZone.addEventListener('pointermove', (e) => {
      if (e.pointerId === joyId) joyUpdate(e);
    });
    joyZone.addEventListener('pointerup', joyEnd);
    joyZone.addEventListener('pointercancel', joyEnd);
    joyZone.addEventListener('lostpointercapture', joyEnd);

    // Tombol Pukul: tekan = aksi sekali + tahan = pukulan siaga terus. Sentuhan dilacak per pointerId dan di-capture
    // sehingga menggeser jari keluar tombol tidak melepasnya; menu tekan-lama dimatikan.
    let btnId = null;
    actBtn.addEventListener('pointerdown', (e) => {
      if (btnId === null) {
        btnId = e.pointerId;
        btnHeld = true;
        actBtn.setPointerCapture?.(e.pointerId);
      }
      action();
      e.preventDefault();
    });
    const btnEnd = (e) => {
      if (e.pointerId !== btnId) return;
      btnId = null;
      btnHeld = false;
    };
    actBtn.addEventListener('pointerup', btnEnd);
    actBtn.addEventListener('pointercancel', btnEnd);
    actBtn.addEventListener('lostpointercapture', btnEnd);
    actBtn.addEventListener('contextmenu', (e) => e.preventDefault());

    // ---------- ukuran kanvas ----------
    let W = 1;
    let H = 1;
    let dpr = 1;
    let proj = createProjector(1, 1);

    // ---------- gambar ----------
    const P = (x, y, z) => proj.project(x, y, z);
    const polyOn = (c, pts) => {
      c.beginPath();
      pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.closePath();
    };
    const poly = (pts) => polyOn(g, pts);
    const drawCourt = (c) => {
      c.fillStyle = '#143d2b';
      polyOn(c, [P(-hw - 1.4, 0, -hl - 1.6), P(hw + 1.4, 0, -hl - 1.6), P(hw + 1.4, 0, hl + 1.6), P(-hw - 1.4, 0, hl + 1.6)]);
      c.fill();
      c.fillStyle = '#1f6b46';
      polyOn(c, [P(-hw, 0, -hl), P(hw, 0, -hl), P(hw, 0, hl), P(-hw, 0, hl)]);
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,.92)';
      c.lineWidth = Math.max(1.2, P(0, 0, 0).s * 0.05);
      c.beginPath();
      for (const [x1, z1, x2, z2] of segments) {
        const a = P(x1, 0, z1);
        const b = P(x2, 0, z2);
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
      }
      c.stroke();
    };
    const renderCourtLayer = () => {
      layerReady = false;
      if (!layerCtx) return;
      courtLayer.width = canvas.width;
      courtLayer.height = canvas.height;
      layerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawCourt(layerCtx);
      layerReady = true;
    };
    const drawNet = () => {
      const ex = hw + 0.3;
      const a = P(-ex, COURT.netHeight, 0);
      const b = P(ex, COURT.netHeight, 0);
      const c = P(ex, 0.76, 0);
      const d = P(-ex, 0.76, 0);
      g.fillStyle = 'rgba(255,255,255,.28)';
      poly([a, b, c, d]);
      g.fill();
      const s = P(0, 0, 0).s;
      g.strokeStyle = '#fff';
      g.lineWidth = Math.max(2, s * 0.07);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
      g.strokeStyle = '#2a2a33';
      g.lineWidth = Math.max(2, s * 0.08);
      g.beginPath();
      for (const sx of [-ex, ex]) {
        const foot = P(sx, 0, 0);
        const top = P(sx, COURT.netHeight, 0);
        g.moveTo(foot.x, foot.y);
        g.lineTo(top.x, top.y);
      }
      g.stroke();
    };
    const drawRing = (x, z, r, color) => {
      g.strokeStyle = color;
      g.lineWidth = 2;
      g.beginPath();
      for (let i = 0; i <= 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        const p = P(x + Math.cos(a) * r, 0, z + Math.sin(a) * r);
        if (i) g.lineTo(p.x, p.y);
        else g.moveTo(p.x, p.y);
      }
      g.stroke();
    };
    const drawPerson = (x, z, color, swing, dirZ, at) => {
      const foot = P(x, 0, z);
      const s = foot.s;
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.beginPath();
      g.ellipse(foot.x, foot.y, s * 0.4, s * 0.14, 0, 0, Math.PI * 2);
      g.fill();
      const hip = P(x, 0.95, z);
      const chest = P(x, 1.45, z);
      const head = P(x, 1.7, z);
      g.lineCap = 'round';
      g.strokeStyle = '#2b3a55';
      g.lineWidth = s * 0.2;
      g.beginPath();
      g.moveTo(foot.x, foot.y);
      g.lineTo(hip.x, hip.y);
      g.stroke();
      g.strokeStyle = color;
      g.lineWidth = s * 0.42;
      g.beginPath();
      g.moveTo(hip.x, hip.y);
      g.lineTo(chest.x, chest.y);
      g.stroke();
      g.fillStyle = '#f1c9a5';
      g.beginPath();
      g.arc(head.x, head.y, Math.max(3, s * 0.17), 0, Math.PI * 2);
      g.fill();
      const pose = racketPose(x, z, swing, dirZ, at);
      const shoulder = P(x + 0.2, 1.4, z);
      const hand = P(pose.hand.x, pose.hand.y, pose.hand.z);
      const tip = P(pose.tip.x, pose.tip.y, pose.tip.z);
      g.strokeStyle = color;
      g.lineWidth = Math.max(2, s * 0.11);
      g.beginPath();
      g.moveTo(shoulder.x, shoulder.y);
      g.lineTo(hand.x, hand.y);
      g.stroke();
      g.strokeStyle = '#ffd166';
      g.lineWidth = Math.max(2, s * 0.05);
      g.beginPath();
      g.moveTo(hand.x, hand.y);
      g.lineTo(tip.x, tip.y);
      g.stroke();
      g.beginPath();
      g.arc(tip.x, tip.y, Math.max(3, s * 0.13), 0, Math.PI * 2);
      g.stroke();
      g.lineCap = 'butt';
    };
    const drawShuttle = (pos) => {
      const ground = P(pos.x, 0, pos.z);
      const p = P(pos.x, pos.y, pos.z);
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.beginPath();
      g.ellipse(ground.x, ground.y, Math.max(3, p.s * 0.12), Math.max(1.5, p.s * 0.05), 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,.25)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(ground.x, ground.y);
      g.lineTo(p.x, p.y);
      g.stroke();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(p.x, p.y, Math.max(3.5, p.s * 0.1), 0, Math.PI * 2);
      g.fill();
    };
    const draw = (alpha) => {
      // posisi gambar = interpolasi antara langkah simulasi sebelumnya dan terbaru
      const bot = practice.bot;
      const ip = { x: lerp(prevPlayer.x, player.x, alpha), z: lerp(prevPlayer.z, player.z, alpha) };
      const ib = { x: lerp(prevBot.x, bot.x, alpha), z: lerp(prevBot.z, bot.z, alpha) };
      const swingStep = alpha * FIXED_DT;
      const swMe = Math.max(0, swingMe - swingStep);
      const swBot = Math.max(0, swingBot - swingStep);

      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
      if (layerReady) g.drawImage(courtLayer, 0, 0);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!layerReady) drawCourt(g);
      drawPerson(ib.x, ib.z, '#e8803a', swBot, -1, swingBotAt);
      drawNet();
      drawRing(ip.x, ip.z, HIT_RADIUS, practice.canHit(player) ? 'rgba(120,255,160,.95)' : 'rgba(255,255,255,.28)');
      drawPerson(ip.x, ip.z, '#4aa3ff', swMe, 1, swingMeAt);
      const shuttle = practice.shuttle;
      if (shuttle) {
        const cur = shuttle.pos;
        drawShuttle(prevShuttle ? { x: lerp(prevShuttle.x, cur.x, alpha), y: lerp(prevShuttle.y, cur.y, alpha), z: lerp(prevShuttle.z, cur.z, alpha) } : cur);
      } else if (practice.phase === 'serve') {
        // kok menunggu di titik servis yang sama dengan tempat fisika memunculkannya
        drawShuttle(practice.server === 'a' ? { x: 0, y: 1.0, z: -SERVE_SPOT } : { x: 0, y: 1.0, z: SERVE_SPOT });
      }
    };
    const updateHud = () => {
      const s = practice.score;
      const text = `Kamu ${s.a} \u2013 ${s.b} Lawan${practice.message ? ` \u00b7 ${practice.message}` : ''}`;
      if (text !== hudText) {
        hudText = text;
        hud.textContent = text;
      }
      let label = '';
      if (practice.phase === 'over') label = 'Main lagi';
      else if (practice.canServe()) label = 'Servis';
      else if (practice.phase === 'rally') label = 'Pukul';
      if (label !== btnLabel) {
        btnLabel = label;
        actBtn.textContent = label || '\u2026';
        actBtn.style.opacity = label ? '1' : '0.35';
      }
    };

    const resize = () => {
      const r = root.getBoundingClientRect();
      W = Math.max(1, Math.round(r.width || host.clientWidth || win.innerWidth));
      H = Math.max(1, Math.round(r.height || host.clientHeight || win.innerHeight));
      dpr = Math.min(MAX_DPR, win.devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      proj = createProjector(W, H);
      renderCourtLayer();
    };
    resize();
    win.addEventListener('resize', resize);
    const observer = win.ResizeObserver ? new win.ResizeObserver(resize) : null;
    observer?.observe(root);

    // ---------- simulasi (langkah tetap) ----------
    const stepSim = (dt) => {
      prevPlayer = { x: player.x, z: player.z };
      prevBot = { x: practice.bot.x, z: practice.bot.z };
      const sh = practice.shuttle;
      prevShuttle = sh ? { x: sh.pos.x, y: sh.pos.y, z: sh.pos.z } : null;

      player = stepPlayer(player, readInput(), dt);
      // Selama tombol ditahan, jendela pukulan tidak pernah habis: pukulan keluar begitu kok masuk jangkauan,
      // dengan bidikan mengikuti joystick saat itu.
      const holding = btnHeld || keyHeld;
      if (holding) pending = PENDING_HIT;
      if (pending > 0) {
        pending -= dt;
        if (practice.canHit(player)) {
          const r = practice.hit(player, { aim: holding ? aimFromInput(readInput()) : pendingAim });
          if (r.ok) {
            pending = 0;
            swingMe = SWING_TIME;
            swingMeAt = r.at ?? null;
            sfx.hit();
          }
        }
      }
      for (const ev of practice.tick(dt, player)) {
        if (ev.type === 'hit' || ev.type === 'serve') {
          swingBot = SWING_TIME;
          swingBotAt = ev.at ?? null;
          sfx.hit();
        } else if (ev.type === 'point' || ev.type === 'over') {
          if (ev.winner === 'a') sfx.point();
          else sfx.lose();
        }
      }
      if (practice.phase === 'serve' && prevPhase !== 'serve') {
        // reli baru: kembali ke posisi servis (tanpa interpolasi lompatan)
        player = { ...PLAYER_START };
        prevPlayer = { ...player };
        prevBot = { x: practice.bot.x, z: practice.bot.z };
        prevShuttle = null;
      }
      prevPhase = practice.phase;
      swingMe = Math.max(0, swingMe - dt);
      swingBot = Math.max(0, swingBot - dt);
    };

    // ---------- loop ----------
    const frame = (now) => {
      if (destroyed) return;
      rafId = win.requestAnimationFrame(frame);
      if (paused) {
        last = now;
        return;
      }
      acc += Math.min(Math.max((now - last) / 1000, 0), 0.1);
      last = now;
      let steps = 0;
      while (acc >= FIXED_DT && steps < MAX_STEPS) {
        stepSim(FIXED_DT);
        acc -= FIXED_DT;
        steps += 1;
      }
      if (steps === MAX_STEPS) acc = 0; // buang tunggakan waktu agar tidak mengejar terus
      draw(acc / FIXED_DT);
      updateHud();
    };
    rafId = win.requestAnimationFrame(frame);

    const safe = (fn) => {
      try {
        fn();
      } catch {
        /* destroy tidak boleh melempar galat */
      }
    };
    return {
      pause() {
        paused = true;
        held.clear();
        releaseHolds();
      },
      resume() {
        paused = false;
        acc = 0;
        last = win.performance.now();
      },
      destroy() {
        if (destroyed) return;
        destroyed = true;
        safe(() => win.cancelAnimationFrame(rafId));
        safe(() => doc.removeEventListener('keydown', onKeyDown));
        safe(() => doc.removeEventListener('keyup', onKeyUp));
        safe(() => win.removeEventListener('blur', onBlur));
        safe(() => win.removeEventListener('resize', resize));
        safe(() => observer?.disconnect());
        safe(() => practice.stop());
        safe(() => sfx.close());
        safe(() => root.remove());
      },
    };
  },
};
