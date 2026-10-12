// Tombol 🎬 + panel kontrol Layar Tancap. Sengaja minimal: tamu hanya melihat volume; operator melihat kontrol putar.
export function mountScreenUI({ ctl, net, doc = document, parent = doc.body }) {
  // Tombol ikut barisan tombol yang sudah ada (aula: .arena-topline, villa: baris .rb) agar tampil menyatu.
  const bar = doc.querySelector('.arena-topline') ?? doc.querySelector('.rb')?.parentElement ?? null;
  const siblingClass = bar?.querySelector('.icon-button') ? 'icon-button' : bar?.querySelector('.rb') ? 'rb' : '';
  const el = (tag, cls, text) => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const btn = (label, onClick, ghost = false) => {
    const b = el('button', ghost ? 'sc-btn is-ghost' : 'sc-btn', label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  };

  const toggle = el('button', siblingClass ? `${siblingClass} sc-toggle-in-bar` : 'sc-toggle', '🎬');
  toggle.type = 'button';
  toggle.setAttribute('aria-label', 'Layar acara');
  toggle.title = 'Layar acara';
  const panel = el('div', 'sc-panel');
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Layar acara');
  if (bar) bar.insertBefore(toggle, bar.querySelector('#party-button') ?? bar.querySelector('#chat-button') ?? null);
  else parent.append(toggle);
  parent.append(panel);
  toggle.addEventListener('click', () => { panel.hidden = !panel.hidden; if (!panel.hidden) render(); });

  const nameOf = (id) => net.players.find((p) => p.id === id)?.name ?? 'Tamu';
  const SRC_LABEL = { youtube: 'YouTube', tiktok: 'TikTok', file: 'Video dari perangkat', live: 'Siaran langsung' };
  const file = el('input');
  file.type = 'file';
  file.accept = 'video/*';
  file.hidden = true;
  file.addEventListener('change', () => { const f = file.files?.[0]; file.value = ''; if (f) ctl.pickFile(f); });

  function volumeRow() {
    const row = el('div', 'sc-row');
    const range = el('input');
    range.type = 'range'; range.min = '0'; range.max = '100'; range.value = String(Math.round(ctl.volume * 100));
    range.setAttribute('aria-label', 'Volume layar');
    range.addEventListener('input', () => ctl.setVolume(Number(range.value) / 100));
    row.append(el('span', '', ctl.muted ? '🔇' : '🔊'), range, btn(ctl.muted ? 'Nyalakan' : 'Bisukan', () => ctl.toggleMute(), true));
    return row;
  }

  function render() {
    const s = ctl.state;
    panel.replaceChildren();
    const head = el('div', 'sc-head');
    head.append(el('strong', '', 'Layar acara'));
    const x = btn('✕', () => { panel.hidden = true; }, true);
    x.setAttribute('aria-label', 'Tutup');
    head.append(x);
    panel.append(head);

    if (s.src) panel.append(el('p', 'sc-now', `${SRC_LABEL[s.src.type] ?? 'Video'}${s.st === 'paused' ? ' · dijeda' : ''}`));
    if (ctl.embedHidden && s.src && (s.src.type === 'youtube' || s.src.type === 'tiktok')) panel.append(btn('Tampilkan video', () => ctl.showEmbedAgain(), true));

    if (!s.op) {
      panel.append(el('p', 'sc-hint', 'Belum ada operator. Operator bisa memutar video YouTube/TikTok, video dari HP, atau siaran langsung untuk semua tamu.'), btn('Jadi operator layar', () => ctl.claim()));
    } else if (!ctl.isOperator) {
      panel.append(el('p', 'sc-hint', `${nameOf(s.op)} sedang mengatur layar.`));
    } else {
      const input = el('input', 'sc-input');
      input.type = 'url'; input.placeholder = 'Tempel link YouTube / TikTok'; input.setAttribute('aria-label', 'Link video');
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { ctl.loadLink(input.value); } });
      const row = el('div', 'sc-row');
      row.append(input, btn('Putar', () => ctl.loadLink(input.value)));
      panel.append(row);
      const row2 = el('div', 'sc-row sc-wrap');
      row2.append(btn('📁 Video dari HP', () => file.click(), true), btn(ctl.localKind === 'live' ? '🔴 Siaran…' : '🔴 Siaran langsung', () => ctl.goLive(), true));
      if (ctl.localKind === 'live') row2.append(btn('Balik kamera', () => ctl.flipCamera(), true));
      panel.append(row2);
      if (s.src) {
        const row3 = el('div', 'sc-row sc-wrap');
        if (s.src.type !== 'live' && s.src.type !== 'tiktok') row3.append(s.st === 'paused' ? btn('▶ Lanjut', () => ctl.resume()) : btn('⏸ Jeda', () => ctl.pause()));
        row3.append(btn('⏹ Hentikan', () => ctl.stop(), true));
        panel.append(row3);
      }
      panel.append(btn('Lepas kendali layar', () => ctl.release(), true), el('p', 'sc-note', 'Putar hanya video yang Anda berhak tayangkan.'));
    }
    if (ctl.status) panel.append(el('p', 'sc-error', ctl.status));
    panel.append(volumeRow(), file);
    toggle.classList.toggle('is-active', Boolean(s.src));
    toggle.dataset.op = ctl.isOperator ? '1' : '0';
  }

  render();
  return { render, toggle, panel, destroy() { toggle.remove(); panel.remove(); } };
}
