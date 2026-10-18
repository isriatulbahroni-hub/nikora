// Pemilih hero (DOM): deretan tombol dari daftar hero, pilihan diingat di penyimpanan.
// Pakai: const list = await loadHeroList({ base }); const picker = createHeroPicker({ container, list, storage: localStorage, onPick });
// lalu createHero(heroPath(picker.hero)) untuk memuat model terpilih.
import './horor-hero-picker.css';
import { loadHeroChoice, resolveHeroId, saveHeroChoice } from './horor-heroes.js';

export function createHeroPicker({ container, list, selected = null, storage = null, onPick = () => {} }) {
  let current = resolveHeroId(list, selected ?? loadHeroChoice(storage));
  container.classList.add('horor-hero-picker');
  container.setAttribute('role', 'radiogroup');
  container.setAttribute('aria-label', 'Pilih hero');

  const heroOf = (id) => list.find((h) => h.id === id);

  function render() {
    container.replaceChildren();
    for (const hero of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'horor-hero-opt';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(hero.id === current));
      b.dataset.id = hero.id;
      b.textContent = hero.name;
      b.addEventListener('click', () => pick(hero.id));
      container.append(b);
    }
  }

  function pick(id) {
    current = resolveHeroId(list, id);
    saveHeroChoice(storage, current);
    render();
    onPick(heroOf(current));
  }

  render();
  return {
    get id() { return current; },
    get hero() { return heroOf(current); },
    pick,
  };
}
