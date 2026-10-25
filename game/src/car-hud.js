// HUD mengemudi bertahap untuk mobil mewah (DOM murni, tanpa berkas CSS). Hanya kontrol yang relevan dengan keadaan kendaraan yang tampil
// (aturan tahapnya di car-state.js, dikirim car-ride.js lewat view()):
//   kabin (mesin belum siap): tombol Nyalakan + panel fitur. Setir, gas, rem, gigi tersembunyi.
//   berhenti (mesin siap)   : setir bulat (kiri bawah), pedal rem dan gas tekan-tahan (kanan bawah), pemilih gigi P R N D, tombol Matikan.
//   melaju                  : sama, tanpa tombol mesin; tombol aksi halaman (#act-button, Turun) disembunyikan sampai berhenti.
// Lencana kecil kiri atas (gigi, km/j, sein/hazard berkedip, REM saat rem tangan), klakson bulat, dan tombol ⋯ untuk panel fitur
// (lampu, hazard, rem tangan, AC, sabuk, sein kiri/kanan, pintu kiri/kanan, atap) plus pengaturan (mode setir bulat/geser, sensitivitas) yang disimpan di perangkat.
// Setir bulat: putar dengan satu jempol, kembali halus ke tengah saat dilepas. Warna mengikuti panel hotel (emas #c9a24b).
// Papan ketik: I = mesin, B = rem tangan, L = lampu, X = hazard, 1-4 = gigi P R N D, koma/titik = sein kiri/kanan, K = pintu kiri, ; = pintu kanan, T = atap.
const BASE = 'position:fixed;z-index:30;font:600 13px system-ui,sans-serif;color:#fff;';
const SAFE_TOP = 'max(12px,env(safe-area-inset-top))';
const SAFE_BOTTOM = 'max(24px,env(safe-area-inset-bottom))';
const GLASS = 'rgba(20,17,13,.5)';
const TILE_BG = 'rgba(255,255,255,.1)';
const GOLD = '#c9a24b';
const INK = '#1a1306';
const CREAM = '#f1e9d6';
const LINE = 'rgba(255,255,255,.35)';
const RIB = 'repeating-linear-gradient(0deg,rgba(255,255,255,.34) 0 3px,rgba(255,255,255,.08) 3px 8px)';
const NOSEL = 'touch-action:none;user-select:none;-webkit-user-select:none';
const STORE_KEY = 'nikora-car-hud';
const WHEEL = 118; // garis tengah setir bulat (px)
const KNOB = 44; // kenop penggeser setir (mode geser)
// Putaran setir (rad) dari tengah sampai kunci penuh: makin kecil makin peka.
const SENS = Object.freeze([{ id: 'low', label: 'Rendah', lock: 1.9 }, { id: 'mid', label: 'Normal', lock: 1.4 }, { id: 'high', label: 'Tinggi', lock: 1.0 }]);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function loadSettings() {
  try {
    const o = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}');
    return { mode: o.mode === 'slider' ? 'slider' : 'wheel', sens: SENS.some((s) => s.id === o.sens) ? o.sens : 'mid' };
  } catch {
    return { mode: 'wheel', sens: 'mid' };
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  } catch {
    /* penyimpanan tidak tersedia */
  }
}

const make = (tag, css = '', text = '') => {
  const n = document.createElement(tag);
  if (css) n.style.cssText = css;
  if (text) n.textContent = text;
  return n;
};
/** Tampilkan/sembunyikan tanpa menulis gaya yang sama berulang tiap frame. */
const showEl = (n, on, disp = 'block') => {
  const v = on ? disp : 'none';
  if (n._d === v) return;
  n._d = v;
  n.style.display = v;
};
const setText = (n, t) => {
  if (n.textContent !== t) n.textContent = t;
};
/** Warna menyala (emas) atau biasa; n._bg = warna dasar elemen. */
const lit = (n, on) => {
  if (n._l === on) return;
  n._l = on;
  n.style.background = on ? GOLD : n._bg;
  n.style.color = on ? INK : CREAM;
};

/**
 * Dipakai car-ride.js: set(kmh, info, compact) tiap frame (kmh null = sembunyi), view(model) tiap frame (null = tanpa kontrol kendaraan),
 * bind(fn) menerima perintah { type, value } dari tombol. pedals() = { gas, brake, reverse } (0/1; reverse selalu 0, mundur lewat gigi R);
 * steer() = setir -1..1 (kanan = +, sama dengan sumbu x joystick).
 */
export function mountCarHud({ onHorn = () => {} } = {}) {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const settings = loadSettings();
  let handler = () => {};
  const emit = (type, value) => handler({ type, value });
  let shown = false;
  let vm = null; // model dari car-state.js hudModel()
  let gearInfo = null; // info gigi dari car-ride.js bila tanpa model (HUD lama)
  let panelOpen = false;
  let lastT = performance.now();
  const lockNow = () => (SENS.find((s) => s.id === settings.sens) ?? SENS[1]).lock;

  // saat melaju, tombol aksi halaman (Turun) disembunyikan: keluar hanya setelah berhenti
  const style = make('style');
  style.textContent = 'body.car-moving #act-button{visibility:hidden;pointer-events:none}';
  document.head.appendChild(style);

  // lencana kecil: gigi + kecepatan + sein + rem tangan
  const badge = make('div', `${BASE}left:14px;top:${SAFE_TOP};display:none;align-items:center;gap:6px;padding:3px 8px;border-radius:8px;background:${GLASS};pointer-events:none`);
  badge.setAttribute('role', 'status');
  badge.setAttribute('aria-live', 'off');
  const gear = make('span', `font:800 13px system-ui,sans-serif;color:${INK};background:${GOLD};border-radius:4px;min-width:22px;padding:1px 4px;text-align:center`);
  const speed = make('span', `font:800 18px system-ui,sans-serif;color:${CREAM};min-width:32px;text-align:right;font-variant-numeric:tabular-nums`);
  const unit = make('span', 'font-size:9px;color:#c9b88a;letter-spacing:.06em', 'KM/J');
  const signal = make('span', 'font:800 15px system-ui,sans-serif;color:#ffb020;min-width:18px;text-align:center;display:none');
  const brakeTag = make('span', 'font:800 10px system-ui,sans-serif;color:#fff;background:#d33;border-radius:4px;padding:1px 4px;display:none', 'REM');
  badge.append(gear, speed, unit, signal, brakeTag);
  document.body.appendChild(badge);

  // klakson: tombol bulat kecil di atas setir (tahan untuk berbunyi)
  const horn = make('button', `${BASE}left:14px;bottom:calc(${SAFE_BOTTOM} + ${WHEEL + 12}px);display:none;width:46px;height:46px;border-radius:50%;border:1px solid ${LINE};background:${GLASS};font-size:20px;line-height:1;padding:0;${NOSEL}`);
  horn.type = 'button';
  horn.innerHTML = '&#128227;';
  horn.setAttribute('aria-label', 'Klakson (tahan, atau tombol H)');
  const hornOn = (on) => { horn.style.background = on ? GOLD : GLASS; };
  horn.addEventListener('pointerdown', (e) => { e.preventDefault(); hornOn(true); onHorn(true); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) horn.addEventListener(ev, () => { hornOn(false); onHorn(false); });
  document.body.appendChild(horn);

  // setir bulat: putar dengan menyeret melingkar; lepas = kembali halus ke tengah
  let wheelRot = 0; // rad, + = searah jarum jam = belok kanan
  let wheelPtr = null;
  let lastAngle = 0;
  const wheel = make('div', `${BASE}left:14px;bottom:${SAFE_BOTTOM};display:none;width:${WHEEL}px;height:${WHEEL}px;${NOSEL}`);
  wheel.setAttribute('aria-label', 'Setir (putar kiri atau kanan)');
  const rim = make('div', 'position:absolute;inset:0;border-radius:50%;border:9px solid rgba(255,255,255,.8);box-sizing:border-box;box-shadow:0 2px 8px rgba(0,0,0,.4);pointer-events:none;will-change:transform');
  const spokeCss = 'position:absolute;border-radius:4px;background:rgba(255,255,255,.72)';
  rim.append(
    make('div', `${spokeCss};left:0;right:0;top:50%;height:8px;margin-top:-4px`),
    make('div', `${spokeCss};top:50%;bottom:0;left:50%;width:8px;margin-left:-4px`),
    make('div', `position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:rgba(255,255,255,.9)`),
    make('div', `position:absolute;top:-9px;left:50%;width:6px;height:18px;margin-left:-3px;border-radius:3px;background:${GOLD}`),
  );
  wheel.appendChild(rim);
  const angleAt = (e) => {
    const r = wheel.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
  };
  wheel.addEventListener('pointerdown', (e) => {
    if (wheelPtr !== null) return;
    e.preventDefault();
    wheelPtr = e.pointerId;
    wheel.setPointerCapture?.(e.pointerId);
    lastAngle = angleAt(e);
  });
  wheel.addEventListener('pointermove', (e) => {
    if (e.pointerId !== wheelPtr) return;
    const a = angleAt(e);
    let d = a - lastAngle;
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    lastAngle = a;
    wheelRot = clamp(wheelRot + d, -lockNow(), lockNow());
  });
  const wheelEnd = (e) => { if (e.pointerId === wheelPtr) wheelPtr = null; };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) wheel.addEventListener(ev, wheelEnd);
  document.body.appendChild(wheel);

  // penggeser setir mendatar (mode alternatif lewat pengaturan): lepas = pegas kembali ke tengah
  let steerValue = 0;
  let steerTarget = 0;
  let steerPointer = null;
  const slider = make('div', `${BASE}left:14px;bottom:${SAFE_BOTTOM};display:none;width:min(230px,46vw);height:${KNOB + 10}px;border-radius:${(KNOB + 10) / 2}px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);${NOSEL}`);
  slider.setAttribute('aria-label', 'Setir (geser kiri atau kanan)');
  const knob = make('div', `position:absolute;top:4px;left:50%;width:${KNOB}px;height:${KNOB}px;margin-left:${-KNOB / 2}px;border-radius:50%;background:rgba(255,255,255,.82);box-shadow:0 2px 6px rgba(0,0,0,.35);pointer-events:none`);
  slider.appendChild(knob);
  const reach = () => Math.max(1, slider.clientWidth / 2 - KNOB / 2 - 5);
  const track = (e) => {
    const r = slider.getBoundingClientRect();
    steerTarget = clamp((e.clientX - (r.left + r.width / 2)) / reach(), -1, 1);
    if (Math.abs(steerTarget) < 0.04) steerTarget = 0;
  };
  slider.addEventListener('pointerdown', (e) => { e.preventDefault(); steerPointer = e.pointerId; slider.setPointerCapture?.(e.pointerId); track(e); });
  slider.addEventListener('pointermove', (e) => { if (e.pointerId === steerPointer) track(e); });
  const sliderEnd = (e) => { if (e.pointerId !== steerPointer) return; steerPointer = null; steerTarget = 0; };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) slider.addEventListener(ev, sliderEnd);
  document.body.appendChild(slider);

  // pedal rem (lebar, pendek) dan gas (sempit, tinggi), kanan bawah; ditahan = ditekan
  const pedals = { gas: 0, brake: 0, reverse: 0 };
  const pedalSetters = {};
  const pedalBox = make('div', `${BASE}right:14px;bottom:${SAFE_BOTTOM};display:none;gap:12px;align-items:flex-end;touch-action:none`);
  const pedal = (label, key, w, h) => {
    const b = make('button', `width:${w}px;height:${h}px;border-radius:10px;border:1px solid ${LINE};background:${RIB},${GLASS};background-blend-mode:normal;padding:0;${NOSEL}`);
    b.type = 'button';
    b.setAttribute('aria-label', `Pedal ${label}`);
    const set = (on) => { pedals[key] = on ? 1 : 0; b.style.opacity = on ? '1' : '.72'; b.style.borderColor = on ? GOLD : LINE; };
    pedalSetters[key] = set;
    set(false);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); set(true); });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => set(false));
    return b;
  };
  pedalBox.append(pedal('rem', 'brake', 64, 84), pedal('gas', 'gas', 46, 118));
  document.body.appendChild(pedalBox);

  // pemilih gigi P R N D, di atas pedal
  const gearRow = make('div', `${BASE}right:14px;bottom:calc(${SAFE_BOTTOM} + 128px);display:none;gap:4px`);
  const gearBtns = ['P', 'R', 'N', 'D'].map((g) => {
    const b = make('button', `width:32px;height:32px;border-radius:8px;border:1px solid ${LINE};background:${GLASS};color:${CREAM};font:800 14px system-ui,sans-serif;padding:0;touch-action:manipulation`, g);
    b.type = 'button';
    b.setAttribute('aria-label', `Gigi ${g}`);
    b._bg = GLASS;
    b.addEventListener('click', () => emit('gear', g));
    gearRow.appendChild(b);
    return [g, b];
  });
  document.body.appendChild(gearRow);

  // tombol mesin (tengah bawah): Nyalakan di kabin, Matikan saat berhenti, tersembunyi saat melaju
  const engineBtn = make('button', `${BASE}left:50%;transform:translateX(-50%);bottom:${SAFE_BOTTOM};display:none;min-width:110px;height:48px;padding:0 18px;border-radius:24px;border:1px solid ${LINE};background:${GLASS};color:${CREAM};font:800 14px system-ui,sans-serif;touch-action:manipulation`);
  engineBtn.type = 'button';
  engineBtn._bg = GLASS;
  engineBtn.addEventListener('click', () => emit('engine'));
  document.body.appendChild(engineBtn);

  // panel fitur (⋯): lampu, hazard, rem tangan, AC, sabuk, sein, pintu, atap, dan pengaturan
  const panelBtn = make('button', `${BASE}left:14px;top:calc(${SAFE_TOP} + 40px);display:none;width:40px;height:40px;border-radius:50%;border:1px solid ${LINE};background:${GLASS};color:${CREAM};font:800 20px/1 system-ui,sans-serif;padding:0;touch-action:manipulation`, '\u22ef');
  panelBtn.type = 'button';
  panelBtn.setAttribute('aria-label', 'Fitur kendaraan');
  panelBtn.addEventListener('click', () => { panelOpen = !panelOpen; paint(); });
  document.body.appendChild(panelBtn);
  const panel = make('div', `${BASE}left:14px;top:calc(${SAFE_TOP} + 88px);display:none;width:min(250px,62vw);max-height:calc(100vh - 230px);overflow:auto;padding:8px;border-radius:12px;background:rgba(20,17,13,.72);grid-template-columns:1fr 1fr;gap:6px;touch-action:pan-y`);
  const tile = (label, onClick) => {
    const b = make('button', `font:700 12px system-ui,sans-serif;color:${CREAM};background:${TILE_BG};border:1px solid rgba(255,255,255,.28);border-radius:8px;padding:9px 6px;touch-action:manipulation`, label);
    b.type = 'button';
    b._bg = TILE_BG;
    b.addEventListener('click', onClick);
    panel.appendChild(b);
    return b;
  };
  const stateTiles = [
    ['Lampu', () => emit('lights'), (m) => m.lights],
    ['Hazard', () => emit('hazard'), (m) => m.hazard],
    ['Rem tangan', () => emit('handbrake'), (m) => m.handbrake],
    ['AC', () => emit('ac'), (m) => m.ac],
    ['Sabuk', () => emit('belt'), (m) => m.belt],
    ['Sein \u25c0', () => emit('indicator', -1), (m) => m.indicator === -1],
    ['Sein \u25b6', () => emit('indicator', 1), (m) => m.indicator === 1],
    ['Pintu kiri', () => emit('doorL'), (m) => m.doorL],
    ['Pintu kanan', () => emit('doorR'), (m) => m.doorR],
    ['Atap', () => emit('roof'), (m) => m.roof],
  ].map(([label, run, on]) => ({ btn: tile(label, run), on }));
  const modeTile = tile('', () => { settings.mode = settings.mode === 'wheel' ? 'slider' : 'wheel'; saveSettings(settings); wheelRot = 0; steerValue = 0; steerTarget = 0; paint(); });
  const sensTile = tile('', () => { settings.sens = SENS[(SENS.findIndex((s) => s.id === settings.sens) + 1) % SENS.length].id; saveSettings(settings); paint(); });
  document.body.appendChild(panel);

  // papan ketik (perangkat dengan keyboard)
  const KEYMAP = { i: ['engine'], b: ['handbrake'], l: ['lights'], x: ['hazard'], 1: ['gear', 'P'], 2: ['gear', 'R'], 3: ['gear', 'N'], 4: ['gear', 'D'], ',': ['indicator', -1], '.': ['indicator', 1], k: ['doorL'], ';': ['doorR'], t: ['roof'] };
  const onKey = (e) => {
    if (!shown || !vm || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(input|textarea|select)$/i.test(e.target?.tagName ?? '')) return;
    const a = KEYMAP[e.key.toLowerCase()];
    if (!a) return;
    emit(a[0], a[1]);
    e.preventDefault();
  };
  addEventListener('keydown', onKey);

  const releasePedals = () => { for (const k of ['gas', 'brake']) if (pedals[k]) pedalSetters[k](false); };

  function paint() {
    const now = performance.now();
    const dt = clamp((now - lastT) / 1000, 0, 0.1);
    lastT = now;
    const on = shown && vm !== null;
    const c = on ? vm.controls : null;
    if (!c?.wheel) { wheelRot = 0; wheelPtr = null; steerValue = 0; steerTarget = 0; steerPointer = null; }
    if (!c?.pedals) releasePedals();
    if (wheelPtr === null) {
      wheelRot *= Math.exp(-dt * 9); // lepas: kembali halus ke tengah
      if (Math.abs(wheelRot) < 0.004) wheelRot = 0;
    }
    steerValue += (steerTarget - steerValue) * (steerPointer === null ? 0.35 : 0.6);
    if (Math.abs(steerValue) < 0.005 && steerTarget === 0) steerValue = 0;
    rim.style.transform = `rotate(${wheelRot.toFixed(3)}rad)`;
    knob.style.transform = `translateX(${(steerValue * reach()).toFixed(1)}px)`;

    const steerOn = !!c?.wheel && coarse;
    showEl(badge, shown, 'flex');
    showEl(horn, shown);
    showEl(wheel, steerOn && settings.mode === 'wheel');
    showEl(slider, steerOn && settings.mode === 'slider');
    showEl(pedalBox, !!c?.pedals && coarse, 'flex');
    showEl(gearRow, !!c?.gear, 'flex');
    showEl(engineBtn, !!c?.engine);
    showEl(panelBtn, on && !!c.panel);
    showEl(panel, on && panelOpen, 'grid');
    document.body.classList.toggle('car-moving', on && vm.stage === 'driving');

    const label = on ? vm.gearLabel : gearInfo?.gear;
    showEl(gear, Boolean(label), 'inline');
    if (label) setText(gear, String(label));
    const sig = on ? (vm.hazard ? '\u25c0\u25b6' : vm.indicator < 0 ? '\u25c0' : vm.indicator > 0 ? '\u25b6' : '') : '';
    showEl(signal, Boolean(sig), 'inline');
    setText(signal, sig);
    if (sig) signal.style.visibility = Math.floor(now / 350) % 2 === 0 ? 'visible' : 'hidden';
    showEl(brakeTag, on && vm.handbrake, 'inline');

    if (on) {
      setText(engineBtn, vm.engineLabel);
      lit(engineBtn, vm.stage === 'cabin'); // di kabin tombol mesin menonjol (emas)
    }
    for (const [g, b] of gearBtns) lit(b, on && vm.gear === g);
    for (const t of stateTiles) lit(t.btn, on && Boolean(t.on(vm)));
    setText(modeTile, `Setir: ${settings.mode === 'wheel' ? 'Bulat' : 'Geser'}`);
    setText(sensTile, `Peka: ${(SENS.find((s) => s.id === settings.sens) ?? SENS[1]).label}`);
  }

  return {
    set(kmh, info = null) {
      const visible = kmh !== null;
      if (visible !== shown) {
        shown = visible;
        document.body.classList.toggle('driving', visible); // judul, nama tempat, dan joystick jalan disembunyikan (lihat body.driving di hotel.html)
        if (!visible) {
          vm = null;
          panelOpen = false;
          wheelRot = 0;
          steerValue = 0;
          steerTarget = 0;
          steerPointer = null;
          wheelPtr = null;
          releasePedals();
        }
      }
      gearInfo = visible ? info : null;
      if (visible) setText(speed, String(Math.round(Math.abs(kmh))).padStart(3, '0'));
      paint();
    },
    /** Model tahap kendaraan dari car-state.js (null = penumpang atau tidak mengemudi). */
    view(model) {
      vm = model;
      paint();
    },
    /** car-ride.js memasang penerima perintah HUD: ({ type, value }) => void. */
    bind(fn) {
      handler = typeof fn === 'function' ? fn : () => {};
    },
    /** Keadaan pedal layar { gas, brake, reverse } (0/1). */
    pedals: () => pedals,
    /** Setir -1..1 (kanan = +). 0 bila tidak disentuh. */
    steer: () => (settings.mode === 'wheel' ? clamp(wheelRot / lockNow(), -1, 1) : steerValue),
    dispose: () => {
      removeEventListener('keydown', onKey);
      for (const n of [badge, horn, wheel, slider, pedalBox, gearRow, engineBtn, panelBtn, panel, style]) n.remove();
      document.body.classList.remove('driving', 'car-moving');
    },
  };
}
