// Suasana ucapan tamu (leksikon sederhana: Indonesia, Melayu, Inggris) untuk memilih warna dan bentuk kembang api.
export const MOODS = Object.freeze({
  romantic: { label: 'Romantis', colors: [0xff3a5e, 0xff7aa2], shape: 'heart' },
  funny: { label: 'Kocak', colors: [0xffd24a, 0xffa31a], shape: 'crackle' },
  pray: { label: 'Doa', colors: [0xfff3c4, 0xffe08a], shape: 'willow' },
  joy: { label: 'Meriah', colors: [0x59d8ff, 0xb77bff, 0x7dff9c, 0xff9d4a], shape: 'sphere' },
});

const LEXICON = {
  romantic: ['cinta', 'sayang', 'love', 'romant', 'hati', 'jodoh', 'pasangan', 'selamanya', 'forever', 'kasih', 'mesra', 'soulmate', 'mawar', '❤', '💕', '😍', '🥰', '💖'],
  funny: ['haha', 'wkwk', 'hehe', 'lucu', 'kocak', 'awok', 'ngakak', 'lol', 'becanda', 'gokil', 'receh', 'joget', '😂', '🤣', '😆'],
  pray: ['semoga', 'doa', 'amin', 'aamiin', 'amiin', 'barakallah', 'sakinah', 'mawaddah', 'warahmah', 'berkah', 'langgeng', 'bless', 'pray', 'allah', 'tuhan', 'samawa', 'rahmat', 'lancar', '🙏', '🤲'],
  joy: ['selamat', 'congrat', 'bahagia', 'happy', 'yeay', 'horee', 'hore', 'mantap', 'cantik', 'ganteng', 'keren', 'wow', '🎉', '🎊', '🥳'],
};
const ORDER = ['pray', 'romantic', 'funny', 'joy']; // urutan menang bila skor seri

/** Mengembalikan { mood, label, colors, shape }. Tanpa kata kunci yang cocok: 'joy' (meriah). */
export function classifyMood(text) {
  const t = String(text ?? '').toLowerCase();
  let best = 'joy';
  let bestScore = 0;
  for (const mood of ORDER) {
    const score = LEXICON[mood].reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0);
    if (score > bestScore) {
      best = mood;
      bestScore = score;
    }
  }
  return { mood: best, ...MOODS[best] };
}
