import { createScreenMesh } from './screen-mesh.js';
import { createScreenController } from './screen-controller.js';
import { mountScreenUI } from './screen-ui.js';

const safeStorage = () => {
  try { return window.localStorage; } catch { return undefined; }
};

/**
 * Satu pintu untuk aula dan villa: buat layar 3D di `spec`, lalu `attach(session)` setelah tersambung
 * (memasang pengendali + tombol 🎬) dan `tick(ms)` dari loop render.
 */
export function createScreen({ scene, spec }) {
  const mesh = createScreenMesh(spec);
  mesh.showIdle({ title: 'LAYAR ACARA', sub: 'Belum ada yang memutar' });
  scene.add(mesh.group);
  let ctl = null;
  let ui = null;
  let last = -1;
  return {
    mesh,
    get controller() { return ctl; },
    attach(session) {
      if (!session || typeof session.net.sendScreen !== 'function' || ctl) return;
      const net = session.net;
      ctl = createScreenController({ net, mesh, storage: safeStorage(), nameOf: (id) => net.players.find((p) => p.id === id)?.name ?? 'Tamu', onChange: () => ui?.render() });
      ui = mountScreenUI({ ctl, net });
    },
    tick(ms) {
      if (!ctl || ms - last < 500) return;
      last = ms;
      ctl.tick();
    },
  };
}
