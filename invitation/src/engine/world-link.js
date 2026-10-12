/** Penghubung undangan -> dunia 3D. Link dunia membawa slug acara (ruang bersama) dan nama tamu. */
export const WORLDS = ['villa', 'hall'];
export const DEFAULT_WORLD_URL = 'https://nikora-ten.vercel.app';

/** Pernikahan -> villa; acara lain -> aula. Pemilik undangan bisa menimpa lewat extra.world. */
export function defaultWorld(eventType) {
  return eventType === 'pernikahan' ? 'villa' : 'hall';
}

export function worldUrl(view, { base } = {}) {
  const root = (base || DEFAULT_WORLD_URL).replace(/\/+$/, '');
  const url = new URL(view.world === 'hall' ? `${root}/` : `${root}/villa.html`);
  // Mode demo (slug "demo") tidak punya ruang khusus: masuk ke ruang umum.
  if (view.slug && view.slug !== 'demo') url.searchParams.set('e', view.slug);
  if (view.recipient) url.searchParams.set('to', view.recipient);
  return url.toString();
}

export const enterLabel = (eventType) =>
  eventType === 'pernikahan' ? 'Masuk ke dunia pernikahan' : 'Masuk ke dunia acara';
