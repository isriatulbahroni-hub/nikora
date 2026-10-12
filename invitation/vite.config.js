import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Dua halaman: undangan untuk tamu (index.html) dan Studio untuk pembuat undangan (studio.html).
const page = (name) => fileURLToPath(new URL(name, import.meta.url));

export default defineConfig({
  build: { rollupOptions: { input: { main: page('index.html'), studio: page('studio.html') } } },
});
