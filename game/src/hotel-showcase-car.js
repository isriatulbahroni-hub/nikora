// Mobil pajangan di halaman depan hotel (model Bugatti NIKORA, game/public/models/mobil-hotel.glb).
// Ukuran model tidak diketahui pasti (Blender / generator 3D), jadi model diskalakan otomatis ke SHOWCASE_CAR.length meter,
// dipusatkan di titik pajangan, dan diletakkan tepat di atas permukaan halaman. Bila berkas gagal dimuat, hotel tetap jalan tanpa mobil.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const BASE = import.meta.env?.BASE_URL ?? '/';

// Titik pajangan: di bawah kanopi drop-off (x -18..18, z 439..453), di depan pintu lobi utama (z 453), di selatan air mancur (z 429).
// heading = putaran sumbu y (radian); PI = moncong mobil menghadap utara (-z), ke arah jalan. Ubah bila moncong terbalik.
export const SHOWCASE_CAR = Object.freeze({ url: `${BASE}models/mobil-hotel.glb`, x: 0, z: 446, y: 0.09, heading: Math.PI, length: 4.6 });

const disposeObject = (obj) => {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry?.dispose();
    for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!mat) continue;
      for (const v of Object.values(mat)) if (v?.isTexture) v.dispose();
      mat.dispose();
    }
  });
};

/** Pasang mobil pajangan ke `parent`. Mengembalikan { object, dispose }; model muncul setelah berkas selesai dimuat. */
export function addShowcaseCar(parent, spec = SHOWCASE_CAR) {
  const holder = new THREE.Group();
  holder.name = 'hotel-showcase-car';
  holder.position.set(spec.x, spec.y, spec.z);
  holder.rotation.y = spec.heading;
  parent.add(holder);
  let disposed = false;
  new GLTFLoader().load(
    spec.url,
    (gltf) => {
      const car = gltf.scene;
      if (disposed) {
        disposeObject(car);
        return;
      }
      const box = new THREE.Box3().setFromObject(car);
      const size = box.getSize(new THREE.Vector3());
      if (!(size.x > 0 && size.z > 0)) return;
      if (size.x > size.z) car.rotation.y = Math.PI / 2; // panjang mobil dijadikan searah sumbu z (moncong ke +z sebelum heading)
      car.updateMatrixWorld(true);
      box.setFromObject(car);
      box.getSize(size);
      car.scale.setScalar(spec.length / size.z);
      car.updateMatrixWorld(true);
      box.setFromObject(car);
      const c = box.getCenter(new THREE.Vector3());
      car.position.set(-c.x, -box.min.y, -c.z); // pusat di titik pajangan, roda menyentuh tanah
      car.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      holder.add(car);
    },
    undefined,
    (err) => console.warn('Mobil hotel gagal dimuat:', spec.url, err),
  );
  return {
    object: holder,
    dispose: () => {
      disposed = true;
      parent.remove(holder);
      disposeObject(holder);
    },
  };
}
