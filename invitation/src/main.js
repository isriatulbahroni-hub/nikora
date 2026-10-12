import './style.css';
import { h } from './engine/dom.js';
import { createEngine, registerScene } from './engine/scene-engine.js';
import { buildView } from './engine/config.js';
import { loadInvitation } from './engine/data.js';
import { demoInvitation } from './engine/demo.js';
import { THEMES } from './themes/index.js';
import { mountEnvelope } from './scenes/envelope.js';
import { worldUrl } from './engine/world-link.js';

registerScene('amplop', mountEnvelope);

const app = document.getElementById('app');
const query = Object.fromEntries(new URLSearchParams(location.search));
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const light = query.ringan === '1' || (navigator.hardwareConcurrency || 4) <= 2 || (navigator.deviceMemory || 4) <= 2;
const env = { light, reduced };

let engine = null;
/** Tambahkan tautan ke dunia 3D (ruang bersama per undangan) di akhir adegan. */
const withWorld = (view) => ({ ...view, worldUrl: worldUrl(view, { base: import.meta.env.VITE_WORLD_URL }) });

function play(rawView) {
  const view = withWorld(rawView);
  if (engine) engine.stop();
  engine = createEngine({ root: app, view, env, onRestart: () => play(view) });
  engine.start();
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
    play(buildView({ invitation: demoInvitation(themeId), query: { to: query.to || 'Bapak Ahmad dan keluarga' } }));
  };
  const switcher = h('div', { class: 'demo-switcher', role: 'group', 'aria-label': 'Pilih tema contoh' },
    THEMES.map((t) => h('button', { type: 'button', 'data-id': t.id, 'aria-pressed': 'false', text: t.label, onclick: () => show(t.id) })));
  document.body.append(switcher);
  show(THEMES.some((t) => t.id === query.tema) ? query.tema : THEMES[0].id);
}

boot();
