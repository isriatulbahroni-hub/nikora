import * as THREE from 'three';

// Layar tancap 3D: bingkai gelap + bidang layar. Isi layar berganti antara kartu diam (teks) dan video (VideoTexture).
export function createScreenMesh({ x = 0, y = 4.3, z = -11.45, ry = 0, width = 8, height = 4.5, posts = false } = {}) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = ry;

  const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4, height + 0.4, 0.12), new THREE.MeshStandardMaterial({ color: 0x1a1418, roughness: 0.6 }));
  frame.position.z = -0.07;
  group.add(frame);
  if (posts) {
    // Dua tiang dari tanah (y = 0) sampai bingkai; group berada di ketinggian y.
    const postH = y;
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, postH, 0.22), new THREE.MeshStandardMaterial({ color: 0x2a2024, roughness: 0.7 }));
      post.position.set(sx * (width / 2 - 0.4), -postH / 2, -0.14);
      group.add(post);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = Math.round(1024 * (height / width));
  const ctx = canvas.getContext('2d');
  const idleTexture = new THREE.CanvasTexture(canvas);
  idleTexture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: idleTexture, toneMapped: false });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  group.add(plane);

  let videoTexture = null;
  let currentVideo = null;
  const wrap = (text, max) => {
    const words = String(text).split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (ctx.measureText(next).width > max && line) { lines.push(line); line = w; } else line = next;
    }
    if (line) lines.push(line);
    return lines.slice(0, 3);
  };

  return {
    group,
    /** Kartu diam: judul besar + keterangan kecil. */
    showIdle({ title = 'LAYAR ACARA', sub = '' } = {}) {
      if (currentVideo) this.clearVideo();
      const w = canvas.width;
      const h = canvas.height;
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#2b2030');
      g.addColorStop(1, '#5a2431');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f3d58a';
      ctx.textAlign = 'center';
      ctx.font = 'bold 66px sans-serif';
      const lines = wrap(title, w - 140);
      lines.forEach((l, i) => ctx.fillText(l, w / 2, h / 2 - 20 + (i - (lines.length - 1) / 2) * 78));
      if (sub) {
        ctx.fillStyle = '#e8dcc4';
        ctx.font = '38px sans-serif';
        ctx.fillText(sub, w / 2, h / 2 + 40 + lines.length * 42);
      }
      idleTexture.needsUpdate = true;
      material.map = idleTexture;
      material.needsUpdate = true;
    },
    /** Tampilkan elemen <video> (track LiveKit atau file lokal) di layar. */
    showVideo(video) {
      if (currentVideo === video) return;
      videoTexture?.dispose();
      videoTexture = new THREE.VideoTexture(video);
      videoTexture.colorSpace = THREE.SRGBColorSpace;
      currentVideo = video;
      material.map = videoTexture;
      material.needsUpdate = true;
    },
    clearVideo() {
      videoTexture?.dispose();
      videoTexture = null;
      currentVideo = null;
      material.map = idleTexture;
      material.needsUpdate = true;
    },
    dispose() {
      this.clearVideo();
      idleTexture.dispose();
      material.dispose();
    },
  };
}
