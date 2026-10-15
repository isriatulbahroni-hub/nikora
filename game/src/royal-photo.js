// Photobooth holografik: menyusun kartu foto suvenir (bingkai emas berinisial pengantin) dari tangkapan kanvas 3D.
export function composeSouvenir(frame, { mono = 'N&A', title = 'The Royal Wedding · Istana Cinta', name = '', now = new Date() } = {}) {
  const W = 1080;
  const H = 1440;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0d1030');
  bg.addColorStop(1, '#1d2152');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const px = 70;
  const py = 70;
  const pw = W - 140;
  const ph = 1090;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 18);
  ctx.clip();
  const k = Math.max(pw / frame.width, ph / frame.height);
  ctx.drawImage(frame, px + (pw - frame.width * k) / 2, py + (ph - frame.height * k) / 2, frame.width * k, frame.height * k);
  ctx.restore();

  ctx.strokeStyle = '#d9b25a';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(px - 12, py - 12, pw + 24, ph + 24, 26);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(px - 28, py - 28, pw + 56, ph + 56, 34);
  ctx.stroke();
  ctx.fillStyle = '#d9b25a';
  for (const [cx, cy] of [[px - 20, py - 20], [px + pw + 20, py - 20], [px - 20, py + ph + 20], [px + pw + 20, py + ph + 20]]) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-12, -12, 24, 24);
    ctx.restore();
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8c872';
  ctx.font = 'italic 700 112px Georgia, "Times New Roman", serif';
  ctx.fillText(mono, W / 2, 1296);
  ctx.fillStyle = '#f3e7c4';
  ctx.font = '600 34px system-ui, sans-serif';
  ctx.fillText(title, W / 2, 1346);
  ctx.font = '500 30px system-ui, sans-serif';
  ctx.fillStyle = '#c9c4e8';
  const date = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  ctx.fillText(name ? `${name} · ${date}` : date, W / 2, 1390);
  ctx.font = '500 22px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(232,200,114,0.75)';
  ctx.fillText('NIKORA · 360 PHOTOBOOTH PASS', W / 2, 1424);
  return canvas;
}

export function downloadCanvas(canvas, filename) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, 'image/png');
}
