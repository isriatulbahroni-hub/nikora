import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Halaman: aula (index.html), NIKORA Wedding Villa (villa.html), The Royal Wedding · Istana Cinta (royal.html),
// pembuat tautan pemilik/MC (admin.html), dan Studio Dunia untuk kreator (editor.html).
const page = (name) => fileURLToPath(new URL(name, import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: { main: page('index.html'), villa: page('villa.html'), royal: page('royal.html'), admin: page('admin.html'), editor: page('editor.html') },
    },
  },
});
