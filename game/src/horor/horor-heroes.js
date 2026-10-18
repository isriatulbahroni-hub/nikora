// Daftar hero Mansion Horor yang bisa dipilih pemain (murni, tanpa THREE/DOM supaya mudah diuji).
// Menambah hero: unggah berkas .glb ke game/public/models/horor/. Daftar dibuat otomatis saat dev/build
// (scripts/gen-hero-manifest.mjs) menjadi models/horor/heroes.json; nama tampilan diambil dari nama berkas
// (kirana-merah.glb -> "Kirana Merah"). hero.glb adalah hero bawaan dan selalu tampil pertama.
export const DEFAULT_HERO_ID = 'hero';
export const HERO_DIR = 'models/horor/';
export const HERO_MANIFEST = `${HERO_DIR}heroes.json`;
const CHOICE_KEY = 'orbit-horor-hero';
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const FILE_RE = /^[A-Za-z0-9._-]+\.glb$/i;

/** "kirana-merah" -> "Kirana Merah". */
export function titleFromId(id) {
  return String(id)
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

const defaultList = () => [{ id: DEFAULT_HERO_ID, name: titleFromId(DEFAULT_HERO_ID), file: `${DEFAULT_HERO_ID}.glb` }];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/** Dari daftar nama berkas satu folder -> daftar hero. Berkas selain .glb dan id kembar diabaikan; hero bawaan di depan. */
export function heroesFromFiles(fileNames) {
  const seen = new Set();
  const out = [];
  for (const file of fileNames ?? []) {
    if (typeof file !== 'string' || !FILE_RE.test(file)) continue;
    const id = slug(file.replace(/\.glb$/i, ''));
    if (!ID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: titleFromId(id), file });
  }
  return out.sort((a, b) => (a.id === DEFAULT_HERO_ID ? -1 : b.id === DEFAULT_HERO_ID ? 1 : a.id.localeCompare(b.id)));
}

/** Bersihkan daftar dari JSON (data luar tidak dipercaya). Kosong atau rusak -> hanya hero bawaan. */
export function sanitizeHeroList(raw) {
  const seen = new Set();
  const out = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const { id, name, file } = item;
      if (typeof id !== 'string' || !ID_RE.test(id) || seen.has(id)) continue;
      if (typeof file !== 'string' || !FILE_RE.test(file)) continue;
      seen.add(id);
      out.push({ id, name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 40) : titleFromId(id), file });
    }
  }
  return out.length ? out : defaultList();
}

/** Pilihan yang diminta bila ada di daftar; kalau tidak, hero bawaan; kalau itu pun tidak ada, yang pertama. */
export function resolveHeroId(list, wanted) {
  if (list.some((h) => h.id === wanted)) return wanted;
  if (list.some((h) => h.id === DEFAULT_HERO_ID)) return DEFAULT_HERO_ID;
  return list[0]?.id ?? DEFAULT_HERO_ID;
}

/** Jalur berkas relatif terhadap BASE_URL, siap diberikan ke createHero(). */
export const heroPath = (entry) => `${HERO_DIR}${entry.file}`;

export function loadHeroChoice(storage) {
  try {
    return storage?.getItem(CHOICE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function saveHeroChoice(storage, id) {
  try {
    storage?.setItem(CHOICE_KEY, id);
  } catch {
    /* penyimpanan tidak tersedia */
  }
}

/** Ambil heroes.json; gagal atau rusak tidak boleh menghentikan game, jadi jatuh ke hero bawaan. */
export async function loadHeroList({ fetchFn = globalThis.fetch, base = '/' } = {}) {
  try {
    const res = await fetchFn(`${base}${HERO_MANIFEST}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`heroes ${res.status}`);
    return sanitizeHeroList(await res.json());
  } catch {
    return defaultList();
  }
}
