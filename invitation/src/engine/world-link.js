/** Penghubung undangan -> dunia 3D. Link dunia membawa slug acara (ruang bersama) dan nama tamu. */
/** Tempat acara 3D yang bisa dipilih pemilik undangan. Menambah tempat baru = satu entri di WORLDS, WORLD_LABELS, dan WORLD_PAGES
 *  (serta satu entri di game/src/venues.js dan satu halaman dunia di game/). */
export const WORLDS = ['villa', 'royal', 'hall'];
export const WORLD_LABELS = Object.freeze({
  villa: 'Villa (pernikahan)',
  royal: 'The Royal Wedding · Istana Cinta',
  hall: 'Aula',
});
const WORLD_PAGES = Object.freeze({ villa: 'villa.html', royal: 'royal.html', hall: '' });
/** Halaman dunia untuk tempat tertentu; tempat tidak dikenal jatuh ke villa (perilaku lama). */
export const worldPage = (world) => WORLD_PAGES[world] ?? WORLD_PAGES.villa;
export const DEFAULT_WORLD_URL = 'https://nikora-ten.vercel.app';

/** Pernikahan -> villa; acara lain -> aula. Pemilik undangan bisa menimpa lewat extra.world. */
export function defaultWorld(eventType) {
  return eventType === 'pernikahan' ? 'villa' : 'hall';
}

/** Tempat acara sebuah undangan (baris dari Supabase): pilihan pemilik di extra.world, bila tidak ada ikut jenis acara. Tanpa info = undefined. */
export function worldOfRow(row) {
  if (!row) return undefined;
  if (row.extra && WORLDS.includes(row.extra.world)) return row.extra.world;
  return row.event_type ? defaultWorld(row.event_type) : undefined;
}

export function worldUrl(view, { base } = {}) {
  const root = (base || DEFAULT_WORLD_URL).replace(/\/+$/, '');
  const url = new URL(`${root}/${worldPage(view.world)}`);
  // Mode demo (slug "demo") tidak punya ruang khusus: masuk ke ruang umum.
  if (view.slug && view.slug !== 'demo') url.searchParams.set('e', view.slug);
  if (view.recipient) url.searchParams.set('to', view.recipient);
  return url.toString();
}

export const enterLabel = (eventType) =>
  eventType === 'pernikahan' ? 'Masuk ke dunia pernikahan' : 'Masuk ke dunia acara';
