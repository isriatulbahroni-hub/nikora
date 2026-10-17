// Katalog avatar bicara (TalkingHead + HeadAudio). Hanya model dengan lisensi jelas yang boleh didaftarkan.
// Berkas GLB dikompres oleh workflow "Siapkan aset avatar" ke game/public/avatars/.

export const MOODS = ['neutral', 'happy', 'angry', 'sad', 'fear', 'disgust', 'love', 'sleep'];
export const GESTURES = ['handup', 'index', 'ok', 'thumbup', 'thumbdown', 'side', 'shrug'];

// Parameter HeadAudio (deteksi bunyi bicara). silMode 0 = hanya prototipe senyap bawaan model.
export const VOICE_PARAMS = { vadGateActiveDb: -40, vadGateInactiveDb: -60, silMode: 0 };

export const TALKING_AVATARS = [
  {
    id: 'mpfb',
    name: 'Mpfb (kuncir)',
    file: 'avatars/mpfb.glb',
    body: 'F',
    mood: 'happy',
    license: 'CC0',
    commercialOk: true,
    // Rambut kuncir bergoyang; konfigurasi dari siteconfig.js TalkingHead.
    dynamicBones: [
      { bone: 'Ponytail1', type: 'mix2', stiffness: 100, damping: 4, limits: [null, null, [null, 0.02], null], pivot: true },
      { bone: 'Ponytail2', type: 'mix2', stiffness: 150, damping: 4, limits: [null, null, [null, 0.01], null] },
      { bone: 'Ponytail3', type: 'mix2', stiffness: 200, damping: 4, limits: [null, null, [null, 0.01], null] },
    ],
  },
];

export const DEFAULT_TALKING_AVATAR = 'mpfb';

export const getTalkingAvatar = (id = DEFAULT_TALKING_AVATAR) => TALKING_AVATARS.find((a) => a.id === id) ?? null;

export const avatarUrl = (entry, base = '/') => `${base}${entry.file}`;
