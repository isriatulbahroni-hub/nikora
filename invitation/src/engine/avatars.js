const NS = 'http://www.w3.org/2000/svg';
const SKINS = ['#f3cfa8', '#e6b88a', '#cf9a6e', '#a8704a', '#7a4c32'];
const HAIRS = ['#2a1a14', '#3b2417', '#1c1410', '#4a3020'];

function s(tag, attrs = {}, kids = []) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, String(v));
  for (const kid of kids) e.append(kid);
  return e;
}

/**
 * Tokoh kecil bergaya chibi (kepala besar, mata bulat) dibuat dari bentuk SVG. Dipakai sebagai
 * penghuni dunia di latar adegan: pengantin berdiri di cover, tamu berjalan di adegan lain.
 * role: groom | bride | child | qari | singer | guest
 */
export function createAvatar({ role = 'guest', top = '#1f6b45', accent = '#d9b44a', seed = 0, walking = false } = {}) {
  const skin = SKINS[seed % SKINS.length];
  const hair = HAIRS[(seed >> 1) % HAIRS.length];
  const dress = role === 'bride';
  const body = dress ? '#fffaf0' : top;

  const legs = dress ? [] : [
    s('rect', { class: 'leg l', x: 14, y: 50, width: 5.4, height: 18, rx: 2.4, fill: '#2b2230' }),
    s('rect', { class: 'leg r', x: 20.6, y: 50, width: 5.4, height: 18, rx: 2.4, fill: '#2b2230' }),
  ];
  const torso = dress
    ? s('path', { d: 'M13 30 Q20 26 27 30 L33 66 Q20 70 7 66 Z', fill: body })
    : s('path', { d: 'M12 30 Q20 26 28 30 L30 53 L10 53 Z', fill: body });
  const sash = dress ? s('path', { d: 'M13 40 Q20 44 27 40 L28 44 Q20 48 12 44 Z', fill: accent }) : s('rect', { x: 11, y: 44, width: 18, height: 3.4, fill: accent });
  const arms = [
    s('rect', { class: 'arm l', x: 7.4, y: 31, width: 4.6, height: 17, rx: 2.3, fill: body }),
    s('rect', { class: 'arm r', x: 28, y: 31, width: 4.6, height: 17, rx: 2.3, fill: body }),
    s('circle', { class: 'hand l', cx: 9.7, cy: 48.6, r: 2.5, fill: skin }),
    s('circle', { class: 'hand r', cx: 30.3, cy: 48.6, r: 2.5, fill: skin }),
  ];
  const head = [
    s('circle', { cx: 20, cy: 17, r: 11.4, fill: hair }),
    s('circle', { cx: 20, cy: 19, r: 10, fill: skin }),
    s('path', { d: 'M9.6 17 Q11 6.6 20 6.6 Q29 6.6 30.4 17 Q25 11 20 12.4 Q15 11 9.6 17 Z', fill: hair }),
    s('ellipse', { class: 'eye', cx: 16, cy: 20.6, rx: 1.5, ry: 2, fill: '#1c1218' }),
    s('ellipse', { class: 'eye', cx: 24, cy: 20.6, rx: 1.5, ry: 2, fill: '#1c1218' }),
    s('circle', { cx: 13.4, cy: 24, r: 1.9, fill: '#ff8fa3', opacity: 0.55 }),
    s('circle', { cx: 26.6, cy: 24, r: 1.9, fill: '#ff8fa3', opacity: 0.55 }),
    s('path', { d: 'M18 25.6 Q20 27.4 22 25.6', fill: 'none', stroke: '#8a3b3b', 'stroke-width': 1, 'stroke-linecap': 'round' }),
  ];
  const extra = [];
  if (role === 'groom' || role === 'qari') extra.push(s('path', { d: 'M10.6 11 Q20 3.4 29.4 11 L29.4 13.4 L10.6 13.4 Z', fill: '#1b1620' }), s('rect', { x: 10.6, y: 12.4, width: 18.8, height: 1.8, fill: accent }));
  if (role === 'bride') extra.push(s('path', { d: 'M8 12 Q20 -1 32 12 L34 40 Q20 30 6 40 Z', fill: '#ffffff', opacity: 0.55 }), s('circle', { cx: 20, cy: 7.6, r: 2.2, fill: accent }));
  if (role === 'child') extra.push(s('path', { d: 'M13 9 L20 -4 L27 9 Z', fill: accent }), s('circle', { cx: 20, cy: -4, r: 2, fill: '#fff' }));
  if (role === 'singer') extra.push(s('rect', { x: 29.6, y: 36, width: 2.6, height: 9, rx: 1.3, fill: '#c9c9d4' }), s('circle', { cx: 30.9, cy: 34.6, r: 3, fill: '#6b6b7a' }));

  const svg = s('svg', { class: `av av-${role}${walking ? ' is-walking' : ''}`, viewBox: '-2 -8 44 80', width: 44, height: 80, 'aria-hidden': 'true', focusable: 'false' },
    [s('ellipse', { class: 'av-shadow', cx: 20, cy: 70, rx: 12, ry: 2.6, fill: '#000', opacity: 0.22 }),
      s('g', { class: 'av-body' }, [...legs, torso, sash, ...arms, ...head, ...extra])]);
  return svg;
}

/** Tokoh utama cover menurut jenis acara. */
export function heroRoles(eventType) {
  switch (eventType) {
    case 'pernikahan': return ['groom', 'bride'];
    case 'khitanan': case 'ulang_tahun': return ['child'];
    case 'tazkirah': case 'tarannum': return ['qari'];
    case 'karaoke': return ['singer', 'guest'];
    default: return ['guest', 'guest'];
  }
}
