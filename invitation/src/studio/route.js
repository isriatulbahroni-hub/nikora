import { SLUG } from './api.js';

export const PAGES = ['dashboard', 'tamu', 'editor', 'template', 'undangan', 'buat', 'pengaturan', 'bantuan'];

/** "#/editor/rani-dimas" -> { page: 'editor', slug: 'rani-dimas' }. Alamat tak dikenal kembali ke dashboard. */
export function parseRoute(hash) {
  const parts = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
  const page = PAGES.includes(parts[0]) ? parts[0] : 'dashboard';
  let slug = null;
  try { slug = parts[1] ? decodeURIComponent(parts[1]).toLowerCase() : null; } catch { slug = null; }
  if (slug && !SLUG.test(slug)) slug = null;
  return { page, slug };
}
