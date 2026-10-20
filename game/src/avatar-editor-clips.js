// Gerakan (klip Mixamo di public/anims/extra) yang bisa dicoba di pratinjau editor avatar.
// Hanya klip berdiri; klip duduk dan transisi duduk/berdiri sengaja tidak dimasukkan karena tanpa kursi tampak melayang.
// Klip hanya berlaku untuk model manusia (Michelle); avatar Sederhana tidak punya rangka Mixamo.
export const PREVIEW_CLIPS = Object.freeze([
  { id: 'wave2', label: 'Lambai 2', icon: '👋' },
  { id: 'greet', label: 'Sapa', icon: '🙋' },
  { id: 'clap', label: 'Tepuk tangan', icon: '👏' },
  { id: 'laugh', label: 'Tertawa', icon: '😂' },
  { id: 'cry', label: 'Menangis', icon: '😢' },
  { id: 'sad', label: 'Sedih', icon: '😞' },
  { id: 'sad2', label: 'Sedih 2', icon: '😔' },
  { id: 'cheer', label: 'Sorak', icon: '🙌' },
  { id: 'cheer2', label: 'Sorak 2', icon: '🎉' },
  { id: 'talk1', label: 'Bicara 1', icon: '🗣️' },
  { id: 'talk2', label: 'Bicara 2', icon: '🗣️' },
  { id: 'talk3', label: 'Bicara 3', icon: '🗣️' },
  { id: 'pray', label: 'Doa', icon: '🙏' },
  { id: 'pray2', label: 'Doa 2', icon: '🙏' },
  { id: 'macarena', label: 'Macarena', icon: '💃' },
  ...Array.from({ length: 10 }, (_, i) => ({ id: `hiphop${i + 1}`, label: `Hip-hop ${i + 1}`, icon: '🕺' })),
  { id: 'jump', label: 'Lompat', icon: '⬆️' },
]);
