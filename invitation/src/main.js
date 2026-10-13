import './style.css';
import './scenes.css';
import { h } from './engine/dom.js';
import { createEngine, registerScene } from './engine/scene-engine.js';
import { buildView } from './engine/config.js';
import { loadInvitation } from './engine/data.js';
import { demoInvitation, demoScenes } from './engine/demo.js';
import { THEMES } from './themes/index.js';
import { mountEnvelopeAuto } from './scenes/envelope-auto.js';
import { mountRsvp, mountGuestbook, mountGifts } from './scenes/guest.js';
import { mountSurat } from './scenes/surat.js';
import { mountCover } from './scenes/cover.js';
import { mountKisah } from './scenes/kisah.js';
import { mountDetail } from './scenes/detail.js';
import { mountGaleri } from './scenes/galeri.js';
import { mountPenutup } from './scenes/penutup.js';
import { mountHariAcara } from './scenes/hari.js';
import { mountArsip } from './scenes/arsip.js';
import { acceptPreviewMessage, applyDraft } from './preview-frame.js';
import { worldUrl } from './engine/world-link.js';

registerScene('amplop', mountEnvelopeAuto);   // 3D interaktif bila perangkat mampu, jika tidak 2D
registerScene('surat', mountSurat);
registerScene('cover', mountCover);
registerScene('kisah', mountKisah);
registerScene('detail', mountDetail);
registerScene('galeri', mountGaleri);
registerScene('rsvp', mountRsvp);
registerScene('bukutamu', mountGuestbook);
registerScene('hadiah', mountGifts);
registerScene('hari_acara', mountHariAcara);
registerScene('penutup', mountPenutup);
registerScene('arsip', mountArsip);

const app = document.getElementById('app');
const query = Object.fromEntries(new URLSearchParams(location.search));
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const light = query.ringan === '1' || (navigator.hardwareConcurrency || 4) <= 2 || (navigator.deviceMemory || 4) <= 2;
const env = { light, reduced };
const api = { url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_ANON_KEY };

let engine = null;
/** Tambahkan tautan ke dunia 3D (ruang bersama per undangan) di akhir adegan. */
const withWorld = (view) => ({ ...view, worldUrl: worldUrl(view, { base: import.meta.env.VITE_WORLD_URL }) });

function play(rawView, opts = {}) {
  const view = withWorld(rawView);
  if (engine) engine.stop();
  engine = createEngine({ root: app, view, env, api, onRestart: () => play(view), ...opts });
  engine.start();
}

/** Pratinjau di dalam Studio: terima draf dari halaman induk dan putar ulang dari adegan yang diedit. */
function frameMode(data) {
  const parent = window.parent;
  let scenes = data.scenes;
  let timer = null;
  const tell = (msg) => parent.postMessage(msg, location.origin);
  window.addEventListener('message', (e) => {
    const draft = acceptPreviewMessage(e, { origin: location.origin, parent });
    if (!draft) return;
    scenes = applyDraft(scenes, draft);
    clearTimeout(timer);
    timer = setTimeout(() => {
      play(buildView({ ...data, scenes, query: { to: query.to, tema: query.tema } }), {
        startAt: draft.kind,
        onScene: (s) => tell({ type: 'orbit-preview:scene', kind: s.kind, skipped: s.skipped }),
      });
    }, 250);
  });
  tell({ type: 'orbit-preview:ready' });
}

function fatal(message) {
  document.body.append(h('div', { class: 'fatal', role: 'alert', text: message }));
}

async function boot() {
  if (query.slug) {
    try {
      const data = await loadInvitation(query.slug, {
        url: import.meta.env.VITE_SUPABASE_URL,
        key: import.meta.env.VITE_SUPABASE_ANON_KEY,
      });
      if (query.frame === '1' && window.parent !== window) { frameMode(data); return; }
      // ?tema= hanya berlaku untuk pratinjau editor (?preview=1), tidak untuk tamu.
      play(buildView({ ...data, query: { to: query.to, tema: query.preview ? query.tema : undefined } }));
    } catch (e) {
      fatal(e.message || 'Undangan tidak dapat dibuka.');
    }
    return;
  }

  // Mode demo: tanpa slug, semua tema bisa dicoba.
  const show = (themeId) => {
    const url = new URL(location.href);
    url.searchParams.set('tema', themeId);
    history.replaceState(null, '', url);
    for (const b of switcher.children) b.setAttribute('aria-pressed', String(b.dataset.id === themeId));
    play(buildView({ invitation: demoInvitation(themeId), scenes: demoScenes(themeId), query: { to: query.to || 'Bapak Ahmad dan keluarga' } }));
  };
  const switcher = h('div', { class: 'demo-switcher', role: 'group', 'aria-label': 'Pilih tema contoh' },
    THEMES.map((t) => h('button', { type: 'button', 'data-id': t.id, 'aria-pressed': 'false', text: t.label, onclick: () => show(t.id) })));
  document.body.append(switcher);
  document.body.classList.add('has-switcher');
  show(THEMES.some((t) => t.id === query.tema) ? query.tema : THEMES[0].id);
}

boot();
