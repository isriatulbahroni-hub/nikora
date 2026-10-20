// Permainan MOBA untuk GameHost (kontrak: game-host.js). Modul ini hanya "jendela" ke server MOBA:
// seluruh permainan (5 lawan 5, lawan manusia) berjalan di server MOBA, bukan di halaman villa.
//
// Opsi lewat ctx.services (semuanya opsional):
//   mobaOrigin     alamat https server MOBA (bawaan: MOBA_ORIGIN_DEFAULT)
//   mobaLobbyCode  kode lobi privat 5 huruf bila acara sudah punya lobi
//   mobaMode       'frame' (bawaan, tampil di layar permainan villa) atau 'tab' (tab baru)
//   doc            dokumen untuk uji
//
// Catatan: bila halaman villa dan server MOBA berbeda situs (mis. vercel.app vs roney.biz.id), Safari/iOS
// memblokir cookie pihak ketiga di dalam iframe sehingga login MOBA bisa gagal; pakai mobaMode 'tab',
// atau layani villa dari subdomain situs yang sama dengan MOBA.
//
// Pemasangan (setelah ruangnya ada): GAMES.moba di villa-gamewing.js + satu baris di game-registry.js:
//   moba: () => import('./moba/index.js'),
import { mobaUrl } from './url.js';

export default {
  mount(ctx) {
    const services = ctx.services ?? {};
    const url = mobaUrl(services.mobaOrigin, services.mobaLobbyCode);

    if (services.mobaMode === 'tab') {
      const win = (services.open ?? ((u) => window.open(u, '_blank', 'noopener')))(url);
      if (!win) ctx.notice?.('Izinkan pop-up untuk membuka MOBA di tab baru.');
      queueMicrotask(() => ctx.exit?.({ opened: 'tab' }));
      return { destroy() {} };
    }

    const doc = services.doc ?? document;
    const frame = doc.createElement('iframe');
    frame.title = 'MOBA';
    frame.src = url;
    frame.allow = 'fullscreen; autoplay; clipboard-write';
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups');
    frame.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;background:#05060d';
    ctx.container.appendChild(frame);
    return {
      destroy() {
        frame.src = 'about:blank';
        frame.remove();
      },
    };
  },
};
