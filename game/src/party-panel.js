// Panel "Panggung MC": merender state Party (MC, pembicara, angkat tangan) ke elemen DOM.
// Dipisah dari villa-main agar bisa diuji tanpa WebGL.
export function renderPartyPanel({ doc = document, body, party, nameOf, button }) {
  const el = (tag, text, cls) => {
    const node = doc.createElement(tag);
    if (text) node.textContent = text;
    if (cls) node.className = cls;
    return node;
  };
  const btn = (label, onClick, ghost = false) => {
    const b = el('button', label, ghost ? 'party-btn is-ghost' : 'party-btn');
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  };
  const row = (text, action) => {
    const r = el('div', '', 'party-row');
    r.append(el('span', text));
    if (action) r.append(action);
    return r;
  };

  const s = party.state;
  const role = party.role;
  body.replaceChildren();
  button?.setAttribute('aria-pressed', String(role !== 'listener'));
  if (button) button.dataset.count = role === 'host' ? String(s.hands.length) : '0';
  if (!s.host) {
    body.append(row('Belum ada MC. Jadi MC untuk membuka panggung; suaramu akan terdengar di seluruh vila.'), btn('Jadi MC', () => party.claimHost()));
    return;
  }
  body.append(el('h4', 'MC'), row(`${nameOf(s.host)}${role === 'host' ? ' (kamu)' : ''}`));
  if (s.speakers.length) {
    body.append(el('h4', 'Pembicara'));
    for (const id of s.speakers) body.append(row(nameOf(id), role === 'host' ? btn('Turunkan', () => party.revoke(id), true) : null));
  }
  if (role === 'listener') {
    body.append(party.handRaised ? btn('Turunkan tangan', () => party.lowerHand(), true) : btn('Angkat tangan ✋', () => party.raiseHand()));
  } else if (role === 'speaker') {
    body.append(btn('Turun dari panggung', () => party.revoke(), true));
  } else {
    body.append(el('h4', `Angkat tangan (${s.hands.length})`));
    if (!s.hands.length) body.append(row('Belum ada yang mengangkat tangan.'));
    for (const id of s.hands) body.append(row(nameOf(id), btn('Naikkan', () => party.grant(id))));
    body.append(btn('Tutup panggung', () => party.close(), true));
  }
}
