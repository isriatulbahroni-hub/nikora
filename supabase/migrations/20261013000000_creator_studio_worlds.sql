-- Fase 9 — Creator Studio: proyek dunia 3D, versi, anggota, moderasi, dan jejak audit.
-- Murni penambahan: tidak mengubah tabel undangan yang sudah ada. Kebijakan ini dicerminkan di
-- game/src/world-lifecycle.js (dites tanpa jaringan); berkas ini adalah penegakannya di database.
--
-- Prinsip:
--  * Klien TIDAK boleh mengubah kolom status (live_version, pending_version, rejected, takedown, latest_version).
--    Semua perubahan status lewat fungsi dunia_* yang memeriksa peran. Hak tabel dicabut, bukan hanya RLS.
--  * Dunia yang terbit = satu versi tetap. Draf baru tidak mengubahnya sebelum disetujui moderator.
--  * Jejak audit hanya bertambah (tanpa hak update/delete) dan ditulis hanya oleh fungsi.
--  * Database hanya menjaga BENTUK data (format, ukuran, jumlah objek). Validasi isi (katalog, area, titik mulai) dilakukan
--    game/src/world-project.js: moderator melihat hasilnya, dan server dunia WAJIB memvalidasi ulang sebelum memuat.

create table public.world_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  template text not null default 'kosong' check (template ~ '^[a-z0-9_-]{1,30}$'),
  latest_version int not null default 0 check (latest_version between 0 and 100),
  live_version int,
  pending_version int,
  rejected jsonb,
  takedown jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index world_projects_owner_idx on public.world_projects (owner_id);

create table public.world_project_versions (
  project_id uuid not null references public.world_projects(id) on delete cascade,
  version int not null check (version >= 1),
  data jsonb not null,
  note text check (note is null or char_length(note) <= 200),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, version),
  constraint dunia_bentuk_data check ((
    jsonb_typeof(data) = 'object'
    and coalesce(data->>'format', '') = 'orbit.world'
    and coalesce(data->>'version', '') = '1'
    and case when jsonb_typeof(data->'props') = 'array' then jsonb_array_length(data->'props') <= 400 else false end
    and pg_column_size(data) <= 262144
  ) is true)
);

create table public.world_project_members (
  project_id uuid not null references public.world_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.world_audit (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.world_projects(id) on delete cascade,
  actor_id uuid,
  action text not null check (char_length(action) <= 40),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index world_audit_project_idx on public.world_audit (project_id, created_at desc);

create trigger world_projects_updated before update on public.world_projects
  for each row execute function public.set_updated_at();

-- Batas jumlah proyek per pemilik (anti-spam penyimpanan).
create function public.batasi_dunia_per_pemilik() returns trigger
language plpgsql security definer set search_path = '' as $f$
begin
  if (select count(*) from public.world_projects where owner_id = new.owner_id) >= 20 then
    raise exception 'Batas 20 proyek dunia per pemilik tercapai.' using errcode = '54000';
  end if;
  return new;
end $f$;
create trigger world_projects_limit before insert on public.world_projects
  for each row execute function public.batasi_dunia_per_pemilik();

-- ---------------------------------------------------------------- pembantu izin
-- Moderator = staf aktif dengan peran owner atau izin 'moderasi_dunia' (memakai tabel staff yang sudah ada).
create function public.bisa_moderasi_dunia() returns boolean
language sql stable security definer set search_path = '' as $f$
  select exists (
    select 1 from public.staff
    where user_id = auth.uid() and active and (role = 'owner' or 'moderasi_dunia' = any (permissions))
  )
$f$;

-- 'owner' | 'editor' | 'viewer' | null untuk pengguna saat ini.
create function public.peran_proyek(p_project uuid) returns text
language sql stable security definer set search_path = '' as $f$
  select case
    when exists (select 1 from public.world_projects where id = p_project and owner_id = auth.uid()) then 'owner'
    else (select role from public.world_project_members where project_id = p_project and user_id = auth.uid())
  end
$f$;

-- Apakah versi ini sedang terbit? (dipakai kebijakan baca publik tanpa membuka tabel proyek ke anon)
create function public.versi_terbit(p_project uuid, p_version int) returns boolean
language sql stable security definer set search_path = '' as $f$
  select exists (select 1 from public.world_projects where id = p_project and live_version = p_version)
$f$;

-- ---------------------------------------------------------------- hak tabel (cabut dulu, beri seperlunya)
alter table public.world_projects enable row level security;
alter table public.world_project_versions enable row level security;
alter table public.world_project_members enable row level security;
alter table public.world_audit enable row level security;

revoke all on public.world_projects, public.world_project_versions, public.world_project_members, public.world_audit from anon, authenticated;
grant select on public.world_projects to authenticated;
grant insert (owner_id, name, template) on public.world_projects to authenticated;
grant update (name) on public.world_projects to authenticated;
grant delete on public.world_projects to authenticated;
grant select on public.world_project_versions to anon, authenticated;
grant select on public.world_project_members to authenticated;
grant insert (project_id, user_id, role, added_by) on public.world_project_members to authenticated;
grant delete on public.world_project_members to authenticated;
grant select on public.world_audit to authenticated;

create policy "dunia: baca proyek" on public.world_projects for select to authenticated
  using (owner_id = auth.uid() or public.peran_proyek(id) is not null or public.bisa_moderasi_dunia());
create policy "dunia: buat proyek" on public.world_projects for insert to authenticated
  with check (owner_id = auth.uid());
create policy "dunia: ganti nama" on public.world_projects for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "dunia: hapus proyek" on public.world_projects for delete to authenticated
  using (owner_id = auth.uid());

create policy "dunia: baca versi" on public.world_project_versions for select to anon, authenticated
  using (public.versi_terbit(project_id, version) or public.peran_proyek(project_id) is not null or public.bisa_moderasi_dunia());

create policy "dunia: baca anggota" on public.world_project_members for select to authenticated
  using (user_id = auth.uid() or public.peran_proyek(project_id) = 'owner');
create policy "dunia: tambah anggota" on public.world_project_members for insert to authenticated
  with check (public.peran_proyek(project_id) = 'owner' and added_by = auth.uid()
    and user_id <> (select owner_id from public.world_projects where id = project_id));
create policy "dunia: cabut anggota" on public.world_project_members for delete to authenticated
  using (public.peran_proyek(project_id) = 'owner' or user_id = auth.uid());

create policy "dunia: baca audit" on public.world_audit for select to authenticated
  using (public.peran_proyek(project_id) in ('owner', 'editor') or public.bisa_moderasi_dunia());

-- ---------------------------------------------------------------- fungsi (satu-satunya jalan mengubah status)
create function public.dunia_catat(p_project uuid, p_action text, p_detail jsonb) returns void
language sql security definer set search_path = '' as $f$
  insert into public.world_audit (project_id, actor_id, action, detail) values (p_project, auth.uid(), p_action, coalesce(p_detail, '{}'::jsonb))
$f$;
revoke all on function public.dunia_catat(uuid, text, jsonb) from public, anon, authenticated;

create function public.dunia_simpan_versi(p_project uuid, p_data jsonb, p_note text default null) returns int
language plpgsql security definer set search_path = '' as $f$
declare r public.world_projects; v int;
begin
  if auth.uid() is null then raise exception 'Silakan masuk dulu.' using errcode = '42501'; end if;
  select * into r from public.world_projects where id = p_project for update;
  -- coalesce penting: peran_proyek() = NULL untuk orang luar, dan NULL NOT IN (...) bernilai NULL (bukan true),
  -- sehingga tanpa coalesce pemeriksaan ini lolos begitu saja. Gagal tertutup: tidak ada peran = ditolak.
  if not found or coalesce(public.peran_proyek(p_project), '') not in ('owner', 'editor') then
    raise exception 'Tidak punya izin menyimpan versi.' using errcode = '42501';
  end if;
  if r.latest_version >= 100 then raise exception 'Batas 100 versi tercapai.' using errcode = '54000'; end if;
  v := r.latest_version + 1;
  insert into public.world_project_versions (project_id, version, data, note, created_by) values (p_project, v, p_data, left(p_note, 200), auth.uid());
  update public.world_projects set latest_version = v where id = p_project;
  perform public.dunia_catat(p_project, 'simpan_versi', jsonb_build_object('version', v));
  return v;
end $f$;

create function public.dunia_ajukan(p_project uuid, p_version int) returns void
language plpgsql security definer set search_path = '' as $f$
declare r public.world_projects;
begin
  select * into r from public.world_projects where id = p_project for update;
  if not found or r.owner_id is distinct from auth.uid() then raise exception 'Hanya pemilik yang boleh mengajukan.' using errcode = '42501'; end if;
  if p_version is null or p_version < 1 or p_version > r.latest_version then raise exception 'Versi tidak ada.'; end if;
  if r.pending_version is not null then raise exception 'Masih ada versi yang sedang ditinjau.'; end if;
  if p_version = r.live_version then raise exception 'Versi ini sudah terbit.'; end if;
  if r.live_version is not null and p_version < r.live_version then raise exception 'Versi harus lebih baru dari yang terbit.'; end if;
  if r.takedown is not null and p_version <= (r.takedown->>'version')::int then raise exception 'Versi ini ditarik moderator. Simpan perbaikan sebagai versi baru.'; end if;
  if r.rejected is not null and p_version <= (r.rejected->>'version')::int then raise exception 'Versi ini ditolak. Simpan perbaikan sebagai versi baru.'; end if;
  update public.world_projects set pending_version = p_version, rejected = null where id = p_project;
  perform public.dunia_catat(p_project, 'ajukan', jsonb_build_object('version', p_version));
end $f$;

create function public.dunia_batal_ajukan(p_project uuid) returns void
language plpgsql security definer set search_path = '' as $f$
declare r public.world_projects;
begin
  select * into r from public.world_projects where id = p_project for update;
  if not found or r.owner_id is distinct from auth.uid() then raise exception 'Hanya pemilik yang boleh membatalkan.' using errcode = '42501'; end if;
  if r.pending_version is null then raise exception 'Tidak ada pengajuan.'; end if;
  update public.world_projects set pending_version = null where id = p_project;
  perform public.dunia_catat(p_project, 'batal_ajukan', jsonb_build_object('version', r.pending_version));
end $f$;

create function public.dunia_putuskan(p_project uuid, p_version int, p_setuju boolean, p_alasan text default null) returns void
language plpgsql security definer set search_path = '' as $f$
declare r public.world_projects; why text := btrim(coalesce(p_alasan, ''));
begin
  if not public.bisa_moderasi_dunia() then raise exception 'Hanya moderator yang boleh meninjau.' using errcode = '42501'; end if;
  select * into r from public.world_projects where id = p_project for update;
  if not found then raise exception 'Proyek tidak ada.'; end if;
  if r.owner_id = auth.uid() then raise exception 'Moderator tidak boleh meninjau dunianya sendiri.' using errcode = '42501'; end if;
  if r.pending_version is null or r.pending_version is distinct from p_version then raise exception 'Tidak ada pengajuan untuk versi ini.'; end if;
  if p_setuju then
    update public.world_projects set live_version = p_version, pending_version = null, rejected = null, takedown = null where id = p_project;
    perform public.dunia_catat(p_project, 'setujui', jsonb_build_object('version', p_version, 'menggantikan', r.live_version));
  else
    if char_length(why) not between 3 and 500 then raise exception 'Alasan penolakan wajib diisi (3-500 karakter).'; end if;
    update public.world_projects set pending_version = null,
      rejected = jsonb_build_object('version', p_version, 'reason', why, 'by', auth.uid(), 'at', now()) where id = p_project;
    perform public.dunia_catat(p_project, 'tolak', jsonb_build_object('version', p_version, 'alasan', why));
  end if;
end $f$;

-- Pemilik menarik dunianya (alasan opsional); moderator menarik paksa (alasan wajib, tercatat).
create function public.dunia_tarik(p_project uuid, p_alasan text default null) returns void
language plpgsql security definer set search_path = '' as $f$
declare r public.world_projects; why text := btrim(coalesce(p_alasan, ''));
begin
  select * into r from public.world_projects where id = p_project for update;
  -- Izin diperiksa lebih dulu dan seragam (juga untuk proyek yang tidak ada), agar pesan galat tidak membocorkan status proyek.
  if not found or (r.owner_id is distinct from auth.uid() and not public.bisa_moderasi_dunia()) then
    raise exception 'Tidak punya izin menarik dunia ini.' using errcode = '42501';
  end if;
  if r.live_version is null then raise exception 'Dunia tidak sedang terbit.'; end if;
  if r.owner_id = auth.uid() then
    update public.world_projects set live_version = null where id = p_project;
    perform public.dunia_catat(p_project, 'tarik', jsonb_build_object('version', r.live_version));
  else
    if char_length(why) not between 3 and 500 then raise exception 'Alasan penarikan wajib diisi (3-500 karakter).'; end if;
    update public.world_projects set live_version = null,
      takedown = jsonb_build_object('version', r.live_version, 'reason', why, 'by', auth.uid(), 'at', now()) where id = p_project;
    perform public.dunia_catat(p_project, 'tarik_moderator', jsonb_build_object('version', r.live_version, 'alasan', why));
  end if;
end $f$;

revoke all on function public.dunia_simpan_versi(uuid, jsonb, text), public.dunia_ajukan(uuid, int), public.dunia_batal_ajukan(uuid),
  public.dunia_putuskan(uuid, int, boolean, text), public.dunia_tarik(uuid, text) from public, anon;
grant execute on function public.dunia_simpan_versi(uuid, jsonb, text), public.dunia_ajukan(uuid, int), public.dunia_batal_ajukan(uuid),
  public.dunia_putuskan(uuid, int, boolean, text), public.dunia_tarik(uuid, text) to authenticated;
-- Pembantu RLS dipanggil oleh kebijakan (termasuk untuk anon pada versi terbit), jadi tetap bisa dieksekusi.
grant execute on function public.versi_terbit(uuid, int), public.peran_proyek(uuid), public.bisa_moderasi_dunia() to anon, authenticated;
