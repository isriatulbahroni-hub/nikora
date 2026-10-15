import './dashboard.css';
import { countAlerts } from '../admin-shared.js';
import { MIN_SECRET, normalizeSecret } from '../role-link.js';
import { fetchStats } from './api.js';
import { clearSecret, loadSecret, saveSecret } from './auth.js';
import { NAV } from './config.js';
import { demoSamples, demoStats } from './demo.js';
import { h } from './dom.js';
import { formatClock } from './format.js';
import { icon, logo } from './icons.js';
import { pushSample, searchModel } from './model.js';
import { VIEWS, viewSoon } from './views.js';

const storage = (() => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
})();
const read = (k, fallback) => {
  try {
    return JSON.parse(storage?.getItem(k) ?? 'null') ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (k, v) => {
  try {
    storage?.setItem(k, JSON.stringify(v));
  } catch {
    /* abaikan */
  }
};

const params = new URLSearchParams(window.location.search);
const state = {
  secret: loadSecret(storage),
  demo: params.has('demo'),
  stats: null, apiMs: null, samples: read('orbit-dash-samples', []), error: null, loginError: '', loading: true, busy: false,
  route: 'ringkasan', drawer: false, collapsed: read('orbit-dash-collapsed', false) === true, pop: null, search: '',
  intervalSec: [10, 15, 30, 60].includes(read('orbit-dash-interval', 15)) ? read('orbit-dash-interval', 15) : 15,
  ui: { chartMode: null, eventsFilter: 'semua', eventsQuery: '', usersQuery: '', linkEvent: '', linkPage: '' },
};
const root = document.getElementById('app');
let timer = 0;

// ---------- aksi ----------
function toast(text) {
  const el = h('div', { class: 'toast', role: 'status' }, text);
  document.body.append(el);
  setTimeout(() => el.remove(), 4200);
}

function parseHash() {
  const m = /^#\/([a-z]+)(?:\?q=(.*))?$/.exec(window.location.hash);
  const route = m && (VIEWS[m[1]] || ['template', 'pembayaran', 'laporan'].includes(m[1])) ? m[1] : 'ringkasan';
  let q = '';
  try {
    q = m?.[2] ? decodeURIComponent(m[2]) : '';
  } catch {
    q = '';
  }
  return { route, q };
}

function applyHash() {
  const { route, q } = parseHash();
  state.route = route;
  state.drawer = false;
  state.pop = null;
  if (q || window.location.hash.includes('?q=')) {
    if (route === 'acara') state.ui.eventsQuery = q;
    if (route === 'pengguna') state.ui.usersQuery = q;
    if (route === 'tautan') state.ui.linkEvent = q;
  }
  render();
  window.scrollTo(0, 0);
}

const go = (route, query = '') => {
  const next = `#/${route}${query ? `?q=${encodeURIComponent(query)}` : ''}`;
  if (window.location.hash === next) applyHash();
  else window.location.hash = next;
};

const setUi = (patch) => {
  Object.assign(state.ui, patch);
  render();
};

function setIntervalSec(sec) {
  state.intervalSec = sec;
  write('orbit-dash-interval', sec);
  schedule();
  render();
}

function logout() {
  clearSecret(storage);
  state.secret = '';
  state.demo = false;
  state.stats = null;
  state.error = null;
  state.loginError = '';
  clearTimeout(timer);
  render();
}

function toggleDemo() {
  state.demo = !state.demo;
  state.stats = null;
  state.error = null;
  if (!state.demo && !state.secret) return render();
  state.loading = true;
  refresh();
}

function activeRooms(stats) {
  return stats.live.rooms.filter((r) => r.participants > 0).length;
}

async function refresh() {
  if (state.busy) return;
  state.busy = true;
  render();
  try {
    if (state.demo) {
      state.stats = demoStats(Date.now());
      state.samples = demoSamples(Date.now());
      state.apiMs = 41;
      state.error = null;
    } else if (state.secret) {
      const res = await fetchStats({ secret: state.secret });
      if (res.ok) {
        state.stats = res.data;
        state.apiMs = res.ms;
        state.error = null;
        state.samples = pushSample(state.samples, { t: Date.now(), users: res.data.live.totalParticipants, rooms: activeRooms(res.data) });
        write('orbit-dash-samples', state.samples);
      } else if (!state.stats && (res.code === 'unauthorized' || res.code === 'not_configured' || res.code === 'expired')) {
        clearSecret(storage);
        state.secret = '';
        state.loginError = res.message;
      } else {
        state.error = res.message;
      }
    }
  } finally {
    state.busy = false;
    state.loading = false;
    render();
    schedule();
  }
}

function schedule() {
  clearTimeout(timer);
  if (state.demo || !state.secret) return;
  timer = setTimeout(() => (document.hidden ? schedule() : refresh()), state.intervalSec * 1000);
}

async function login(secretRaw) {
  const secret = normalizeSecret(secretRaw);
  if (secret.length < MIN_SECRET) {
    state.loginError = `Rahasia minimal ${MIN_SECRET} karakter (sama dengan EVENT_ROLE_SECRET di Vercel).`;
    return render();
  }
  state.busy = true;
  state.loginError = '';
  render();
  const res = await fetchStats({ secret });
  state.busy = false;
  if (!res.ok) {
    state.loginError = res.message;
    return render();
  }
  state.secret = secret;
  saveSecret(storage, secret);
  state.stats = res.data;
  state.apiMs = res.ms;
  state.samples = pushSample(state.samples, { t: Date.now(), users: res.data.live.totalParticipants, rooms: activeRooms(res.data) });
  state.loading = false;
  render();
  schedule();
}

// ---------- tampilan ----------
function loginView() {
  const input = h('input', { id: 'login-secret', class: 'input', type: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'tempel dari pengelola kata sandi' });
  const submit = () => login(input.value);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
  return h('div', { class: 'login' },
    h('div', { class: 'card login-card' },
      h('div', { class: 'brand center' }, logo(44), h('div', null, h('strong', null, 'NIKORA'), h('small', null, 'ORBIT WORLD'))),
      h('h1', null, 'Masuk Dasbor Admin'),
      h('p', { class: 'muted' }, 'Gunakan rahasia induk (EVENT_ROLE_SECRET). Rahasia diproses di perangkat ini; yang dikirim ke server hanya tanda tangan sementara berumur 5 menit.'),
      h('label', { class: 'form-label', for: 'login-secret' }, 'Rahasia induk'), input,
      state.loginError ? h('div', { class: 'error-box', role: 'alert' }, state.loginError) : null,
      h('div', { class: 'btn-group top' }, h('button', { type: 'button', class: 'btn btn-gold', disabled: state.busy, onclick: submit }, state.busy ? 'Memeriksa…' : 'Masuk'), h('button', { type: 'button', class: 'btn btn-ghost', onclick: toggleDemo }, 'Lihat contoh tampilan')),
      h('p', { class: 'muted small' }, 'Belum punya rahasia? Buat di halaman Admin & Peran setelah masuk, atau pakai /admin.html.')));
}

function skeleton() {
  return h('div', { class: 'page' }, h('div', { class: 'skeleton title' }), h('div', { class: 'stats' }, [1, 2, 3, 4].map(() => h('div', { class: 'card skeleton block' }))), h('div', { class: 'card skeleton tall' }));
}

function sidebar() {
  return h('aside', { class: 'sidebar', 'aria-label': 'Menu utama' },
    h('div', { class: 'brand' }, logo(40), h('div', null, h('strong', null, 'NIKORA'), h('small', null, 'ORBIT WORLD'))),
    h('nav', null, NAV.map((n) => h('button', { type: 'button', class: `nav-item ${state.route === n.id ? 'on' : ''}`, 'aria-current': state.route === n.id ? 'page' : null, onclick: () => go(n.id, '') }, icon(n.icon, 20), h('span', null, n.label), n.soon ? h('em', { class: 'soon' }, 'Segera') : null))),
    h('div', { class: 'side-foot' }, h('small', { class: 'eyebrow' }, 'NIKORA / ORBIT WORLD'), h('p', null, 'Bersama dalam setiap momen istimewa, di dunia nyata dan virtual.')));
}

function topbar() {
  const stats = state.stats;
  const alerts = stats ? stats.alerts : [];
  const n = countAlerts(alerts);
  const label = NAV.find((x) => x.id === state.route)?.label ?? 'Ringkasan';
  const results = stats && state.pop === 'search' ? searchModel(stats, state.search) : [];
  const search = h('div', { class: 'search', 'data-pop': 'search' },
    h('label', { class: 'field' }, icon('search', 16), h('input', { id: 'global-search', type: 'search', placeholder: 'Cari acara, pengguna, atau dunia…', autocomplete: 'off', value: state.search, onfocus: () => { if (state.pop !== 'search') { state.pop = 'search'; render(); } }, oninput: (e) => { state.search = e.target.value; state.pop = 'search'; render(); } })),
    state.pop === 'search' && state.search.trim().length >= 2 ? h('div', { class: 'popover results' }, results.length ? results.map((r) => h('button', { type: 'button', class: 'result', onclick: () => { state.search = ''; state.pop = null; go(r.route, r.query); } }, h('span', { class: 'badge off' }, r.type), h('span', null, h('strong', null, r.label), h('small', { class: 'muted block' }, r.sub)))) : h('div', { class: 'empty small' }, 'Tidak ada hasil')) : null);
  const bell = h('div', { class: 'pop-wrap', 'data-pop': 'bell' },
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': `Notifikasi (${n})`, onclick: () => { state.pop = state.pop === 'bell' ? null : 'bell'; render(); } }, icon('bell', 20), n ? h('i', { class: 'dot' }) : null),
    state.pop === 'bell' ? h('div', { class: 'popover bell' }, h('strong', null, 'Notifikasi'), alerts.length ? alerts.map((a) => h('div', { class: `alert-row ${a.level}` }, icon(a.level === 'info' ? 'info' : 'alert', 16), h('div', null, h('strong', null, a.title), h('small', { class: 'muted block' }, a.detail)))) : h('div', { class: 'empty small' }, 'Tidak ada peringatan')) : null);
  const profile = h('div', { class: 'pop-wrap', 'data-pop': 'menu' },
    h('button', { type: 'button', class: 'profile', onclick: () => { state.pop = state.pop === 'menu' ? null : 'menu'; render(); } }, h('span', { class: 'avatar sm' }, 'A'), h('span', { class: 'who-text' }, h('strong', null, 'Admin'), h('small', null, 'Superadmin')), icon('chevron', 16)),
    state.pop === 'menu' ? h('div', { class: 'popover menu' }, h('button', { type: 'button', class: 'result', onclick: () => go('pengaturan', '') }, icon('settings', 16), 'Pengaturan'), h('button', { type: 'button', class: 'result', onclick: logout }, icon('logout', 16), 'Keluar')) : null);
  return h('header', { class: 'topbar' },
    h('button', { type: 'button', class: 'icon-btn menu-btn', 'aria-label': 'Buka menu', onclick: () => { if (window.innerWidth > 900) { state.collapsed = !state.collapsed; write('orbit-dash-collapsed', state.collapsed); } else state.drawer = !state.drawer; render(); } }, icon('menu', 22)),
    h('div', { class: 'crumbs' }, h('span', { class: 'muted' }, 'Dashboard'), icon('chevron', 14), h('strong', null, label)),
    h('div', { class: 'grow' }),
    search,
    h('button', { type: 'button', class: `icon-btn refresh ${state.busy ? 'spin' : ''}`, 'aria-label': 'Segarkan data', title: stats ? `Diperbarui ${formatClock(stats.generatedAt)}` : 'Segarkan', onclick: refresh }, icon('refresh', 18)),
    bell, profile);
}

function content() {
  if (!state.stats) return state.loading ? skeleton() : h('div', { class: 'page' }, h('div', { class: 'error-box' }, state.error ?? 'Data belum tersedia.'));
  const ctx = {
    stats: state.stats, apiMs: state.apiMs, samples: state.samples, now: Date.now(), ui: state.ui, demo: state.demo, secret: state.demo ? '' : state.secret,
    intervalSec: state.intervalSec, setUi, go, toast, refresh, logout, toggleDemo, setIntervalSec,
  };
  const view = VIEWS[state.route];
  return view ? view(ctx) : viewSoon(ctx, state.route);
}

function render() {
  const active = document.activeElement;
  const focus = active && active.id ? { id: active.id, start: active.selectionStart, end: active.selectionEnd } : null;
  const y = window.scrollY;
  document.title = `${NAV.find((n) => n.id === state.route)?.label ?? 'Ringkasan'} | Dasbor NIKORA ORBIT WORLD`;
  document.body.classList.toggle('drawer-open', state.drawer);
  if (!state.demo && !state.secret) {
    root.replaceChildren(loginView());
  } else {
    root.replaceChildren(
      h('div', { class: `app ${state.drawer ? 'drawer' : ''} ${state.collapsed ? 'collapsed' : ''}` },
        sidebar(),
        h('button', { type: 'button', class: 'scrim', 'aria-label': 'Tutup menu', onclick: () => { state.drawer = false; render(); } }),
        h('div', { class: 'main' },
          topbar(),
          state.demo ? h('div', { class: 'demo-banner' }, h('strong', null, 'DATA CONTOH'), ' Ini hanya contoh tampilan, bukan data nyata. ', h('button', { type: 'button', class: 'link', onclick: toggleDemo }, 'Keluar dari mode contoh')) : null,
          state.error && state.stats ? h('div', { class: 'warn-banner' }, icon('alert', 16), `Gagal memperbarui: ${state.error} Menampilkan data terakhir.`, h('button', { type: 'button', class: 'link', onclick: refresh }, 'Coba lagi')) : null,
          h('main', { class: 'content', id: 'content' }, content()))));
  }
  if (focus) {
    const el = document.getElementById(focus.id);
    if (el) {
      el.focus({ preventScroll: true });
      try {
        if (focus.start != null) el.setSelectionRange(focus.start, focus.end);
      } catch {
        /* jenis input tanpa seleksi */
      }
    }
  }
  window.scrollTo(0, y);
}

document.addEventListener('click', (e) => {
  if (state.pop && !e.target.closest(`[data-pop="${state.pop}"]`)) {
    state.pop = null;
    render();
  }
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.secret && !state.demo) refresh();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (state.pop || state.drawer)) {
    state.pop = null;
    state.drawer = false;
    render();
  }
});
window.addEventListener('hashchange', applyHash);
window.addEventListener('resize', (() => {
  let t = 0;
  return () => {
    clearTimeout(t);
    t = setTimeout(() => state.stats && render(), 200);
  };
})());

window.__dash = { state, go, refresh };
const first = parseHash();
state.route = first.route;
if (first.q) {
  if (first.route === 'acara') state.ui.eventsQuery = first.q;
  if (first.route === 'pengguna') state.ui.usersQuery = first.q;
  if (first.route === 'tautan') state.ui.linkEvent = first.q;
}
render();
if (state.demo || state.secret) refresh();
