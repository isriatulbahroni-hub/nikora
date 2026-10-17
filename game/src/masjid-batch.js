import * as THREE from 'three';

const tmp = new THREE.Object3D();
const tint = new THREE.Color();

/** Kumpulan benda berbentuk sama (satu geometri) yang digambar dalam satu draw call, dengan warna per benda. */
export class Batch {
  constructor(geometry, material) {
    this.geometry = geometry;
    this.material = material;
    this.items = [];
  }

  add(x, y, z, sx, sy, sz, color, ry = 0) {
    this.items.push([x, y, z, sx, sy, sz, color, ry]);
  }

  build(parent) {
    if (!this.items.length) return null;
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, this.items.length);
    this.items.forEach(([x, y, z, sx, sy, sz, color, ry], i) => {
      tmp.position.set(x, y, z);
      tmp.rotation.set(0, ry, 0);
      tmp.scale.set(sx, sy, sz);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
      mesh.setColorAt(i, tint.set(color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false; // jumlah draw call kecil; hindari bola batas yang salah untuk benda tersebar
    parent.add(mesh);
    return mesh;
  }
}

export function canvasTexture(size, draw, renderer, repeat) {
  const [w, h] = size;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 4;
  if (repeat) tex.repeat.set(repeat[0], repeat[1]);
  return tex;
}
