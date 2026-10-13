import { SCENE_KINDS } from './engine/config.js';

/**
 * Sisi undangan dari pratinjau langsung di Studio. Halaman undangan yang dibuka di dalam bingkai
 * (?frame=1) hanya menerima draf dari halaman induknya sendiri: asal (origin) harus sama dan pengirim
 * harus window.parent. Draf disaring lagi oleh content.js saat dirender, jadi tidak pernah jadi HTML.
 */
export const MAX_DRAFT = 24000;
export const MSG_DRAFT = 'orbit-preview:draft';

export function acceptPreviewMessage(e, { origin, parent }) {
  if (!e || e.origin !== origin || e.source !== parent) return null;
  const d = e.data;
  if (!d || typeof d !== 'object' || d.type !== MSG_DRAFT) return null;
  if (!SCENE_KINDS.includes(d.kind)) return null;
  let config = null;
  if (d.config !== undefined) {
    if (!d.config || typeof d.config !== 'object' || Array.isArray(d.config)) return null;
    let size;
    try { size = JSON.stringify(d.config).length; } catch { return null; }
    if (size > MAX_DRAFT) return null;
    config = d.config;
  }
  return { kind: d.kind, config, active: d.active !== false };
}

/** Terapkan draf ke daftar adegan; hari_acara dan arsip dipaksa tampil agar bisa dilihat di pratinjau. */
export function applyDraft(scenes, draft) {
  const list = scenes.map((s) => ({ ...s }));
  let sc = list.find((s) => s.kind === draft.kind);
  if (!sc) { sc = { kind: draft.kind, position: 999, active: true, config: {} }; list.push(sc); }
  if (draft.config) sc.config = draft.config;
  sc.active = true;
  if (draft.kind === 'hari_acara' || draft.kind === 'arsip') sc.config = { ...(sc.config || {}), always: true };
  return list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}
