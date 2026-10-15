// Ekspor avatar manusia jadi berkas 3D (.glb) yang bisa dibuka di Blender, viewer 3D, dsb.
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';

/** Salinan avatar yang bersih untuk diekspor: tanpa label nama, aura, cincin panggung; posisi/putaran dinolkan. */
export function prepareForExport(group) {
  const copy = cloneSkinned(group);
  copy.position.set(0, 0, 0);
  copy.rotation.set(0, 0, 0);
  const drop = [];
  copy.traverse((o) => {
    if (o.isSprite || o.isPoints || o.geometry?.type === 'RingGeometry' || o.material?.blending === THREE.AdditiveBlending) drop.push(o);
  });
  for (const o of drop) o.parent?.remove(o);
  copy.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  const pivot = copy.userData?.pivot;
  if (pivot) pivot.rotation.set(0, 0, 0);
  copy.name = 'AvatarNikora';
  return copy;
}

/** Hasil: ArrayBuffer berformat GLB. Pose saat ini ikut terekspor (tanpa animasi). */
export async function exportAvatarGLB(group) {
  return new GLTFExporter().parseAsync(prepareForExport(group), { binary: true, onlyVisible: true });
}

export async function downloadAvatarGLB(group, name = 'avatar-nikora') {
  const buffer = await exportAvatarGLB(group);
  const url = URL.createObjectURL(new Blob([buffer], { type: 'model/gltf-binary' }));
  const a = document.createElement('a');
  a.href = url; a.download = `${name}.glb`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
