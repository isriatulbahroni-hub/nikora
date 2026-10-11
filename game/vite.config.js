import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Dua halaman: arena pertarungan (index.html) dan NIKORA Wedding Villa (villa.html).
const page = (name) => fileURLToPath(new URL(name, import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: { main: page('index.html'), villa: page('villa.html') },
    },
  },
});
