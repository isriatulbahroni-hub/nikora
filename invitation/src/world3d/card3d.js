import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { paintCard, CARD } from './card-art.js';
import { rectOnScreen, renderStalled } from './card-guard.js';

const U = 0.1;                                              // 1 mm = 0.1 satuan dunia
const CW = CARD.W * U, CH = CARD.H * U, CR = CARD.R * U, CT = 0.09;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ease = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function roundedShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/**
 * Kartu rekening emas 3D. models = hasil cardModel(). Mengembalikan { setIndex, flip, isBack, destroy }.
 * Kartu melayang pelan, miring mengikuti kursor/jari, dibalik dengan ketukan, dan berputar saat ganti kartu.
 */
export function createCard3D(container, { models, index = 0, onFlip, onFail, onReady }) {
  // WebGL menggambar ke kanvas yang TIDAK dipasang di halaman; hasilnya disalin ke kanvas 2D biasa yang ditampilkan.
  // Kanvas 2D tampil andal di semua peramban, dan pemeriksaan piksel dilakukan pada kanvas yang benar-benar terlihat.
  const gl = document.createElement('canvas');
  const canvas = document.createElement('canvas');
  canvas.className = 'gc-canvas gc-wait'; canvas.setAttribute('aria-hidden', 'true');
  const x2 = canvas.getContext('2d');
  if (!x2) throw new Error('Kanvas 2D tidak tersedia');
  container.append(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas: gl, alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  /* ---- jaring pengaman: GPU tertentu gagal menggambar tanpa melempar galat ---- */
  let destroyed = false, failed = false, ready = false, frames = 0, seenCard = false, blankProbes = 0;
  const fail = (why) => { if (failed || destroyed) return; failed = true; console.warn('Kartu 3D gagal tampil, kartu CSS tetap dipakai:', why); if (onFail) onFail(why); };
  renderer.debug.onShaderError = () => fail('shader');
  gl.addEventListener('webglcontextlost', (e) => { e.preventDefault(); fail('context'); });
  /** Ada piksel kartu (alfa > 0) pada kanvas 2D yang tampil? Dibaca langsung dari yang terlihat. */
  const probePixels = () => {
    const W = canvas.width, H = canvas.height;
    for (const [fx, fy] of [[.5, .5], [.35, .5], [.65, .5], [.5, .4], [.5, .6]]) {
      if (x2.getImageData(Math.floor(W * fx), Math.floor(H * fy), 1, 1).data[3] > 8) { seenCard = true; return; }
    }
    if (++blankProbes >= 4) fail('kosong');
  };
  const markReady = () => { if (ready || failed) return; ready = true; canvas.classList.remove('gc-wait'); container.classList.add('gc-gl'); if (onReady) onReady(); };

  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer), envTex = pm.fromScene(new RoomEnvironment(), 0.03).texture;
  scene.environment = envTex; scene.environmentIntensity = 1.15;
  const camera = new THREE.PerspectiveCamera(26, 1, .1, 100);
  const key = new THREE.DirectionalLight(0xfff1d0, 1.5); key.position.set(2, 3, 5); scene.add(key);
  scene.add(new THREE.HemisphereLight(0xfff3d6, 0x3a2a0a, .35));

  const shape = roundedShape(CW, CH, CR);
  const bodyGeo = new THREE.ExtrudeGeometry(shape, { depth: CT, bevelEnabled: true, bevelThickness: .012, bevelSize: .012, bevelSegments: 3, curveSegments: 20 });
  bodyGeo.translate(0, 0, -CT / 2);
  const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0xc8a040, metalness: 1, roughness: .3 }));
  const faceF = new THREE.ShapeGeometry(shape, 24);
  const pos = faceF.attributes.position, uv = faceF.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / CW + .5, pos.getY(i) / CH + .5);
  const faceB = faceF.clone(); faceB.rotateY(Math.PI);                       // dilihat dari belakang, teks tetap terbaca
  const mat = () => new THREE.MeshPhysicalMaterial({ metalness: 1, roughness: 1, clearcoat: .55, clearcoatRoughness: .22, envMapIntensity: 1.5, bumpScale: 2.4 });
  const matF = mat(), matB = mat();
  const front = new THREE.Mesh(faceF, matF); front.position.z = CT / 2 + .0125;
  const rear = new THREE.Mesh(faceB, matB); rear.position.z = -(CT / 2 + .0125);
  const group = new THREE.Group(); group.add(body, front, rear); scene.add(group);

  /* ---- tekstur per kartu (dibuat sekali, dibuang saat destroy) ---- */
  const cache = new Map(), owned = [];
  const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = maxAniso; owned.push(t); return t; };
  const texturesFor = (i) => {
    if (!cache.has(i)) {
      const art = paintCard(models[i]); if (!art) throw new Error('Kanvas 2D tidak tersedia');
      const side = (s) => ({ map: tex(s.color, true), mr: tex(s.mr, false), bump: tex(s.bump, false) });
      cache.set(i, { front: side(art.front), back: side(art.back) });
    }
    return cache.get(i);
  };
  const apply = (i) => {
    const t = texturesFor(i);
    for (const [m, s] of [[matF, t.front], [matB, t.back]]) { m.map = s.map; m.roughnessMap = s.mr; m.metalnessMap = s.mr; m.bumpMap = s.bump; m.needsUpdate = true; }
  };
  let current = clamp(index, 0, models.length - 1);
  apply(current);

  /* ---- ukuran & bingkai ---- */
  let w = 1, h = 1, camDist = 18;
  const fitCamera = () => {
    const t = Math.tan(THREE.MathUtils.degToRad(13)), dW = (CW / 2 * 1.12) / (t * camera.aspect), dH = (CH / 2 * 1.65) / t;
    camDist = Math.max(dW, dH); camera.position.set(0, 0, camDist); camera.lookAt(0, 0, 0);
  };
  const resize = () => {
    w = Math.max(2, container.clientWidth); h = Math.max(2, Math.round(w * .72));
    renderer.setSize(w, h, false); canvas.width = gl.width; canvas.height = gl.height; camera.aspect = w / h; camera.updateProjectionMatrix(); fitCamera(); dirty = true;
  };
  let dirty = true;
  resize();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null; if (ro) ro.observe(container);

  /* ---- keadaan animasi ---- */
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 }, flipS = { a: 0, t: 0 }, spin = { on: false, p: 0, swapped: false, to: 0 };
  let clock = 0, last = 0, raf = 0, onScreen = true, down = null, checkAt = 0;
  const sound = { back: false };

  function setTilt(e) {
    const r = canvas.getBoundingClientRect(), px = (e.clientX - r.left) / r.width - .5, py = (e.clientY - r.top) / r.height - .5;
    tilt.ty = clamp(px * 1.0, -.6, .6); tilt.tx = clamp(py * .7, -.4, .4);
  }
  const onMove = (e) => { if (e.pointerType === 'mouse' || down) setTilt(e); };
  const onDown = (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; setTilt(e); try { canvas.setPointerCapture(e.pointerId); } catch { /* abaikan */ } };
  const onUp = (e) => {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8 && performance.now() - down.t < 380) flip();
    down = null; if (e.pointerType !== 'mouse') { tilt.tx = tilt.ty = 0; }
  };
  const onLeave = () => { tilt.tx = tilt.ty = 0; };
  canvas.addEventListener('pointermove', onMove); canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onLeave); canvas.addEventListener('pointerleave', onLeave);

  function flip() { sound.back = !sound.back; flipS.t = sound.back ? Math.PI : 0; if (onFlip) onFlip(sound.back); }
  function setIndex(i) {
    i = clamp(i, 0, models.length - 1);
    if (i === current && !spin.on) return;
    spin.on = true; spin.p = 0; spin.swapped = false; spin.to = i;
  }

  function tick(dt) {
    clock += dt;
    const k = 1 - Math.exp(-dt * 7);
    tilt.x += (tilt.tx - tilt.x) * k; tilt.y += (tilt.ty - tilt.y) * k;
    flipS.a += (flipS.t - flipS.a) * (1 - Math.exp(-dt * 9));
    let spinY = 0;
    if (spin.on) {
      spin.p = Math.min(1, spin.p + dt / .85); spinY = ease(spin.p) * Math.PI * 2;
      if (!spin.swapped && spinY >= Math.PI / 2) { spin.swapped = true; current = spin.to; apply(current); }
      if (spin.p >= 1) { spin.on = false; spinY = 0; }
    }
    const idleY = Math.sin(clock * .55) * .16, idleX = Math.sin(clock * .4) * .07;
    group.rotation.set(tilt.x + idleX, flipS.a + spinY + tilt.y + idleY, Math.sin(clock * .33) * .015);
    group.position.y = Math.sin(clock * .9) * .05;
    key.position.set(2 + tilt.ty * 8 + Math.sin(clock * .7) * 1.5, 3 - tilt.tx * 6, 5);       // sorot bergeser = kilau bergerak di emas
  }
  function frame(now) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    if (now - checkAt > 250) { checkAt = now; onScreen = rectOnScreen(canvas.getBoundingClientRect(), window.innerWidth, window.innerHeight); }
    if (!onScreen || document.hidden) { last = now; return; }
    const dt = Math.min(.05, (now - last) / 1000 || .016); last = now;
    try {
      tick(dt); renderer.render(scene, camera);
      x2.clearRect(0, 0, canvas.width, canvas.height); x2.drawImage(gl, 0, 0);
      frames++;
      if (!seenCard && !failed && frames % 2 === 0) probePixels();
      if (seenCard && frames >= 3) markReady();
    } catch (e) { fail(e && e.message ? e.message : 'render'); }
  }
  last = performance.now(); raf = requestAnimationFrame(frame);

  /* Penjaga: kanvas yang seharusnya tampil tetapi tidak pernah menggambar bingkai -> kartu CSS. */
  const t0 = performance.now();
  const watchdog = setTimeout(() => { if (!ready && !document.hidden) fail(renderStalled({ frames, hidden: false, ms: performance.now() - t0, limit: 1 }) ? 'tidak-menggambar' : 'tidak-siap'); }, 15000);   // kartu CSS sudah terlihat selama menunggu, jadi penjaga boleh longgar (HP lemah)

  /* Diagnosis: tambahkan ?kartu=debug di alamat untuk melihat keadaan kartu langsung di layar. */
  let dbgTimer = 0;
  if (typeof location !== 'undefined' && /(^|[?&])kartu=debug(&|$)/.test(location.search || '')) {
    const pre = document.createElement('pre'); pre.className = 'gc-debug'; container.append(pre);
    const ctxGl = renderer.getContext(), ext = ctxGl && ctxGl.getExtension && ctxGl.getExtension('WEBGL_debug_renderer_info');
    const gpu = ext ? ctxGl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'n/a';
    dbgTimer = setInterval(() => {
      const r = canvas.getBoundingClientRect();
      pre.textContent = `3D frames:${frames} seen:${seenCard} ready:${ready} blank:${blankProbes} fail:${failed}\nonScreen:${onScreen} hidden:${document.hidden}\ncanvas:${canvas.width}x${canvas.height} gl:${gl.width}x${gl.height} css:${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.top)}\ndpr:${window.devicePixelRatio} gpu:${String(gpu).slice(0, 42)}`;
    }, 400);
  }

  return {
    setIndex, flip, isBack: () => sound.back,
    destroy() {
      destroyed = true; cancelAnimationFrame(raf); clearTimeout(watchdog); clearInterval(dbgTimer); container.classList.remove('gc-gl');
      canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onLeave); canvas.removeEventListener('pointerleave', onLeave);
      if (ro) ro.disconnect();
      owned.forEach((t) => t.dispose()); [bodyGeo, faceF, faceB].forEach((g) => g.dispose()); [body.material, matF, matB].forEach((m) => m.dispose());
      envTex.dispose(); pm.dispose(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    },
  };
}
