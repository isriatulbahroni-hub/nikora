// Tiruan Supabase untuk E2E: hanya membuktikan SAMBUNGAN UI + klien (tombol, status, pesan), BUKAN aturan database.
// Aturan izin asli diuji pada database nyata (transaksi yang dibatalkan, lihat docs/DETAILED_EXECUTION_ROADMAP.md).
export const MOCK_URL = 'https://orbit-e2e.supabase.co';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' };

export function createMock() {
  const users = new Map(); // email -> { id, password, moderator }
  const projects = [];
  const versions = new Map(); // projectId -> [{ version, data, note, created_at }]
  const audit = [];
  const log = []; // nama rpc yang dipanggil
  let seq = 0;
  const addUser = (email, password, moderator = false) => users.set(email, { id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, password, moderator });

  const json = (route, status, body) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: body === undefined ? '' : JSON.stringify(body) });
  const callerOf = (req) => {
    const id = /Bearer tok:([^ ]+)/.exec(req.headers().authorization || '')?.[1];
    for (const [email, u] of users) if (u.id === id) return { email, ...u };
    return null;
  };
  const row = (p) => ({ id: p.id, name: p.name, template: p.template, owner_id: p.owner_id, latest_version: (versions.get(p.id) || []).length, live_version: p.live_version, pending_version: p.pending_version, rejected: p.rejected, takedown: p.takedown, updated_at: p.updated_at });
  const note = (pid, who, action, detail = {}) => audit.push({ project_id: pid, action, detail, created_at: new Date().toISOString(), actor: who.id });
  const deny = (route) => json(route, 403, { code: '42501', message: 'ditolak' });
  const fail = (route, message) => json(route, 400, { code: 'P0001', message });

  async function handle(route) {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(req.url());
    const path = url.pathname;
    const body = req.postData() ? JSON.parse(req.postData()) : {};

    if (path === '/auth/v1/token') {
      const u = users.get(body.email);
      if (!u || u.password !== body.password) return json(route, 400, { msg: 'Invalid login credentials' });
      return json(route, 200, { access_token: `tok:${u.id}`, refresh_token: 'r', expires_in: 3600, user: { id: u.id, email: body.email } });
    }
    const me = callerOf(req);
    if (!me) return json(route, 401, { code: 'PGRST301' });

    if (path === '/rest/v1/rpc/bisa_moderasi_dunia') return json(route, 200, me.moderator);
    if (path === '/rest/v1/world_projects' && req.method() === 'POST') {
      if (body.owner_id !== me.id) return deny(route);
      const p = { id: `aaaaaaaa-0000-4000-8000-${String(++seq).padStart(12, '0')}`, owner_id: me.id, name: body.name, template: body.template, live_version: null, pending_version: null, rejected: null, takedown: null, updated_at: new Date().toISOString() };
      projects.push(p);
      versions.set(p.id, []);
      return json(route, 201, [row(p)]);
    }
    if (path === '/rest/v1/world_projects') {
      const q = url.search;
      let list = projects.filter((p) => p.owner_id === me.id || me.moderator);
      if (q.includes('pending_version=not.is.null')) list = list.filter((p) => p.pending_version != null);
      if (q.includes('live_version=not.is.null')) list = list.filter((p) => p.live_version != null);
      return json(route, 200, list.map(row));
    }
    if (path === '/rest/v1/world_project_versions') {
      const pid = /project_id=eq\.([^&]+)/.exec(url.search)?.[1];
      const list = versions.get(pid) || [];
      const p = projects.find((x) => x.id === pid);
      const canSee = p && (p.owner_id === me.id || me.moderator);
      if (!canSee) return json(route, 200, []);
      const v = /version=eq\.(\d+)/.exec(url.search)?.[1];
      if (v) return json(route, 200, list.filter((x) => x.version === Number(v)).map((x) => ({ data: x.data })));
      return json(route, 200, [...list].reverse().map((x) => ({ version: x.version, note: x.note, created_at: x.created_at })));
    }
    if (path === '/rest/v1/world_audit') {
      const pid = /project_id=eq\.([^&]+)/.exec(url.search)?.[1];
      return json(route, 200, audit.filter((a) => a.project_id === pid).reverse());
    }
    const rpc = /\/rest\/v1\/rpc\/(dunia_[a-z_]+)$/.exec(path)?.[1];
    if (rpc) {
      log.push(rpc);
      const p = projects.find((x) => x.id === body.p_project);
      if (!p) return deny(route);
      if (rpc === 'dunia_simpan_versi') {
        if (p.owner_id !== me.id) return deny(route);
        if (body.p_data?.format !== 'orbit.world') return json(route, 400, { code: '23514', message: 'raw' });
        const list = versions.get(p.id);
        list.push({ version: list.length + 1, data: body.p_data, note: body.p_note, created_at: new Date().toISOString() });
        note(p.id, me, 'simpan_versi', { version: list.length });
        return json(route, 200, list.length);
      }
      if (rpc === 'dunia_ajukan') {
        if (p.owner_id !== me.id) return deny(route);
        if (p.pending_version != null) return fail(route, 'Masih ada versi yang sedang ditinjau.');
        p.pending_version = body.p_version; p.rejected = null;
        note(p.id, me, 'ajukan', { version: body.p_version });
        return json(route, 204);
      }
      if (rpc === 'dunia_batal_ajukan') {
        if (p.owner_id !== me.id) return deny(route);
        note(p.id, me, 'batal_ajukan', { version: p.pending_version }); p.pending_version = null;
        return json(route, 204);
      }
      if (rpc === 'dunia_putuskan') {
        if (!me.moderator || p.owner_id === me.id) return deny(route);
        if (p.pending_version !== body.p_version) return fail(route, 'Tidak ada pengajuan untuk versi ini.');
        if (body.p_setuju) { p.live_version = p.pending_version; p.pending_version = null; p.takedown = null; note(p.id, me, 'setujui', { version: body.p_version }); }
        else { if ((body.p_alasan || '').trim().length < 3) return fail(route, 'Alasan penolakan wajib diisi (3-500 karakter).'); p.rejected = { version: body.p_version, reason: body.p_alasan.trim() }; p.pending_version = null; note(p.id, me, 'tolak', { version: body.p_version, alasan: body.p_alasan }); }
        return json(route, 204);
      }
      if (rpc === 'dunia_tarik') {
        if (p.live_version == null) return fail(route, 'Dunia tidak sedang terbit.');
        if (p.owner_id === me.id) { p.live_version = null; note(p.id, me, 'tarik'); return json(route, 204); }
        if (!me.moderator) return deny(route);
        if ((body.p_alasan || '').trim().length < 3) return fail(route, 'Alasan penarikan wajib diisi (3-500 karakter).');
        p.takedown = { version: p.live_version, reason: body.p_alasan.trim() }; p.live_version = null;
        note(p.id, me, 'tarik_moderator', { version: p.takedown.version, alasan: p.takedown.reason });
        return json(route, 204);
      }
    }
    return json(route, 404, { message: 'tidak ada' });
  }

  return {
    addUser, projects, log, versions,
    async attach(page) {
      await page.addInitScript((url) => { window.__ORBIT_CLOUD__ = { url, key: 'e2e-anon-key' }; }, MOCK_URL);
      await page.route(`${MOCK_URL}/**`, handle);
    },
  };
}
