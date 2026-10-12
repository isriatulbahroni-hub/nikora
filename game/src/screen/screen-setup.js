import { createScreenMesh } from './screen-mesh.js';
import { createScreenController } from './screen-controller.js';
import { mountScreenUI } from './screen-ui.js';
import { createScreenCss3d } from './screen-css3d.js';

const safeStorage = () => {
  try { return window.localStorage; } catch { return undefined; }
};

/**
 * Satu pintu untuk aula dan villa: buat layar 3D di `spec`, lalu `attach(session)` setelah tersambung
 * (memasang pengendali + tombol 🎬) dan `tick(ms)` dari loop render.
 */
export function createScreen({ scene, spec, renderer = null, host = null }) {
  const mesh = createScreenMesh(spec);
  mesh.showIdle({ title: 'LAYAR ACARA', sub: 'Belum ada yang memutar' });
  scene.add(mesh.group);
  // Video embed ditempel di layar 3D lewat lapisan CSS3D (butuh kanvas transparan: renderer dibuat dengan alpha:true).
  let css3d = null;
  try {
    if (renderer && host) {
      css3d = createScreenCss3d({ host, group: mesh.group, width: spec.width, height: spec.height });
      const canvas = renderer.domElement;
      if (getComputedStyle(canvas).position === 'static') canvas.style.position = 'relative';
      canvas.style.zIndex = '1'; // kanvas di atas lapisan CSS3D; bidang layar berlubang sehingga video terlihat
    }
  } catch (error) {
    console.warn('[screen] CSS3D tidak tersedia, memakai panel cadangan:', error);
    css3d = null;
  }
  let ctl = null;
  let ui = null;
  let last = -1;
  return {
    mesh,
    get controller() { return ctl; },
    attach(session) {
      if (!session || typeof session.net.sendScreen !== 'function' || ctl) return;
      const net = session.net;
      ctl = createScreenController({ net, mesh, storage: safeStorage(), nameOf: (id) => net.players.find((p) => p.id === id)?.name ?? 'Tamu', onChange: () => ui?.render(), embedHost: css3d ? { container: css3d.container, setActive: (on) => css3d.setActive(on) } : null });
      ui = mountScreenUI({ ctl, net });
    },
    /** Panggil setelah renderer.render(scene, camera). */
    render(sceneRef, camera) {
      css3d?.render(sceneRef, camera);
    },
    resize(w, h) {
      css3d?.resize(w, h);
    },
    tick(ms) {
      if (!ctl || ms - last < 500) return;
      last = ms;
      ctl.tick();
    },
  };
}
