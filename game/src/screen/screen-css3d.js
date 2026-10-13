import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';

/**
 * Menempelkan pemutar video (iframe YouTube/TikTok) PADA layar 3D, seperti layar sungguhan di dinding:
 * lapisan CSS3D berada di belakang kanvas WebGL, dan bidang layar di kanvas dilubangi (alpha 0) sehingga
 * video tampak menempel di dinding, ikut bergerak mengikuti kamera, dan tertutup avatar/benda yang ada di depannya.
 */
export function createScreenCss3d({ host, group, width, height, px = 640 }) {
  const renderer = new CSS3DRenderer();
  const layer = renderer.domElement;
  layer.className = 'sc-css3d';
  host.insertBefore(layer, host.firstChild);

  const container = document.createElement('div');
  container.className = 'sc-css3d-frame';
  container.style.width = `${px}px`;
  container.style.height = `${Math.round(px * (height / width))}px`;

  const object = new CSS3DObject(container);
  object.scale.setScalar(width / px);
  object.visible = false;
  group.add(object);

  return {
    container,
    layer,
    setActive(on) {
      object.visible = on;
      container.style.display = on ? 'block' : 'none';
    },
    resize(w, h) {
      renderer.setSize(w, h);
    },
    render(scene, camera) {
      if (object.visible) renderer.render(scene, camera);
    },
    dispose() {
      group.remove(object);
      layer.remove();
    },
  };
}
