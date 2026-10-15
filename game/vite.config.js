import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Halaman: aula (index.html), NIKORA Wedding Villa (villa.html), pembuat tautan pemilik/MC (admin.html),
// Studio Dunia untuk kreator (editor.html), dan dasbor admin (dashboard.html).
const page = (name) => fileURLToPath(new URL(name, import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: page('index.html'), villa: page('villa.html'), admin: page('admin.html'), editor: page('editor.html'),
        dashboard: page('dashboard.html'),
      },
    },
  },
});
