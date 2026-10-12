// DIHASILKAN oleh scripts/sync-event-themes.mjs dari invitation/src/themes/index.js. Jangan diedit manual.
export const EVENT_THEMES = [
  {
    "id": "pernikahan-adat-sasak",
    "eventType": "pernikahan",
    "label": "Adat Sasak",
    "display": "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif",
    "bg1": "#2b140d",
    "bg2": "#6b2e14",
    "accent": "#b3541e",
    "accent2": "#c9a227",
    "glow": "#ffd27a",
    "ink": "#fbeed4"
  },
  {
    "id": "pernikahan-islami",
    "eventType": "pernikahan",
    "label": "Islami",
    "display": "'Amiri','Palatino Linotype',Georgia,serif",
    "bg1": "#072b2a",
    "bg2": "#0e4a45",
    "accent": "#0f766e",
    "accent2": "#c8a24a",
    "glow": "#f2d98d",
    "ink": "#eaf6f3"
  },
  {
    "id": "pernikahan-taman",
    "eventType": "pernikahan",
    "label": "Taman Bunga",
    "display": "'Playfair Display','Didot','Bodoni 72',Georgia,serif",
    "bg1": "#2e1a47",
    "bg2": "#9c3f5e",
    "accent": "#d46a8a",
    "accent2": "#7aa874",
    "glow": "#ffc2d1",
    "ink": "#fff1f4"
  },
  {
    "id": "pernikahan-kerajaan",
    "eventType": "pernikahan",
    "label": "Kerajaan",
    "display": "'Cinzel','Trajan Pro','Times New Roman',serif",
    "bg1": "#12051f",
    "bg2": "#4a0e2e",
    "accent": "#8b1a2b",
    "accent2": "#d4af37",
    "glow": "#ffe08a",
    "ink": "#f8ecd0"
  },
  {
    "id": "pernikahan-fantasi",
    "eventType": "pernikahan",
    "label": "Dunia Ajaib",
    "display": "'Cormorant Garamond','Garamond',Georgia,serif",
    "bg1": "#0a0f2e",
    "bg2": "#3b2a7a",
    "accent": "#8f7cf5",
    "accent2": "#7de3f0",
    "glow": "#b9a8ff",
    "ink": "#eef0ff"
  },
  {
    "id": "pernikahan-minimalis",
    "eventType": "pernikahan",
    "label": "Minimalis Modern",
    "display": "'Helvetica Neue','Inter','Segoe UI',Arial,sans-serif",
    "bg1": "#f4f1ec",
    "bg2": "#e1dcd2",
    "accent": "#1f1f1f",
    "accent2": "#9a8f7a",
    "glow": "#ffffff",
    "ink": "#2b2b2b"
  },
  {
    "id": "pernikahan-futuristik",
    "eventType": "pernikahan",
    "label": "Futuristik",
    "display": "'Orbitron','Eurostile','Segoe UI',Arial,sans-serif",
    "bg1": "#04060d",
    "bg2": "#0b1d3a",
    "accent": "#22d3ee",
    "accent2": "#a78bfa",
    "glow": "#22d3ee",
    "ink": "#d6ecff"
  },
  {
    "id": "ulang_tahun-pesta",
    "eventType": "ulang_tahun",
    "label": "Pesta Kado",
    "display": "'Trebuchet MS','Segoe UI',Arial,sans-serif",
    "bg1": "#4a1fa8",
    "bg2": "#c2185b",
    "accent": "#ff5c8a",
    "accent2": "#ffc233",
    "glow": "#ffe27a",
    "ink": "#ffffff"
  }
];

const FALLBACK = { id: 'orbit', label: 'ORBIT', display: "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif", bg1: '#1f1626', bg2: '#4a2338', accent: '#7a1f2b', accent2: '#c9a24a', glow: '#ffd98a', ink: '#f7ecd9' };

export function getGateTheme(id, eventType) {
  return EVENT_THEMES.find((t) => t.id === id) ?? EVENT_THEMES.find((t) => t.eventType === eventType) ?? FALLBACK;
}
