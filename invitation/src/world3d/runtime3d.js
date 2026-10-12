import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import '@fontsource/great-vibes/latin-400.css';
import '@fontsource/cinzel/latin-400.css';
import '@fontsource/cinzel/latin-600.css';
import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-500-italic.css';
import './runtime3d.css';
import { h } from '../engine/dom.js';
import { envelopeSettings } from '../engine/config.js';
import { createAudio } from '../engine/audio.js';
import { ctaInk } from '../scenes/envelope.js';
import { buildEnvelope, disposeObject } from './envelope3d.js';
import { CAM, hermite, makeBokeh } from './world.js';
import { glowSprite } from './textures.js';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const E = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const T_OPEN = 1.25, T_HOLD = 3.3, T_END = 4.0;       // waktu garis-waktu amplop (detik)
const FONTS = ['58px GV', '600 17px Cin', '400 17px Cin', 'italic 500 14px Cor', '500 14px Cor'];

/** Percikan sesaat (segel pecah, surat naik), kumpulan partikel tetap. */
function makeSparks(tex, cap = 260) {
  const pos = new Float32Array(cap * 3), col = new Float32Array(cap * 3), siz = new Float32Array(cap), alp = new Float32Array(cap);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(siz, 1)); g.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: tex }, uScale: { value: 1000 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale; varying vec3 vC; varying float vA;
      void main(){ vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize=min(160.0,aSize*uScale/max(0.1,-mv.z)); vC=aColor; vA=aAlpha; }`,
    fragmentShader: `uniform sampler2D uTex; varying vec3 vC; varying float vA; void main(){ vec4 t=texture2D(uTex,gl_PointCoord); gl_FragColor=vec4(vC*t.rgb*1.6,t.a*vA); }`,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false;
  const live = []; let cursor = 0;
  return {
    pts,
    burst(origin, n, glow, speed = 14, now = 0) {
      for (let i = 0; i < n; i++) {
        const th = Math.random() * 6.283, ph = Math.acos(2 * Math.random() - 1), sp = speed * (.4 + Math.random());
        live[cursor % cap] = { o: origin.clone(), v: new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.abs(Math.cos(ph)) * .9 + .15, Math.sin(ph) * Math.sin(th)).multiplyScalar(sp), t0: now, life: .9 + Math.random() * 1.1, size: .5 + Math.random() * 1.1, c: Math.random() < .6 ? [1, .86, .55] : Math.random() < .6 ? [1, 1, 1] : [glow.r, glow.g, glow.b] };
        cursor++;
      }
    },
    update(now) {
      for (let i = 0; i < cap; i++) {
        const p = live[i], lt = p ? now - p.t0 : 99, a = !p || lt > p.life ? 0 : 1 - lt / p.life;
        if (!p || a === 0) { alp[i] = 0; continue; }
        const d = (1 - Math.exp(-1.8 * lt)) / 1.8;
        pos[i * 3] = p.o.x + p.v.x * d; pos[i * 3 + 1] = p.o.y + p.v.y * d - 3.2 * lt * lt; pos[i * 3 + 2] = p.o.z + p.v.z * d;
        col.set(p.c, i * 3); siz[i] = p.size * (.5 + .5 * a); alp[i] = a;
      }
      for (const k of ['position', 'aColor', 'aSize', 'aAlpha']) g.attributes[k].needsUpdate = true;
    },
  };
}

/**
 * Adegan amplop 3D interaktif. Mengembalikan Promise<{ done, destroy }> setelah tekstur siap.
 * Alur: idle (kamera melayang, segel berdenyut) -> sentuh segel -> opening -> reading (tombol lanjut)
 *       -> diving (kamera menembus surat) -> done.
 */
export async function mount3D(container, ctx) {
  const { view, design: d, env = {} } = ctx;
  const s = envelopeSettings(view);
  await Promise.all(FONTS.map((f) => document.fonts.load(f, 'Rani & Dimas').catch(() => {})));

  const content = {
    title: view.title, eyebrow: String(view.eventLabel || '').toUpperCase(), lead: s.text.lead,
    date: view.dateText ? view.dateText.toUpperCase() : '', mono: s.sealText,
  };

  /* ---- DOM ---- */
  const canvas = h('canvas', { class: 'env-particles', 'aria-hidden': 'true' });
  const sealBtn = h('button', { class: 'e3-seal', type: 'button', 'aria-label': s.text.hint });
  const cta = h('button', { class: 'cta', type: 'button', text: s.text.openLabel });
  const skipBtn = h('button', { class: 'env-skip', type: 'button', text: s.text.skipLabel });
  const muteBtn = h('button', { class: 'env-mute', type: 'button', 'aria-pressed': 'false', 'aria-label': 'Matikan suara', text: '♪' });
  const flash = h('div', { class: 'e3-flash' });
  const top = h('div', { class: 'e3-top' }, view.recipient ? h('p', { class: 'env-for' }, h('span', { text: s.text.toPrefix }), h('strong', { text: view.recipient })) : null);
  const bottom = h('div', { class: 'e3-bottom' }, h('p', { class: 'env-tagline', text: s.text.tagline }), h('p', { class: 'env-hint', text: s.text.hint }), cta);
  const stage = h('div', { class: 'env3d', 'data-state': 'idle', 'data-design': d.id }, canvas, h('div', { class: 'e3-vig' }), top, bottom, sealBtn, skipBtn, muteBtn, flash);
  // Latar 3D selalu gelap: warna teks & tombol mengikuti desain 3D, bukan tema 2D (yang bisa bernuansa terang).
  stage.style.setProperty('--stage-ink', '#f6ebd0'); stage.style.setProperty('--glow', d.glow); stage.style.setProperty('--accent2', d.glow);
  stage.style.setProperty('--font-display', view.theme.fonts.display); stage.style.setProperty('--font-body', view.theme.fonts.body);
  stage.style.setProperty('--bg1', d.bgBot); stage.style.setProperty('--cta-ink', ctaInk({ bg1: d.bgBot, ink: d.ink, accent2: d.glow }));
  container.replaceChildren(stage);

  /* ---- three ---- */
  const size = () => ({ w: Math.max(2, container.clientWidth || window.innerWidth), h: Math.max(2, container.clientHeight || window.innerHeight) });
  let { w, h: hh } = size();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.setSize(w, hh, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer); const envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex; scene.environmentIntensity = .3;
  const bg = new THREE.Color(d.bgTop).lerp(new THREE.Color(d.bgBot), .55).multiplyScalar(.55);
  scene.background = bg; scene.fog = new THREE.Fog(bg.clone(), 55, 230);

  const camera = new THREE.PerspectiveCamera(62, w / hh, .1, 600);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ color: 0x0b0a0e, roughness: .2, metalness: .88 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const key = new THREE.SpotLight(0xffe4b8, 2600, 260, .46, .75, 2); key.position.set(-16, 34, 20); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -.0004; key.shadow.radius = 4; key.shadow.camera.near = 20; key.shadow.camera.far = 140;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x9fb8ff, .55); rim.position.set(18, 22, -40); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0x8a93b8, 0x120e12, .22));
  const sealLight = new THREE.PointLight(new THREE.Color(d.glow), 0, 70, 2); scene.add(sealLight);

  const gtex = glowSprite();
  const envelope = buildEnvelope(d, gtex, content); scene.add(envelope.root);
  const bokeh = makeBokeh(gtex, 650, 150); scene.add(bokeh);
  const sparks = makeSparks(gtex); scene.add(sparks.pts);
  const glowCol = new THREE.Color(d.glow);

  const composer = new EffectComposer(renderer); composer.setSize(w, hh);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, hh), .42, .55, .92); composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const keys = CAM.slice(1).map(([t, p, l]) => ({ t, p: new THREE.Vector3(...p), l: new THREE.Vector3(...l) }));
  const audio = createAudio(view.theme.sfx);

  /* ---- keadaan ---- */
  let state = 'idle', lt = T_OPEN, openT = 0, clock = 0, raf = 0, last = 0, destroyed = false, aspectScale = 1;
  let yaw = 0, pitch = 0, tYaw = 0, tPitch = 0, drag = null, fired1 = false, fired2 = false, fired3 = false;
  let finished; const done = new Promise((r) => { finished = r; });
  const P = new THREE.Vector3(), L = new THREE.Vector3(), idleP = keys[0].p.clone(), tmp = new THREE.Vector3();
  const setState = (st) => { state = st; stage.dataset.state = st; };

  function onResize() {
    ({ w, h: hh } = size());
    renderer.setSize(w, hh, false); composer.setSize(w, hh); bloom.setSize(w, hh);
    camera.aspect = w / hh; camera.updateProjectionMatrix();
    aspectScale = clamp(.5625 / (w / hh) * 1.12, .62, 1.4);           // layar lebar -> kamera lebih dekat, supaya amplop tetap mengisi bingkai
    const scale = hh * renderer.getPixelRatio() / 2 / Math.tan(THREE.MathUtils.degToRad(31));
    bokeh.material.uniforms.uScale.value = scale; sparks.pts.material.uniforms.uScale.value = scale;
  }
  onResize();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null; if (ro) ro.observe(container);

  function open() {
    if (state !== 'idle') return;
    audio.unlock(); audio.paper();
    setState('opening'); openT = 0; lt = T_OPEN;
  }
  function skip() {
    if (state === 'idle') audio.unlock();
    if (state === 'idle' || state === 'opening') { lt = T_HOLD; openT = 99; setState('reading'); envelope.update(lt); fired1 = fired2 = fired3 = true; }
  }
  function dive() { if (state !== 'reading') return; setState('diving'); }

  sealBtn.addEventListener('click', open);
  skipBtn.addEventListener('click', skip);
  cta.addEventListener('click', dive);
  muteBtn.addEventListener('click', () => {
    audio.setMuted(!audio.muted); muteBtn.setAttribute('aria-pressed', String(audio.muted));
    muteBtn.setAttribute('aria-label', audio.muted ? 'Nyalakan suara' : 'Matikan suara'); muteBtn.classList.toggle('is-off', audio.muted);
  });
  const onDown = (e) => { if (e.target.closest('button')) return; drag = { x: e.clientX, y: e.clientY, yaw: tYaw, pitch: tPitch }; };
  const onMove = (e) => { if (!drag) return; tYaw = clamp(drag.yaw - (e.clientX - drag.x) * .004, -.5, .5); tPitch = clamp(drag.pitch + (e.clientY - drag.y) * .003, -.18, .22); };
  const onUp = () => { drag = null; };
  stage.addEventListener('pointerdown', onDown); window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);

  const origin = (v) => tmp.copy(v);
  function tick(dt) {
    clock += dt;
    yaw += (tYaw - yaw) * Math.min(1, dt * 6); pitch += (tPitch - pitch) * Math.min(1, dt * 6);
    if (!drag && state !== 'idle') { tYaw *= Math.pow(.2, dt); tPitch *= Math.pow(.2, dt); }       // kembali pelan ke bingkai semula
    if (state === 'idle') {
      envelope.idle(clock);
      P.copy(idleP).add(tmp.set(Math.sin(clock * .5) * 1.6, Math.sin(clock * .37) * .6, Math.cos(clock * .45) * 1.2)); L.set(0, 0, 0);
    } else {
      if (state === 'opening') {
        openT += dt; lt = T_OPEN + openT;
        if (lt >= T_HOLD) { lt = T_HOLD; setState('reading'); }
      } else if (state === 'diving') {
        lt += dt * 1.05;
        if (lt >= T_END && !fired3) { fired3 = true; flash.style.transition = 'opacity .28s'; flash.style.opacity = '1'; setTimeout(() => !destroyed && finished(), 340); }
      }
      lt = Math.min(lt, T_END + .3);
      envelope.update(lt);
      hermite(keys, Math.min(lt, 3.95), 'p', P); hermite(keys, Math.min(lt, 3.95), 'l', L);
      const blend = E(seg(openT, 0, .45));
      if (state === 'opening' && blend < 1) P.copy(tmp.copy(idleP).lerp(P, blend));   // peralihan mulus dari kamera diam
      if (state === 'reading') { P.x += Math.sin(clock * .6) * .5; P.y += Math.sin(clock * .5) * .2; }
      if (!fired1 && lt >= 1.6) { fired1 = true; sparks.burst(envelope.sealWorld, 70, glowCol, 14, clock); }
      if (!fired2 && lt >= 2.55) { fired2 = true; audio.chime(); sparks.burst(origin(new THREE.Vector3(0, 6, -2.5)), 90, glowCol, 20, clock); }
    }
    // putar kamera mengelilingi titik pandang sesuai geseran pengguna + penyesuaian bingkai
    tmp.copy(P).sub(L).multiplyScalar(aspectScale);
    tmp.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw); tmp.y += pitch * tmp.length() * .6;
    camera.position.copy(L).add(tmp); camera.up.set(0, 1, 0); camera.lookAt(L);
    camera.rotateZ(Math.sin(clock * .6) * .012);
    // lampu & uniform
    sealLight.position.copy(envelope.sealWorld).add(tmp.set(0, 3, 0)); sealLight.intensity = envelope.glowStrength * 110;
    bokeh.material.uniforms.uTime.value = clock; sparks.update(clock);
    // tombol segel mengikuti posisi segel di layar (sentuhan + papan ketik)
    if (state === 'idle') {
      const v = tmp.copy(envelope.sealWorld).project(camera);
      sealBtn.style.left = `${((v.x * .5 + .5) * w).toFixed(1)}px`; sealBtn.style.top = `${((-v.y * .5 + .5) * hh).toFixed(1)}px`;
    }
  }
  function frame(now) {
    if (destroyed) return;
    const dt = Math.min(.05, (now - last) / 1000 || .016); last = now;
    tick(dt); composer.render();
    raf = requestAnimationFrame(frame);
  }
  const onVis = () => { if (document.hidden) cancelAnimationFrame(raf); else { last = performance.now(); raf = requestAnimationFrame(frame); } };
  document.addEventListener('visibilitychange', onVis);
  last = performance.now(); raf = requestAnimationFrame(frame);

  return {
    done,
    destroy() {
      destroyed = true; cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
      if (ro) ro.disconnect();
      disposeObject(scene); gtex.dispose(); envTex.dispose(); pm.dispose(); composer.dispose(); audio.close();
      renderer.dispose(); renderer.forceContextLoss();
      container.replaceChildren();
    },
  };
}
