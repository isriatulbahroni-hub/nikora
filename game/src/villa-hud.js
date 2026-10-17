// Menu ≡ di vila, sama seperti di aula: tombol yang jarang dipakai (Kamera video 📷, Layar 🎬, Panggung MC 🎤)
// ditaruh di lembar bawah supaya HUD tetap rapi. Tombol-tombol itu dipasang oleh modul lain ke #menu-grid
// (video-call.js dan screen-ui.js otomatis memakai #menu-grid bila ada).
export function mountVillaMenu(doc = document) {
  const button = doc.getElementById('menu-button');
  const sheet = doc.getElementById('menu-sheet');
  const grid = doc.getElementById('menu-grid');
  const close = doc.getElementById('menu-close');
  if (!button || !sheet) return null;
  const setOpen = (on) => {
    sheet.hidden = !on;
    button.setAttribute('aria-expanded', String(on));
  };
  button.addEventListener('click', () => setOpen(sheet.hidden));
  close?.addEventListener('click', () => setOpen(false));
  // mengetuk ubin menutup lembar, supaya panel yang baru dibuka (layar, panggung) tidak tertutup lembar
  grid?.addEventListener('click', (e) => {
    if (e.target.closest?.('.sheet-tile')) setOpen(false);
  });
  doc.addEventListener('pointerdown', (e) => {
    if (!sheet.hidden && !sheet.contains(e.target) && !button.contains(e.target)) setOpen(false);
  });
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });
  return { setOpen, isOpen: () => !sheet.hidden };
}

if (typeof document !== 'undefined' && document.getElementById('menu-sheet')) mountVillaMenu();
