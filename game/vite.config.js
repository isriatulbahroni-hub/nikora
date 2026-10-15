import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Halaman: aula (index.html), NIKORA Wedding Villa (villa.html), pembuat tautan pemilik/MC (admin.html),
// Studio Dunia untuk kreator (editor.html), dan dasbor admin (dashboard.html).
const page = (name) => fileURLToPath(new URL(name, import.meta.url));

const config = defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: page('index.html'), villa: page('villa.html'), admin: page('admin.html'), editor: page('editor.html'),
        dashboard: page('dashboard.html'),
      },
    },
  },
});
// The Royal Wedding · Istana Cinta (royal.html): ditambahkan terpisah agar tidak bentrok dengan daftar halaman di atas.
config.build.rollupOptions.input.royal = page('royal.html');
export default config;
