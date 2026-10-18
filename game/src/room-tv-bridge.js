// Penghubung kecil antara tampilan TV 3D (room-tv-view.js) dan antarmuka TV (room-tv-ui.js): keduanya hanya ada
// satu di villa, jadi cukup satu objek bersama. View mengisi setVideo/screenQuad, UI mengisi onFrame.
export const tvBridge = {
  setVideo: () => {}, // (id, <video>|null) -> view: putar video di layar TV
  screenQuad: () => null, // (id, camera, w, h) -> view: sudut layar TV di layar HP
  onFrame: null, // (camera, w, h) <- view, tiap render: UI menempelkan iframe ke layar TV
};
