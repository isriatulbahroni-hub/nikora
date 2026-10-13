import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Tiga halaman: arena pertarungan (index.html), NIKORA Wedding Villa (villa.html), dan Studio Dunia (editor.html).
const page = (name) => fileURLToPath(new URL(name, import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: { main: page('index.html'), villa: page('villa.html'), editor: page('editor.html') },
    },
  },
});
