import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Halaman: aula (index.html), NIKORA Wedding Villa (villa.html), Masjid Agung (masjid.html),
// The Royal Wedding · Istana Cinta (royal.html), dasbor (dashboard.html),
// pembuat tautan pemilik/MC (admin.html), dan Studio Dunia untuk kreator (editor.html).
// Halaman yang tidak terdaftar di sini tidak ikut terbit saat build (404 di Vercel).
const page = (name) => fileURLToPath(new URL(name, import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: page('index.html'),
        villa: page('villa.html'),
        masjid: page('masjid.html'),
        royal: page('royal.html'),
        dashboard: page('dashboard.html'),
        admin: page('admin.html'),
        editor: page('editor.html'),
      },
    },
  },
});
