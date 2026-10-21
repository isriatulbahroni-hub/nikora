// Tombol dan kartu untuk kunci kamar villa: Check-in / Kunci / Buka kunci / Check-out / Ketuk pintu,
// plus kartu "seseorang mengetuk" untuk pemilik kamar. Dibangun lewat DOM supaya tidak mengubah villa.html.
const CSS = `
#door-ui{position:fixed;z-index:8;left:50%;transform:translateX(-50%);top:calc(max(10px,env(safe-area-inset-top)) + 96px);display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;width:max-content;max-width:calc(100vw - 24px)}
#door-ui>*{pointer-events:auto}
.door-panel,.door-card{display:flex;flex-direction:column;align-items:center;gap:8px;padding:10px 14px;border-radius:16px;background:rgba(20,32,26,.9);border:1px solid rgba(255,255,255,.2);color:#fff;font:600 13px ui-sans-serif,sans-serif;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,.35)}
.door-panel[hidden]{display:none}
.door-row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.door-btn{border:0;border-radius:12px;padding:9px 14px;font:700 13px ui-sans-serif,sans-serif;background:#e8c46e;color:#2d210a;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.door-btn.ghost{background:rgba(255,255,255,.16);color:#fff}
.door-btn[disabled]{opacity:.45;cursor:default}
`;

export function mountRoomDoorsUi({ doors, doc = document }) {
  if (!doc.getElementById('door-ui-style')) {
    const style = doc.createElement('style');
    style.id = 'door-ui-style';
    style.textContent = CSS;
    doc.head.appendChild(style);
  }
  const root = doc.createElement('div');
  root.id = 'door-ui';
  doc.body.appendChild(root);
  const panel = doc.createElement('div');
  panel.className = 'door-panel';
  panel.hidden = true;
  const stack = doc.createElement('div');
  stack.style.cssText = 'display:flex;flex-direction:column;gap:8px;align-items:center';
  root.append(panel, stack);

  let lastMe = null;
  let lastKey = '';
  const knocks = [];

  const button = (label, act, { ghost = false, disabled = false } = {}) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = ghost ? 'door-btn ghost' : 'door-btn';
    b.textContent = label;
    b.dataset.act = act;
    b.disabled = disabled;
    return b;
  };

  function draw(model) {
    panel.replaceChildren();
    if (!model) {
      panel.hidden = true;
      return;
    }
    const title = doc.createElement('div');
    const row = doc.createElement('div');
    row.className = 'door-row';
    if (model.kind === 'free') {
      title.textContent = `${model.s.name} · kosong`;
      row.append(button(model.card ? '🔑 Check-in (butuh kartu)' : '🔑 Check-in', 'checkin'));
    } else if (model.kind === 'own') {
      title.textContent = `${model.s.name} · kamarmu (${model.s.locked ? 'terkunci' : 'terbuka'})${model.sleeping ? ' · tidur' : ''}`;
      row.append(
        button(model.s.locked ? '🔓 Buka kunci' : '🔒 Kunci', model.s.locked ? 'unlock' : 'lock', { disabled: model.s.locked && model.sleeping }),
        button('Check-out', 'checkout', { ghost: true }),
      );
    } else {
      title.textContent = `${model.s.name} · terkunci`;
      row.append(button('✋ Ketuk pintu', 'knock'));
    }
    panel.append(title, row);
    panel.hidden = false;
  }

  /** Minta kode kartu check-in dari admin (dikirim pemilik acara). Server memeriksanya saat masuk ulang. */
  function askCard() {
    const win = doc.defaultView;
    const code = win && typeof win.prompt === 'function' ? win.prompt('Masukkan kode kartu check-in dari admin.\nContoh: A1B2-C3D4-E5F6') : null;
    if (code && typeof doors.applyCard === 'function') doors.applyCard(code);
  }

  panel.addEventListener('click', (e) => {
    const act = e.target?.dataset?.act;
    if (!act || !lastMe) return;
    if (act === 'checkin') {
      const r = doors.checkIn(lastMe);
      if (r && r.reason === 'need-card') askCard();
    } else if (act === 'checkout') doors.checkOut();
    else if (act === 'lock') doors.setLocked(true);
    else if (act === 'unlock') doors.setLocked(false);
    else if (act === 'knock') doors.knock(lastMe);
    lastKey = ''; // gambar ulang pada update berikutnya
  });

  /** Dipanggil tiap frame dengan posisi pemain; hanya menyentuh DOM bila tampilannya berubah. */
  function update(me, sleeping = false) {
    lastMe = me;
    const own = doors.ownRoom();
    const near = doors.nearDoor(me);
    let model = null;
    if (own && (doors.insideOwn(me) || near?.room === own)) {
      model = { kind: 'own', s: own, sleeping };
    } else if (near) {
      const s = near.room;
      const st = doors.status(s);
      if (!s.owner && !own) model = { kind: 'free', s, card: typeof doors.needsCard === 'function' && doors.needsCard() === true };
      else if (s.owner && !st.mine && s.locked && !st.canEnter) model = { kind: 'locked', s };
    }
    const key = model ? `${model.kind}|${model.s.id}|${model.s.locked}|${model.sleeping ? 1 : 0}|${model.card ? 1 : 0}` : '';
    if (key !== lastKey) {
      lastKey = key;
      draw(model);
    }
  }

  function remove(k) {
    clearTimeout(k.timer);
    const i = knocks.indexOf(k);
    if (i >= 0) knocks.splice(i, 1);
    renderKnocks();
  }

  function renderKnocks() {
    stack.replaceChildren();
    for (const k of knocks) {
      const card = doc.createElement('div');
      card.className = 'door-card';
      const text = doc.createElement('div');
      text.textContent = `${k.name} mengetuk pintu ${k.roomName || 'kamarmu'}`;
      const row = doc.createElement('div');
      row.className = 'door-row';
      const yes = button('Izinkan masuk', 'yes');
      const no = button('Tolak', 'no', { ghost: true });
      yes.addEventListener('click', () => {
        doors.reply(k.from, true);
        remove(k);
      });
      no.addEventListener('click', () => {
        doors.reply(k.from, false);
        remove(k);
      });
      row.append(yes, no);
      card.append(text, row);
      stack.append(card);
    }
  }

  function addKnock(req) {
    if (knocks.some((k) => k.from === req.from && k.room === req.room)) return;
    const k = { ...req, timer: setTimeout(() => remove(k), 20000) };
    knocks.push(k);
    if (knocks.length > 3) remove(knocks[0]);
    renderKnocks();
  }

  return {
    update,
    addKnock,
    dispose() {
      for (const k of [...knocks]) clearTimeout(k.timer);
      root.remove();
    },
  };
}
