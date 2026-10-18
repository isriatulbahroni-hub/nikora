// Aturan permainan Mansion Horor: inventori terbatas, amunisi langka, penyembuh, kunci, dan senjata.
// Murni (tanpa THREE/DOM) supaya bisa diuji penuh. Ditulis orisinal untuk proyek ini.
//
// Prinsip survival horror: slot terbatas, peluru dan penyembuh sedikit, kunci/berkas satu per slot.

export const ITEM_DEFS = Object.freeze({
  ammo: { name: 'Peluru', stack: 24, kind: 'ammo' },
  tonik: { name: 'Tonik Herbal', stack: 3, kind: 'heal', heal: 35 },
  pistol: { name: 'Pistol', stack: 1, kind: 'weapon', magSize: 8 },
});

/** Definisi item. id `kunci:<nama>` dan `berkas:<nama>` dibuat dinamis (satu per slot). */
export function itemDef(id) {
  if (ITEM_DEFS[id]) return ITEM_DEFS[id];
  if (typeof id === 'string' && id.startsWith('kunci:') && id.length > 6) return { name: `Kunci ${id.slice(6)}`, stack: 1, kind: 'key' };
  if (typeof id === 'string' && id.startsWith('berkas:') && id.length > 7) return { name: `Berkas ${id.slice(7)}`, stack: 1, kind: 'file' };
  return null;
}

export function createInventory(slots = 8) {
  return { slots, items: [] }; // items: [{ id, qty }]
}

export const countItem = (inv, id) => inv.items.reduce((n, s) => (s.id === id ? n + s.qty : n), 0);
export const hasItem = (inv, id) => countItem(inv, id) > 0;
export const freeSlots = (inv) => inv.slots - inv.items.length;

/** Tambah `qty` item. Mengisi slot yang sama dulu, lalu slot baru. Mengembalikan { added, left } (left > 0 bila penuh). */
export function addItem(inv, id, qty = 1) {
  const def = itemDef(id);
  if (!def || !Number.isInteger(qty) || qty <= 0) return { added: 0, left: Math.max(0, qty | 0) };
  let left = qty;
  for (const s of inv.items) {
    if (left === 0) break;
    if (s.id !== id || s.qty >= def.stack) continue;
    const put = Math.min(left, def.stack - s.qty);
    s.qty += put;
    left -= put;
  }
  while (left > 0 && inv.items.length < inv.slots) {
    const put = Math.min(left, def.stack);
    inv.items.push({ id, qty: put });
    left -= put;
  }
  return { added: qty - left, left };
}

/** Kurangi `qty` item; semua-atau-tidak-sama-sekali. Mengembalikan true bila berhasil. */
export function removeItem(inv, id, qty = 1) {
  if (!Number.isInteger(qty) || qty <= 0 || countItem(inv, id) < qty) return false;
  let need = qty;
  for (let i = inv.items.length - 1; i >= 0 && need > 0; i--) {
    const s = inv.items[i];
    if (s.id !== id) continue;
    const take = Math.min(need, s.qty);
    s.qty -= take;
    need -= take;
    if (s.qty === 0) inv.items.splice(i, 1);
  }
  return true;
}

export function createPlayer({ hp = 100, maxHp = 100 } = {}) {
  return { hp, maxHp, dead: false };
}

export function damagePlayer(player, dmg) {
  if (player.dead || dmg <= 0) return { dead: player.dead };
  player.hp = Math.max(0, player.hp - dmg);
  if (player.hp === 0) player.dead = true;
  return { dead: player.dead };
}

/** Pakai item penyembuh dari inventori. Tidak terpakai bila nyawa sudah penuh atau pemain mati. */
export function useHeal(inv, player, id = 'tonik') {
  const def = itemDef(id);
  if (!def || def.kind !== 'heal' || player.dead) return { ok: false, healed: 0 };
  if (player.hp >= player.maxHp || !hasItem(inv, id)) return { ok: false, healed: 0 };
  removeItem(inv, id, 1);
  const before = player.hp;
  player.hp = Math.min(player.maxHp, player.hp + def.heal);
  return { ok: true, healed: player.hp - before };
}

export function createWeapon(magSize = ITEM_DEFS.pistol.magSize) {
  return { magSize, mag: magSize, cooldown: 0 };
}

export const FIRE_COOLDOWN = 0.45;
export const GUNSHOT_NOISE = 18; // meter: sejauh itu zombie mendengar tembakan

/** Tembak. Mengembalikan { fired, empty?, noise }. */
export function fireWeapon(weapon) {
  if (weapon.cooldown > 0) return { fired: false, noise: 0 };
  if (weapon.mag <= 0) return { fired: false, empty: true, noise: 2 }; // klik kosong terdengar pelan
  weapon.mag -= 1;
  weapon.cooldown = FIRE_COOLDOWN;
  return { fired: true, noise: GUNSHOT_NOISE };
}

export function tickWeapon(weapon, dt) {
  weapon.cooldown = Math.max(0, weapon.cooldown - dt);
}

/** Isi magasin dari peluru di inventori. Mengembalikan jumlah peluru yang dimasukkan. */
export function reloadWeapon(weapon, inv) {
  const need = weapon.magSize - weapon.mag;
  const take = Math.min(need, countItem(inv, 'ammo'));
  if (take <= 0) return 0;
  removeItem(inv, 'ammo', take);
  weapon.mag += take;
  return take;
}
