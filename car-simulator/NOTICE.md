# Catatan sumber

Simulator mobil ini berbasis apex-formula (https://github.com/bridge-mind/apex-formula, lisensi MIT, lihat LICENSE).
Diimpor dari https://github.com/isriatulbahroni-hub/apex-formula, commit 52c2d58.

Tambahan multiplayer: server/ (server otoritatif 120 Hz), src/net/ (klien multiplayer + prediksi), multiplayer.html, dan VehiclePhysics.setBodyState.

Menjalankan server: cd server && npm install && cd .. && npx vite build --ssr server/index.ts --outDir server/dist && node server/dist/index.js
Menjalankan klien : npm install && npm run dev, lalu buka /multiplayer.html di dua tab.
