// Salin palet tema undangan ke game/src/event-themes.js supaya gerbang di dunia memakai warna dan huruf yang SAMA
// dengan undangan. Jalankan ulang setiap tema di invitation/src/themes/index.js berubah:
//   node game/scripts/sync-event-themes.mjs
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { THEMES } from '../../invitation/src/themes/index.js';

const pick = (t) => ({
  id: t.id,
  eventType: t.eventType,
  label: t.label,
  display: t.fonts.display,
  bg1: t.tokens.bg1,
  bg2: t.tokens.bg2,
  accent: t.tokens.accent,
  accent2: t.tokens.accent2,
  glow: t.tokens.glow,
  ink: t.tokens.stageInk,
});

const body = `// DIHASILKAN oleh scripts/sync-event-themes.mjs dari invitation/src/themes/index.js. Jangan diedit manual.
export const EVENT_THEMES = ${JSON.stringify(THEMES.map(pick), null, 2)};

const FALLBACK = { id: 'orbit', label: 'ORBIT', display: "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif", bg1: '#1f1626', bg2: '#4a2338', accent: '#7a1f2b', accent2: '#c9a24a', glow: '#ffd98a', ink: '#f7ecd9' };

export function getGateTheme(id, eventType) {
  return EVENT_THEMES.find((t) => t.id === id) ?? EVENT_THEMES.find((t) => t.eventType === eventType) ?? FALLBACK;
}
`;
writeFileSync(fileURLToPath(new URL('../src/event-themes.js', import.meta.url)), body);
console.log('event-themes.js ditulis:', THEMES.length, 'tema');
