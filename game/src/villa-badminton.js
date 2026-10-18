// Pengendali bulu tangkis manusia lawan manusia di dunia villa (sisi klien): kok, raket, papan skor, tombol aksi.
// Logika pertandingan ada di activities/ (badminton-duel.js, duel-net.js); modul ini hanya menghubungkannya
// ke tampilan three.js dan data pemain dari multiplayer. Tidak ada bot: lawan selalu pemain sungguhan.
import { createRacketMesh, createShuttleMesh, placeShuttle } from './villa-court.js';
import { createDuelNet } from './activities/duel-net.js';
import { pointMessage, scoreText } from './activities/badminton-hud.js';

const SWING_TIME = 0.35;
const NEAR_MARGIN = 3; // jarak dari tepi lapangan agar tombol Main muncul
const LEAVE_MARGIN = 9; // lebih jauh dari ini = dianggap meninggalkan pertandingan
const HIT_WINDOW = 0.45; // tekan 'Pukul' sedikit lebih awal tetap dihitung
const HIT_RESEND = 0.12;
const HOLD = { x: 0.42, y: 0.95, z: -0.2 }; // titik genggam raket di avatar

export function createVillaBadminton({ scene, court, me, avatar, getSession, toast }) {
  const shuttleMesh = createShuttleMesh();
  shuttleMesh.visible = false;
  scene.add(shuttleMesh);
  const scoreEl = document.createElement('div');
  scoreEl.style.cssText = 'position:fixed;z-index:9;top:calc(max(12px,env(safe-area-inset-top)) + 84px);left:50%;transform:translateX(-50%);padding:6px 14px;border-radius:999px;background:rgba(20,32,26,.72);color:#fff;font:600 13px ui-sans-serif,sans-serif;pointer-events:none;display:none;max-width:92vw;text-align:center;';
  document.body.appendChild(scoreEl);

  const rackets = new Map(); // id -> { mesh, group }
  const swings = new Map(); // id -> detik tersisa
  let duelNet = null;
  let boundRoom = null;
  let boundId = null;
  let pendingHit = 0;
  let pendingAim = 0;
  let sinceResend = 0;
  let seenQ = -1;
  let seenPoint = 0;
  let seenLh = null;
  let seenPhase = null;

  const near = (margin) => me.level === 0 && me.stair === null && court.frame.contains(me, margin);

  const nameOf = (id) => {
    const session = getSession();
    if (!id) return '…';
    if (id === session?.net?.id) return 'Kamu';
    return session?.net?.players?.find((p) => p.id === id)?.name ?? 'Tamu';
  };

  function handleEvent(e) {
    if (e.type === 'closed') toast(e.reason === 'host-left' ? 'Lawan meninggalkan meja. Pertandingan ditutup.' : 'Koneksi ke pertandingan terputus.');
    else if (e.type === 'opponent-left') toast(e.forfeit ? 'Lawan keluar. Kamu menang WO.' : 'Lawan batal bergabung.');
    else if (e.type === 'refused') toast(e.reason === 'penuh' ? 'Meja sudah penuh. Kamu bisa menonton.' : 'Tidak bisa bergabung sekarang.');
  }

  /** Sambungan pertandingan lewat Room LiveKit yang sama dengan posisi/suara. Dibuat ulang bila Room atau id berubah. */
  function ensureNet() {
    const session = getSession();
    const room = session?.net?.room;
    const id = session?.net?.id;
    if (!room || !id) return null;
    if (duelNet && boundRoom === room && boundId === id) return duelNet;
    duelNet?.dispose();
    duelNet = createDuelNet({
      room,
      selfId: id,
      frame: court.frame,
      getPlayerPos: (who) => (who === id ? { x: me.x, z: me.z } : session.net.players.find((p) => p.id === who) ?? null),
      onEvent: handleEvent,
    });
    boundRoom = room;
    boundId = id;
    seenQ = -1;
    return duelNet;
  }

  function label() {
    const net = ensureNet();
    if (!net) return near(NEAR_MARGIN) ? 'Main' : '';
    const snap = net.snap;
    if (net.role === 'none') {
      if (!near(NEAR_MARGIN) || (snap && ((snap.a && snap.b) || snap.ph === 'over'))) return '';
      return snap ? 'Gabung' : 'Main';
    }
    if (!snap) return '';
    if (snap.ph === 'over') return 'Selesai';
    if (snap.ph === 'lobby') return 'Batal';
    if (net.canServe()) return 'Servis';
    return snap.ph === 'rally' ? 'Pukul' : '';
  }

  /** `aim` -1..1 (dorongan joystick ke samping lapangan). Mengembalikan true bila tombol dipakai. */
  function action(aim = 0) {
    const net = ensureNet();
    if (!net) {
      if (!near(NEAR_MARGIN)) return false;
      toast('Bulu tangkis butuh sambungan online. Periksa koneksi lalu muat ulang.');
      return true;
    }
    const snap = net.snap;
    if (net.role === 'none') {
      if (!near(NEAR_MARGIN)) return false;
      const res = net.requestPlay();
      if (!res.ok) toast(res.reason === 'penuh' ? 'Meja sudah penuh. Kamu bisa menonton.' : 'Pertandingan di meja ini sudah selesai.');
      else if (res.host) toast('Menunggu lawan… Ajak temanmu ke lapangan.');
      return true;
    }
    if (!snap || snap.ph === 'over' || snap.ph === 'lobby') {
      net.leave();
      return true;
    }
    if (net.canServe()) {
      if (net.serve({ power: 0.62, aimX: aim * 0.6 }).ok) swings.set(boundId, SWING_TIME);
      return true;
    }
    if (snap.ph === 'rally') {
      pendingHit = HIT_WINDOW;
      pendingAim = aim;
      sinceResend = HIT_RESEND;
      return true;
    }
    return false;
  }

  function racketFor(id, group) {
    let entry = rackets.get(id);
    if (entry && entry.group !== group) {
      entry.group?.remove(entry.mesh);
      entry = null;
    }
    if (!entry) {
      const mesh = createRacketMesh();
      mesh.position.set(HOLD.x, HOLD.y, HOLD.z);
      entry = { mesh, group };
      rackets.set(id, entry);
      group.add(mesh);
    }
    return entry;
  }

  function dropRackets(keep) {
    for (const [id, entry] of rackets) {
      if (keep.has(id)) continue;
      entry.group?.remove(entry.mesh);
      rackets.delete(id);
    }
  }

  function update({ delta, moving, seated }) {
    const session = getSession();
    const net = ensureNet();
    const out = { facing: null };
    if (!net) {
      shuttleMesh.visible = false;
      scoreEl.style.display = 'none';
      dropRackets(new Set());
      return out;
    }
    net.tick(delta);
    const snap = net.snap;
    const side = net.side;
    const playing = net.role !== 'none';

    if (playing && !near(LEAVE_MARGIN)) {
      net.leave();
      toast('Kamu meninggalkan lapangan. Pertandingan dihentikan.');
    }

    // pukulan menunggu: kirim begitu kok dalam jangkauan; lawan-host memutuskan hasilnya
    if (pendingHit > 0) {
      pendingHit -= delta;
      sinceResend += delta;
      if (sinceResend >= HIT_RESEND && net.canHitNow()) {
        sinceResend = 0;
        const r = net.hit({ aim: pendingAim });
        if (r.ok && !r.sent) pendingHit = 0; // tuan rumah: hasil langsung
        if (r.ok) swings.set(boundId, SWING_TIME);
      }
    }

    // peristiwa dari snapshot baru (satu kali per snapshot)
    if (snap && snap.q !== seenQ) {
      seenQ = snap.q;
      if (snap.lp && snap.lp[0] !== seenPoint) {
        seenPoint = snap.lp[0];
        const msg = pointMessage(snap, nameOf);
        if (msg && (playing || near(LEAVE_MARGIN))) toast(msg);
      }
      if (snap.ph === 'over' && seenPhase !== 'over' && (playing || near(LEAVE_MARGIN))) toast(scoreText(snap, nameOf));
      if (snap.ph === 'rally' && snap.lh && snap.lh !== seenLh) {
        const hitter = snap.lh === 'a' ? snap.a : snap.b;
        if (hitter && hitter !== boundId) swings.set(hitter, SWING_TIME); // pukulan sendiri sudah dianimasikan lebih awal
        else if (hitter && !swings.has(hitter)) swings.set(hitter, SWING_TIME);
      }
      seenLh = snap.lh;
      seenPhase = snap.ph;
      if (snap.ph === 'lobby' || snap.ph === 'serve') pendingHit = 0;
    }
    if (!snap) {
      seenPoint = 0;
      seenLh = null;
      seenPhase = null;
    }

    if (playing && snap && !moving && !seated) out.facing = side === 'b' ? Math.PI / 2 : -Math.PI / 2; // menghadap net

    // kok
    const shuttle = snap?.sh ? net.shuttleAt() : null;
    shuttleMesh.visible = shuttle !== null;
    if (shuttle) placeShuttle(shuttleMesh, court.frame, shuttle);

    // raket di tangan kedua pemain; animasi ayun
    const keep = new Set();
    if (snap) {
      for (const id of [snap.a, snap.b]) {
        if (!id) continue;
        const group = id === boundId ? avatar : session.view?.getAvatar?.(id);
        if (!group) continue;
        keep.add(id);
        const { mesh } = racketFor(id, group);
        const left = Math.max(0, (swings.get(id) ?? 0) - delta);
        swings.set(id, left);
        mesh.rotation.x = left > 0 ? -1.7 * Math.sin((1 - left / SWING_TIME) * Math.PI) : 0;
      }
    }
    dropRackets(keep);

    // papan skor untuk pemain dan penonton di dekat lapangan
    if (snap && (playing || near(LEAVE_MARGIN))) {
      const text = scoreText(snap, nameOf);
      if (scoreEl.textContent !== text) scoreEl.textContent = text;
      scoreEl.style.display = 'block';
    } else scoreEl.style.display = 'none';
    return out;
  }

  return {
    label,
    action,
    update,
    state: () => ({ role: duelNet?.role ?? 'none', phase: duelNet?.snap?.ph ?? null, score: duelNet?.snap?.sc ?? null, host: duelNet?.hostId ?? null }),
    dispose() {
      duelNet?.dispose();
      dropRackets(new Set());
      scene.remove(shuttleMesh);
      scoreEl.remove();
    },
  };
}
