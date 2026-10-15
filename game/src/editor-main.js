import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createEditor, openProject } from './world-editor.js';
import { CATALOG, PROP_TYPES, TEMPLATES, TEMPLATE_KEYS, LIMITS, newProject, toWorld } from './world-project.js';
import { createCloud } from './world-cloud.js';
import { initCloudUi } from './editor-cloud-ui.js';
import { initAiUi } from './editor-ai-ui.js';
import { propMesh, placeMesh, footprintLine, buildGround, spawnMarker, SKY_PRESETS, labelOf } from './world-project-view.js';

const $ = (id) => document.getElementById(id);
const DRAFT_KEY = 'orbit.worldeditor.draft.v1';
const PLAYER_SPEED = 5.2; // sama dengan server (ROOM_RULES.playerSpeed)

// ------------------------------------------------------------------ editor + draf
const store = {
  get() { try { return localStorage.getItem(DRAFT_KEY); } catch { return null; } },
  set(v) { try { localStorage.setItem(DRAFT_KEY, v); } catch { /* penyimpanan diblokir: draf tidak tersimpan otomatis */ } },
};
let restored = false;
function initialProject() {
  const raw = store.get();
  if (raw) {
    try {
      const r = openProject(JSON.parse(raw));
      if (r.ok) { restored = true; return r.project; }
    } catch { /* draf rusak diabaikan */ }
  }
  return newProject('taman');
}
const editor = createEditor(initialProject());
let cloudUi = null; // diisi di bawah bila Supabase dikonfigurasi
let aiUi = null; // diisi di bawah bersama klien awan (butuh sesi akun)
if (new URLSearchParams(location.search).has('debug')) window.__editor = editor;

// ------------------------------------------------------------------ scene
const host = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
host.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 900);
const hemi = new THREE.HemisphereLight(0xffffff, 0x6a7a5a, 0.9);
const sun = new THREE.DirectionalLight(0xfff4dc, 1.1);
sun.position.set(30, 60, 20);
scene.add(hemi, sun);
const propsGroup = new THREE.Group();
scene.add(propsGroup);
const spawnObj = spawnMarker();
scene.add(spawnObj);

// Pendengar penekanan dipasang SEBELUM OrbitControls supaya bisa menonaktifkannya saat menyeret objek.
let controls;
const meshes = new Map();
let groundGroup = null;
let groundKey = '';
let selLine = null;
let armed = null; // null = pilih, 'spawn', atau jenis objek yang akan ditempatkan
let playing = false;
let drag = null;
let tap = null;

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function toNdc(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
function groundAt(ev) { toNdc(ev); const out = new THREE.Vector3(); return ray.ray.intersectPlane(plane, out) ? out : null; }
function pickProp(ev) { toNdc(ev); const hits = ray.intersectObjects(propsGroup.children, false); return hits.length ? hits[0].object.userData.id : null; }

const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', (ev) => {
  if (playing || cloudUi?.reviewing || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
  const id = pickProp(ev);
  tap = { x: ev.clientX, y: ev.clientY, id };
  if (id && armed === null) {
    editor.select(id);
    const g = groundAt(ev);
    const p = editor.getProp(id);
    drag = { id, pointer: ev.pointerId, off: g && p ? { x: g.x - p.x, z: g.z - p.z } : { x: 0, z: 0 } };
    if (controls) controls.enabled = false;
    editor.beginGesture();
  }
});
canvas.addEventListener('pointermove', (ev) => {
  if (!drag || ev.pointerId !== drag.pointer) return;
  const g = groundAt(ev);
  if (g) editor.move(drag.id, g.x - drag.off.x, g.z - drag.off.z);
});
function endPointer(ev) {
  if (drag && ev.pointerId === drag.pointer) { editor.endGesture(); drag = null; if (controls) controls.enabled = true; }
  if (tap && ev.type === 'pointerup' && Math.hypot(ev.clientX - tap.x, ev.clientY - tap.y) < 6) handleTap(ev, tap);
  tap = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

function handleTap(ev, t) {
  const g = groundAt(ev);
  if (armed === 'spawn') { if (g) editor.setSpawn(g.x, g.z); return; }
  if (armed) {
    if (!g) return;
    const r = editor.place(armed, g.x, g.z);
    if (!r.ok) toast(r.message);
    return;
  }
  if (!t.id) editor.select(null);
}

controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.minDistance = 4;
controls.maxDistance = 320;

function fitCamera() {
  const { halfX, halfZ } = editor.project.area;
  const d = Math.max(halfX, halfZ);
  camera.position.set(0, d * 0.9 + 10, d * 0.9 + 14);
  controls.target.set(0, 0, 0);
  controls.update();
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ------------------------------------------------------------------ sinkron proyek -> scene
function sync() {
  const p = editor.project;
  const key = `${p.area.halfX}x${p.area.halfZ}:${p.sky}`;
  if (key !== groundKey) {
    groundKey = key;
    if (groundGroup) { scene.remove(groundGroup); groundGroup.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); }); }
    groundGroup = buildGround(p.area, p.sky);
    scene.add(groundGroup);
    const sky = SKY_PRESETS[p.sky];
    scene.background = new THREE.Color(sky.bg);
    hemi.intensity = sky.ambient;
    sun.intensity = sky.sun;
    sun.color.set(sky.sunColor);
  }
  const seen = new Set();
  for (const prop of p.props) {
    let m = meshes.get(prop.id);
    if (!m || m.userData.type !== prop.type) {
      if (m) propsGroup.remove(m);
      m = propMesh(prop.type);
      meshes.set(prop.id, m);
      propsGroup.add(m);
    }
    placeMesh(m, prop);
    seen.add(prop.id);
  }
  for (const [id, m] of meshes) if (!seen.has(id)) { propsGroup.remove(m); meshes.delete(id); }
  spawnObj.position.set(p.spawn.x, 0, p.spawn.z);

  if (selLine) { scene.remove(selLine); selLine.geometry.dispose(); selLine.material.dispose(); selLine = null; }
  const sel = editor.selection ? editor.getProp(editor.selection) : null;
  if (sel && !playing) {
    selLine = footprintLine(sel.type, sel.rot);
    selLine.position.set(sel.x, 0, sel.z);
    scene.add(selLine);
  }
  refreshUi();
}

// ------------------------------------------------------------------ UI
let toastTimer;
function toast(msg, ms = 2600) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

const palette = $('palette');
function buildPalette() {
  const mk = (id, label, title) => {
    const b = document.createElement('button');
    b.className = 'btn';
    b.type = 'button';
    b.dataset.tool = id;
    b.textContent = label;
    b.title = title;
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => setArmed(armed === id ? null : id));
    return b;
  };
  palette.append(mk('select', 'Pilih', 'Pilih dan geser objek'));
  palette.querySelector('[data-tool=select]').addEventListener('click', () => setArmed(null));
  palette.append(mk('spawn', 'Titik mulai', 'Letakkan titik mulai pemain'));
  for (const t of PROP_TYPES) palette.append(mk(t, labelOf(t), `${CATALOG[t].group}: ${labelOf(t)} (beban ${CATALOG[t].weight})`));
}
function setArmed(tool) {
  armed = tool === 'select' ? null : tool;
  for (const b of palette.children) b.setAttribute('aria-pressed', String((b.dataset.tool === 'select' && armed === null) || b.dataset.tool === armed));
  refreshUi();
}

const tplSel = $('template');
tplSel.append(new Option('Template…', ''));
for (const k of TEMPLATE_KEYS) tplSel.append(new Option(TEMPLATES[k].label, k));
tplSel.addEventListener('change', () => {
  const k = tplSel.value;
  tplSel.value = '';
  if (!k) return;
  if (editor.project.props.length && !confirm(`Ganti isi dunia dengan template "${TEMPLATES[k].label}"? Bisa diurungkan (Ctrl+Z).`)) return;
  const r = editor.applyTemplate(k);
  if (!r.ok) toast(r.message); else { fitCamera(); toast(`Template "${TEMPLATES[k].label}" diterapkan`); }
});

const issuesPanel = $('issues');
function renderIssues() {
  const r = editor.issues();
  issuesPanel.replaceChildren();
  const h = document.createElement('h3');
  h.textContent = r.errors.length ? 'Masalah yang harus diperbaiki' : 'Tidak ada galat';
  issuesPanel.append(h);
  const list = document.createElement('ul');
  list.style.cssText = 'margin:0;padding-left:18px';
  const add = (cls, e) => {
    const li = document.createElement('li');
    li.className = cls;
    li.textContent = e.msg;
    const m = /^props\[(\d+)\]/.exec(e.path || '');
    if (m && editor.project.props[Number(m[1])]) li.addEventListener('click', () => editor.select(editor.project.props[Number(m[1])].id));
    list.append(li);
  };
  r.errors.forEach((e) => add('e', e));
  r.warnings.forEach((e) => add('w', e));
  if (!r.errors.length && !r.warnings.length) { const li = document.createElement('li'); li.textContent = 'Dunia siap diuji dan disimpan.'; list.append(li); }
  issuesPanel.append(list);
}
$('issuesBtn').addEventListener('click', () => { issuesPanel.classList.toggle('show'); renderIssues(); });
const openIssues = () => { issuesPanel.classList.add('show'); renderIssues(); };

function refreshUi() {
  const u = editor.usage;
  const usage = $('usage');
  usage.textContent = `${u.count}/${u.maxCount} objek · beban ${u.weight}/${u.budget}`;
  usage.className = `pill ${u.weight > u.budget * 0.85 || u.count > u.maxCount * 0.85 ? 'warn' : ''}`;
  const r = editor.issues();
  const btn = $('issuesBtn');
  btn.textContent = r.errors.length ? `${r.errors.length} galat` : r.warnings.length ? `${r.warnings.length} peringatan` : '✓ Siap';
  btn.classList.toggle('on', !r.errors.length && !r.warnings.length);
  btn.style.borderColor = r.errors.length ? 'var(--bad)' : '';
  if (issuesPanel.classList.contains('show')) renderIssues();
  $('undo').disabled = !editor.canUndo;
  $('redo').disabled = !editor.canRedo;
  if (document.activeElement !== $('name')) $('name').value = editor.project.name;
  $('sky').value = editor.project.sky;
  $('tools').classList.toggle('show', !!editor.selection && !playing && !cloudUi?.reviewing);
  const cs = $('cloudState');
  cs.textContent = cloudUi?.reviewing ? 'Mode tinjau' : cloudUi?.linked ? `☁ ${cloudUi.linked.name}` : '';
  cs.style.display = cs.textContent ? '' : 'none';
  $('hint').textContent = playing ? 'Mode uji: jalan dengan WASD / panah / tombol layar.'
    : armed === 'spawn' ? 'Ketuk lahan untuk meletakkan titik mulai.'
      : armed ? `Ketuk lahan untuk menaruh: ${labelOf(armed)}. Ketuk "Pilih" untuk selesai.`
        : 'Ketuk objek untuk memilih, seret untuk memindah.';
}

$('undo').addEventListener('click', () => editor.undo());
$('redo').addEventListener('click', () => editor.redo());
$('rot').addEventListener('click', () => { if (editor.selection) editor.rotate(editor.selection); });
$('dup').addEventListener('click', () => { if (editor.selection) { const r = editor.duplicate(editor.selection); if (!r.ok) toast(r.message); } });
$('del').addEventListener('click', () => { if (editor.selection) editor.remove(editor.selection); });
$('name').addEventListener('change', (e) => { const r = editor.rename(e.target.value); if (!r.ok) { toast(r.message); e.target.value = editor.project.name; } });
$('sky').addEventListener('change', (e) => editor.setSky(e.target.value));

// ------------------------------------------------------------------ simpan / buka (berkas)
const slug = (s) => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'dunia';
$('save').addEventListener('click', () => {
  const r = editor.issues();
  const blob = new Blob([JSON.stringify(editor.project, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${slug(editor.project.name)}.orbit-world.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  editor.markSaved();
  toast(r.ok ? 'Berkas dunia disimpan' : `Draf disimpan, tapi masih ${r.errors.length} galat`, 3200);
});
$('open').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  if (f.size > LIMITS.maxBytes * 1.5) { toast('Berkas terlalu besar untuk proyek dunia'); return; }
  let raw;
  try { raw = JSON.parse(await f.text()); } catch { toast('Berkas bukan JSON yang valid'); return; }
  const r = editor.load(raw);
  if (r.ok) cloudUi?.unlink(); // berkas lokal bukan proyek akun: jangan tertimpa saat menyimpan ke akun
  if (!r.ok) { toast(`Tidak bisa dibuka: ${r.errors[0]?.msg ?? 'rusak'}`, 4200); return; }
  fitCamera();
  toast(r.errors.length ? `Dibuka dengan ${r.errors.length} masalah yang perlu diperbaiki` : 'Dunia dibuka', 3200);
});

let saveTimer;
editor.subscribe(() => {
  if (cloudUi?.reviewing) return; // dunia yang sedang ditinjau tidak boleh menimpa draf lokal
  clearTimeout(saveTimer);
  // Periksa lagi saat pengatur waktu berjalan: tinjau bisa dimulai setelah perubahan terakhir tetapi sebelum 400 ms habis.
  saveTimer = setTimeout(() => { if (!cloudUi?.reviewing) store.set(JSON.stringify(editor.project)); }, 400);
});

// ------------------------------------------------------------------ mode uji jalan
const keys = new Set();
let world = null;
let avatar = null;
let pos = null;
let savedCam = null;
const KEYMAP = { ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down', ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right' };

function startPlay() {
  const r = editor.issues();
  if (!r.ok) { toast('Perbaiki galat dulu sebelum uji jalan'); openIssues(); return; }
  world = toWorld(r.project);
  avatar = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.9, 4, 10), new THREE.MeshStandardMaterial({ color: '#2e6fd9' }));
  scene.add(avatar);
  pos = { x: world.spawn.x, z: world.spawn.z, level: 0 };
  savedCam = { p: camera.position.clone(), t: controls.target.clone() };
  playing = true;
  document.body.classList.add('play');
  $('play').textContent = 'Kembali ke editor';
  $('play').setAttribute('aria-pressed', 'true');
  $('pad').classList.add('show');
  controls.enabled = false;
  spawnObj.visible = false;
  sync();
}
function stopPlay() {
  playing = false;
  scene.remove(avatar);
  avatar.geometry.dispose();
  avatar.material.dispose();
  avatar = null;
  world = null;
  keys.clear();
  document.body.classList.remove('play');
  $('play').textContent = 'Uji jalan';
  $('play').setAttribute('aria-pressed', 'false');
  $('pad').classList.remove('show');
  controls.enabled = true;
  spawnObj.visible = true;
  camera.position.copy(savedCam.p);
  controls.target.copy(savedCam.t);
  controls.update();
  sync();
}
$('play').addEventListener('click', () => (playing ? stopPlay() : startPlay()));
for (const b of $('pad').querySelectorAll('[data-k]')) {
  const k = b.dataset.k;
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); keys.add(k); });
  for (const t of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(t, () => keys.delete(k));
}

window.addEventListener('keydown', (e) => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (cloudUi?.reviewing && !playing) return;
  if (playing) { const k = KEYMAP[e.key]; if (k) { keys.add(k); e.preventDefault(); } if (e.key === 'Escape') stopPlay(); return; }
  if (typing) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? editor.redo() : editor.undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); editor.redo(); return; }
  if (!editor.selection) { if (e.key === 'Escape') setArmed(null); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); editor.remove(editor.selection); }
  else if (e.key.toLowerCase() === 'r') editor.rotate(editor.selection);
  else if (e.key.toLowerCase() === 'd') editor.duplicate(editor.selection);
  else if (e.key === 'Escape') editor.select(null);
});
window.addEventListener('keyup', (e) => { const k = KEYMAP[e.key]; if (k) keys.delete(k); });

// ------------------------------------------------------------------ loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (playing && world) {
    const dx = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
    const dz = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
    if (dx || dz) {
      const len = Math.hypot(dx, dz);
      pos = world.move(pos, (dx / len) * PLAYER_SPEED * dt, (dz / len) * PLAYER_SPEED * dt);
    }
    avatar.position.set(pos.x, 0.77, pos.z);
    const target = new THREE.Vector3(pos.x, 12, pos.z + 6); // cukup tinggi agar garis pandang melewati atas dinding (3 m)
    camera.position.lerp(target, 1 - Math.pow(0.001, dt));
    camera.lookAt(pos.x, 0.8, pos.z);
  } else {
    controls.update();
  }
  if (!window.__ORBIT_NO_RENDER__) renderer.render(scene, camera); // saklar hanya untuk tes E2E non-visual (diisi skrip, bukan URL)
  requestAnimationFrame(frame);
}

const SESSION_KEY = 'orbit.worldeditor.session.v1';
const sessionStore = {
  get() { try { return localStorage.getItem(SESSION_KEY); } catch { return null; } },
  set(v) { try { if (v == null) localStorage.removeItem(SESSION_KEY); else localStorage.setItem(SESSION_KEY, v); } catch { /* penyimpanan diblokir: sesi hanya hidup selama halaman terbuka */ } },
};
try {
  // Konfigurasi dari build (VITE_*). `window.__ORBIT_CLOUD__` hanya bisa diisi skrip sebelum halaman berjalan (dipakai tes E2E);
  // sengaja BUKAN parameter URL, supaya tautan buatan tidak bisa mengarahkan login ke server lain.
  const injected = window.__ORBIT_CLOUD__;
  const cloud = createCloud({ url: injected?.url ?? import.meta.env.VITE_SUPABASE_URL, key: injected?.key ?? import.meta.env.VITE_SUPABASE_ANON_KEY, store: sessionStore });
  cloudUi = initCloudUi({ editor, cloud, panel: $('cloud'), button: $('cloudBtn'), reviewbar: $('reviewbar'), toast, onChange: () => { sync(); } });
  try {
    aiUi = initAiUi({ editor, cloud, panel: $('ai'), button: $('aiBtn'), toast, canUse: () => !cloudUi?.reviewing && !playing, onApplied: () => { fitCamera(); sync(); } });
  } catch {
    $('aiBtn').addEventListener('click', () => toast('Fitur AI tidak tersedia.', 3200));
  }
} catch {
  $('cloudBtn').addEventListener('click', () => toast('Akun belum dikonfigurasi (VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY).', 4200));
  $('aiBtn').addEventListener('click', () => toast('Draf AI butuh akun: isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY.', 4200));
}

buildPalette();
setArmed(null);
editor.subscribe(sync);
resize();
fitCamera();
sync();
if (restored) toast('Draf terakhir dipulihkan', 2200);
if (new URLSearchParams(location.search).has('debug')) {
  // Bantuan uji otomatis: proyeksikan titik dunia ke koordinat layar.
  window.__pos = () => (pos ? { x: pos.x, z: pos.z } : null);
  window.__project = (x, z) => { const v = new THREE.Vector3(x, 0, z).project(camera); return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight }; };
}
requestAnimationFrame(frame);
