import { loadEventInfo, parseEventParams } from './event-context.js';
import { getGateTheme } from './event-themes.js';
import { venueLabel } from './venues.js';

const lum = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** Warna teks (di antara dua pilihan) yang paling terbaca di atas latar bg. */
export const readableOn = (bg, c1, c2) => (contrast(bg, c1) >= contrast(bg, c2) ? c1 : c2);

/** Gerbang hanya muncul untuk tamu yang datang dari undangan (?e=slug); ?nogate=1 melewatinya (uji/pratinjau). */
export const shouldShowGate = (search = '') => parseEventParams(search).slug !== null && !new URLSearchParams(search).has('nogate');

export function formatEventDate(iso, tz) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', ...(tz ? { timeZone: tz } : {}) }).format(new Date(iso));
  } catch {
    return '';
  }
}

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text; // selalu textContent, tidak pernah innerHTML
  return n;
};

/**
 * Gerbang menuju dunia: memakai palet dan huruf tema undangan yang sama, lalu pintunya terbuka saat tamu menekan Masuk.
 * Dunia di belakangnya tetap memuat; `passed` selesai setelah pintu terbuka (dipakai untuk menunda sambungan multiplayer).
 */
export function mountGate({ world, search, supabase, doc = document, reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false }) {
  const { slug, to } = parseEventParams(search);
  const root = el('div', 'gate');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Gerbang acara');
  const kicker = el('p', 'gate-kicker', 'Anda diundang');
  const title = el('h1', 'gate-title', 'Memuat undangan…');
  const meta = el('p', 'gate-meta', venueLabel(world));
  const hello = el('p', 'gate-hello', to ? `Selamat datang, ${to}` : 'Selamat datang');
  const enter = el('button', 'gate-enter', 'Masuk');
  enter.type = 'button';
  const note = el('p', 'gate-note', 'Anda akan masuk sebagai avatar. Mikrofon hanya menyala jika Anda menekan tombolnya.');
  const card = el('div', 'gate-card');
  card.append(kicker, title, meta, hello, enter, note);
  root.append(el('div', 'gate-door left'), el('div', 'gate-door right'), card);

  const apply = (theme) => {
    const s = root.style;
    s.setProperty('--bg1', theme.bg1);
    s.setProperty('--bg2', theme.bg2);
    s.setProperty('--accent2', theme.accent2);
    s.setProperty('--glow', theme.glow);
    s.setProperty('--ink', theme.ink);
    s.setProperty('--display', theme.display);
    s.setProperty('--on-accent', readableOn(theme.accent2, theme.bg1, theme.ink));
  };
  apply(getGateTheme(null, null));
  doc.body.append(root);
  enter.focus({ preventScroll: true });

  const info = loadEventInfo(slug, supabase).then((data) => {
    if (data) {
      apply(getGateTheme(data.theme, data.eventType));
      title.textContent = data.title || 'Undangan';
      kicker.textContent = data.eventType === 'pernikahan' ? 'Anda diundang ke pernikahan' : 'Anda diundang ke acara';
      const date = formatEventDate(data.date, data.tz);
      meta.textContent = [date, venueLabel(world)].filter(Boolean).join(' · ');
      doc.title = `${data.title} · ORBIT`;
    } else {
      title.textContent = 'Undangan';
    }
    return data;
  });

  const passed = new Promise((resolve) => {
    enter.addEventListener('click', () => {
      enter.disabled = true;
      root.classList.add('open');
      setTimeout(() => { root.remove(); resolve(); }, reduced ? 0 : 1100);
    }, { once: true });
  });
  return { root, passed, info };
}
