// Warna per bagian untuk karakter manusia yang membawa peta area (jaket, aksen, rambut, kulit).
// Peta area disimpan di dalam GLB sebagai tekstur occlusion (R = jaket, G = aksen, B = rambut; sisanya = kulit/lainnya),
// strength 0 sehingga tidak memengaruhi bayangan. Karakter tanpa peta (mis. Michelle) tidak tersentuh.
// Pilihan editor dipakai ulang: Pakaian -> jaket + aksen, Rambut (warna) -> rambut, Kulit -> kulit.
// Pilihan bawaan (Pakaian 0, Warna rambut 0, Kulit 1) = tampilan asli model.
import * as THREE from 'three';
import { HAIR_COLORS, OUTFITS, SKINS } from './avatar-config.js';

export const ORIGINAL = Object.freeze({ outfit: 0, hairColor: 0, skin: 1 });

/** Campur warna hex ke putih (0..1). */
export function lighten(hex, amount) {
  const mixc = (c) => Math.round(c + (255 - c) * amount);
  return (mixc((hex >> 16) & 255) << 16) | (mixc((hex >> 8) & 255) << 8) | mixc(hex & 255);
}

/** Murni (tanpa THREE): warna hex tiap bagian, atau null bila bagian itu dibiarkan seperti model asli. */
export function recolorSpec(cfg) {
  if (!cfg) return { cloth: null, accent: null, hair: null, skin: null };
  const outfit = cfg.o === ORIGINAL.outfit ? null : OUTFITS[cfg.o]?.hex ?? null;
  return {
    cloth: outfit,
    accent: outfit === null ? null : lighten(outfit, 0.3),
    hair: cfg.k === ORIGINAL.hairColor ? null : HAIR_COLORS[cfg.k]?.hex ?? null,
    skin: cfg.s === ORIGINAL.skin ? null : SKINS[cfg.s]?.hex ?? null,
  };
}

const FRAGMENT = /* glsl */ `
#ifdef USE_AOMAP
  vec3 rcM = texture2D( aoMap, vAoMapUv ).rgb;
  vec3 rcBase = diffuseColor.rgb;
  vec3 rcOut = rcBase;
  rcOut = mix( rcOut, rcColorize( rcBase, uRcCloth.rgb, 0.5, 1.6 ), rcM.r * uRcCloth.a );
  rcOut = mix( rcOut, rcColorize( rcBase, uRcAccent.rgb, 0.55, 1.8 ), rcM.g * uRcAccent.a );
  rcOut = mix( rcOut, rcColorize( rcBase, uRcHair.rgb, 0.8, 2.0 ), rcM.b * uRcHair.a );
  float rcRest = clamp( 1.0 - rcM.r - rcM.g - rcM.b, 0.0, 1.0 );
  float rcSkinish = smoothstep( 0.02, 0.10, rcBase.r - rcBase.b ) * smoothstep( 0.25, 0.5, rcBase.r );
  rcOut = mix( rcOut, clamp( rcBase * uRcSkin.rgb, 0.0, 1.0 ), rcRest * rcSkinish * uRcSkin.a );
  diffuseColor.rgb = rcOut;
#endif
`;

const HEADER = /* glsl */ `
uniform vec4 uRcCloth;
uniform vec4 uRcAccent;
uniform vec4 uRcHair;
uniform vec4 uRcSkin;
vec3 rcColorize( vec3 base, vec3 tint, float lo, float gain ) {
  float l = dot( base, vec3( 0.299, 0.587, 0.114 ) );
  return tint * clamp( lo + gain * l, 0.0, 1.6 );
}
`;

/**
 * Pasang pewarnaan ke semua material berpeta di pohon model (material di-klon supaya tiap avatar punya warna sendiri).
 * Mengembalikan { apply(cfg), dispose() }, atau null bila model tidak punya peta area.
 */
export function attachRecolor(root) {
  const materials = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const cloned = list.map((m) => {
      if (!m?.aoMap) return m;
      const c = m.clone();
      c.aoMapIntensity = 0; // peta area bukan AO sungguhan
      materials.push(c);
      return c;
    });
    o.material = Array.isArray(o.material) ? cloned : cloned[0];
  });
  if (!materials.length) return null;
  const uniforms = {
    uRcCloth: { value: new THREE.Vector4(1, 1, 1, 0) },
    uRcAccent: { value: new THREE.Vector4(1, 1, 1, 0) },
    uRcHair: { value: new THREE.Vector4(1, 1, 1, 0) },
    uRcSkin: { value: new THREE.Vector4(1, 1, 1, 0) },
  };
  for (const m of materials) {
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `${HEADER}\nvoid main() {`)
        .replace('#include <map_fragment>', `#include <map_fragment>\n${FRAGMENT}`);
    };
    m.customProgramCacheKey = () => 'orbit-recolor-v1';
    m.needsUpdate = true;
  }
  const c = new THREE.Color();
  const setTint = (uniform, hex) => {
    if (hex === null) uniform.value.set(1, 1, 1, 0);
    else {
      c.setHex(hex);
      uniform.value.set(c.r, c.g, c.b, 1);
    }
  };
  const ref = new THREE.Color(SKINS[ORIGINAL.skin].hex);
  return {
    apply(cfg) {
      const spec = recolorSpec(cfg);
      setTint(uniforms.uRcCloth, spec.cloth);
      setTint(uniforms.uRcAccent, spec.accent);
      setTint(uniforms.uRcHair, spec.hair);
      if (spec.skin === null) uniforms.uRcSkin.value.set(1, 1, 1, 0);
      else {
        c.setHex(spec.skin); // kulit memakai rasio terhadap warna kulit asli, jadi detail wajah tetap terjaga
        uniforms.uRcSkin.value.set(Math.min(4, c.r / ref.r), Math.min(4, c.g / ref.g), Math.min(4, c.b / ref.b), 1);
      }
    },
    dispose() {
      for (const m of materials) m.dispose();
    },
  };
}
