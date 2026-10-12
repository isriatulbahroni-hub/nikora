import { h, sleep } from './dom.js';
import { KIND_LABELS } from './config.js';
import { enterLabel } from './world-link.js';

/**
 * Mesin adegan. Setiap adegan = fungsi mount(container, ctx) yang mengembalikan
 * { done: Promise, destroy() }. Adegan yang belum dibuat dilewati dan dicatat.
 */
const registry = new Map();
export const registerScene = (kind, mount) => registry.set(kind, mount);

export function createEngine({ root, view, env, onRestart }) {
  let run = 0;
  let current = null;

  async function start() {
    const my = ++run;
    root.replaceChildren();
    const active = view.scenes.filter((s) => s.active !== false);
    const pending = [];
    for (const sc of active) {
      if (!registry.has(sc.kind)) { pending.push(sc.kind); continue; }
      if (my !== run) return;
      const layer = h('div', { class: 'layer' });
      root.append(layer);
      const scene = registry.get(sc.kind)(layer, { view, env, scene: sc });
      current = { scene, layer };
      // Adegan tanpa isi (mis. galeri kosong) menandai diri skipped dan dilewati tanpa transisi.
      if (scene.skipped) { scene.destroy(); layer.remove(); current = null; continue; }
      await scene.done;
      if (my !== run) return;
      layer.classList.add('leaving');
      await sleep(env.reduced ? 0 : 450);
      if (my !== run) return;
      scene.destroy();
      layer.remove();
      current = null;
    }
    if (my === run) showEnd(pending);
  }

  function showEnd(pending) {
    const t = view.theme.tokens;
    root.append(
      h('div', { class: 'layer end-card', style: { '--bg1': t.bg1, '--bg2': t.bg2, '--stage-ink': t.stageInk, '--font-display': view.theme.fonts.display, '--font-body': view.theme.fonts.body, '--glow': t.glow } },
        h('div', { class: 'end-inner' },
          h('h2', { text: view.title }),
          h('p', { text: view.worldUrl ? 'Mari bertemu langsung, berjalan dan berbincang bersama tamu lain.' : 'Babak berikutnya sedang disiapkan.' }),
          !view.worldUrl && pending.length ? h('p', { class: 'end-list', text: pending.map((k) => KIND_LABELS[k] || k).join(' · ') }) : null,
          view.worldUrl ? h('a', { class: 'cta', href: view.worldUrl, text: enterLabel(view.eventType) }) : null,
          h('button', { class: view.worldUrl ? 'cta cta-ghost' : 'cta', type: 'button', text: 'Ulangi dari amplop', onclick: () => (onRestart ? onRestart() : start()) }),
        )),
    );
  }

  function stop() {
    run++;
    if (current) { current.scene.destroy(); current = null; }
    root.replaceChildren();
  }

  return { start, stop };
}
