import { h } from '../engine/dom.js';
import { mountEnvelope as mountEnvelope2D } from './envelope.js';
import { designFor } from '../world3d/designs.js';

/** WebGL2 tersedia? Konteks percobaan langsung dilepas agar tidak memakai jatah konteks peramban. */
export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return false;
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Pilih desain 3D untuk adegan ini, atau null bila harus memakai amplop 2D:
 * perangkat lemah (env.light), gerak minimal (env.reduced), ?env3d=0, tema tanpa padanan 3D, atau tanpa WebGL2.
 */
export function pick3D(ctx, { search = (typeof location !== 'undefined' ? location.search : ''), probe = webglAvailable } = {}) {
  const env = ctx.env || {};
  const q = new URLSearchParams(search).get('env3d');
  if (q === '0' || env.light || env.reduced) return null;
  const design = designFor(ctx.view, q || undefined);
  if (!design || !probe()) return null;
  return design;
}

/**
 * Adegan 01 - amplop. 3D interaktif bila perangkat mampu, jika tidak amplop 2D yang sudah ada.
 * Modul 3D (Three.js) dimuat hanya saat dibutuhkan; kegagalan memuat/membuat konteks jatuh ke 2D.
 */
export function mountEnvelopeAuto(container, ctx, opts) {
  const design = pick3D(ctx, opts);
  if (!design) return mountEnvelope2D(container, ctx);

  let inner = null, destroyed = false, settle;
  const done = new Promise((r) => { settle = r; });
  const t = ctx.view.theme.tokens;
  container.append(h('div', { class: 'env3d-loading', style: { background: `radial-gradient(120% 90% at 50% 28%, ${t.bg2}, ${t.bg1})`, position: 'absolute', inset: '0', display: 'grid', placeItems: 'center', color: t.stageInk, font: '13px/1 system-ui, sans-serif', letterSpacing: '.2em', textTransform: 'uppercase', opacity: '.8' }, role: 'status', text: 'Menyiapkan…' }));

  const fallback = (err) => {
    if (destroyed) return;
    console.warn('Amplop 3D tidak dapat dimuat, memakai 2D:', err);
    container.replaceChildren();
    inner = mountEnvelope2D(container, ctx);
    inner.done.then(settle);
  };
  import('../world3d/runtime3d.js')
    .then((m) => m.mount3D(container, { ...ctx, design }))
    .then((scene) => { if (destroyed) { scene.destroy(); return; } inner = scene; scene.done.then(settle); })
    .catch(fallback);

  return { done, destroy() { destroyed = true; if (inner) inner.destroy(); container.replaceChildren(); } };
}
