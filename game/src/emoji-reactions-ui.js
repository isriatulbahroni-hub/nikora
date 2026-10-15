import * as THREE from 'three';
import { EMOJIS, decodeReaction, encodeReaction } from './emoji-reactions.js';
import { COMBO_MAX_DISTANCE, COMBO_WINDOW_MS, comboFor } from './emoji-sticker-system.js';
import { playCombo, playSticker, unlockAudio } from './emoji-sticker-fx.js';

const LIFETIME_MS = 2400;
const MAX_PER_AVATAR = 3; // reaksi beruntun dibatasi supaya kepala avatar tidak penuh
const BASE_Y = 2.35; // di atas label nama (2,0) dan di bawah gelembung obrolan (2,95)

function makeEmojiSprite(emoji) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.font = '96px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, toneMapped: false });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 11;
  return sprite;
}

function removeSprite(group, sprite) {
  const list = group.userData.emojiSprites;
  const i = list ? list.indexOf(sprite) : -1;
  if (i >= 0) list.splice(i, 1);
  sprite.userData.dead = true;
  sprite.parent?.remove(sprite);
  sprite.material.map?.dispose();
  sprite.material.dispose();
}

/** Munculkan emoji yang melayang naik lalu memudar di atas kepala avatar. Mengembalikan true bila tampil. */
export function showEmojiAbove(group, index) {
  const emoji = EMOJIS[index];
  if (!group || !emoji || typeof requestAnimationFrame !== 'function') return false;
  const sprite = makeEmojiSprite(emoji);
  if (!sprite) return false;
  const list = (group.userData.emojiSprites ??= []);
  while (list.length >= MAX_PER_AVATAR) removeSprite(group, list[0]);
  const dx = (Math.random() - 0.5) * 0.5; // sebar sedikit ke samping agar reaksi beruntun tidak bertumpuk
  const start = performance.now();
  sprite.position.set(dx, BASE_Y, 0);
  sprite.scale.set(0.45, 0.45, 1);
  group.add(sprite);
  list.push(sprite);
  const step = (now) => {
    if (sprite.userData.dead) return;
    const k = (now - start) / LIFETIME_MS;
    if (k >= 1) {
      removeSprite(group, sprite);
      return;
    }
    const pop = Math.min(1, k / 0.15);
    const size = 0.9 * (0.5 + 0.5 * (1 - (1 - pop) ** 3)); // membesar cepat di awal
    sprite.scale.set(size, size, 1);
    sprite.position.set(dx + Math.sin(k * 9) * 0.06, BASE_Y + k * 0.9, 0);
    sprite.material.opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return true;
}

/** Tombol 😊 di baris tombol atas dan panel pilihan emoji. Mengembalikan null bila sudah terpasang atau kerangka halaman tidak ada. */
export function mountEmojiPanel({ onPick, doc = document, host = doc.querySelector('.rbs') }) {
  if (!host || doc.getElementById('emoji-button')) return null;
  const button = doc.createElement('button');
  button.id = 'emoji-button';
  button.className = 'rb';
  button.type = 'button';
  button.textContent = '😊';
  button.title = 'Reaksi emoji';
  button.setAttribute('aria-label', 'Reaksi emoji');
  button.setAttribute('aria-pressed', 'false');
  host.append(button);

  const panel = doc.createElement('div');
  panel.id = 'emoji-panel';
  panel.className = 'panel emoji-panel';
  panel.hidden = true;
  const head = doc.createElement('div');
  head.className = 'panel-head';
  const title = doc.createElement('strong');
  title.textContent = 'Reaksi';
  const close = doc.createElement('button');
  close.type = 'button';
  close.textContent = '✕';
  close.setAttribute('aria-label', 'Tutup');
  head.append(title, close);
  const grid = doc.createElement('div');
  grid.className = 'emoji-grid';
  EMOJIS.forEach((emoji, i) => {
    const cell = doc.createElement('button');
    cell.type = 'button';
    cell.className = 'emoji-cell';
    cell.textContent = emoji;
    cell.setAttribute('aria-label', `Kirim ${emoji}`);
    cell.addEventListener('click', () => {
      onPick(i);
      setOpen(false);
    });
    grid.append(cell);
  });
  panel.append(head, grid);
  doc.body.append(panel);

  function setOpen(on) {
    if (on) {
      const party = doc.getElementById('party-panel');
      if (party) party.hidden = true; // dua panel di sudut yang sama: yang lama ditutup
    }
    panel.hidden = !on;
    button.setAttribute('aria-pressed', String(on));
  }
  button.addEventListener('click', () => setOpen(panel.hidden));
  close.addEventListener('click', () => setOpen(false));
  return { button, panel, setOpen };
}

/**
 * Pasang stiker emoji. Dengan sesi multiplayer: dikirim lewat obrolan dan tampil di semua tamu
 * (termasuk diri sendiri lewat gema lokal). Tanpa sesi (offline): tampil hanya di avatar sendiri.
 * Dua reaksi yang cocok dari dua tamu yang berdekatan dalam 3 detik memicu kombo (hati menyatu, api lawan air).
 */
export function setupEmojiReactions({ session, avatar, doc = document }) {
  const selfId = session?.net.id ?? 'self';
  const avatarOf = (id) => (id === selfId ? avatar : session?.view.getAvatar(id));
  const recent = new Map(); // id pengirim -> { index, at }
  const react = (id, index) => {
    const group = avatarOf(id);
    if (!group) return;
    showEmojiAbove(group, index);
    playSticker(group, index, { listener: avatar });
    const now = performance.now();
    for (const [otherId, prev] of recent) {
      if (now - prev.at > COMBO_WINDOW_MS) {
        recent.delete(otherId);
        continue;
      }
      if (otherId === id) continue;
      const kind = comboFor(prev.index, index);
      const other = kind ? avatarOf(otherId) : null;
      if (other && group.parent && other.position.distanceTo(group.position) <= COMBO_MAX_DISTANCE) {
        playCombo(kind, group.parent, other.position, group.position);
        recent.delete(otherId);
        recent.delete(id);
        return;
      }
    }
    recent.set(id, { index, at: now });
  };
  session?.net.on('chat', (msg) => {
    const index = decodeReaction(msg?.text);
    if (index !== null) react(msg.id, index);
  });
  return mountEmojiPanel({
    doc,
    onPick: (index) => {
      unlockAudio(); // klik pengguna: browser mengizinkan suara
      if (session) session.sendChat(encodeReaction(index));
      else react(selfId, index);
    },
  });
}
