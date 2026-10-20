-- Pengajuan check-in (dari pemilik acara) dan kartu check-in (diterbitkan staf).
--
-- Aturan, ditegakkan di database (bukan di tampilan):
--  * Pemilik acara hanya bisa: mengajukan check-in untuk undangannya sendiri, membatalkan pengajuannya yang masih menunggu,
--    dan membaca pengajuan serta kartu acaranya sendiri.
--  * Menyetujui, menolak, menerbitkan, dan mencabut kartu HANYA lewat fungsi di bawah, yang memeriksa is_staff().
--  * Kartu berupa kode acak 12 karakter, terikat ke satu undangan, punya masa berlaku, dan bisa dicabut.
--  * cek_kartu_checkin() boleh dipanggil siapa pun (dunia 3D memakainya) dan hanya mengembalikan data bila kode cocok,
--    belum dicabut, dan belum kedaluwarsa. Tidak ada cara membaca tabel kartu tanpa menjadi pemilik acara atau staf.

create table if not exists public.checkin_requests (
  id bigint generated always as identity primary key,
  slug text not null references public.invitations(slug) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  guest_name text not null check (char_length(guest_name) between 1 and 80),
  party_size smallint not null default 1 check (party_size between 1 and 50),
  note text check (note is null or char_length(note) <= 300),
  status text not null default 'menunggu' check (status in ('menunggu','disetujui','ditolak','dibatalkan')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists checkin_requests_slug_idx on public.checkin_requests (slug, created_at desc);
create index if not exists checkin_requests_status_idx on public.checkin_requests (status, created_at);
alter table public.checkin_requests enable row level security;

create table if not exists public.checkin_cards (
  id bigint generated always as identity primary key,
  request_id bigint not null unique references public.checkin_requests(id) on delete cascade,
  slug text not null references public.invitations(slug) on delete cascade,
  code text not null unique check (code ~ '^[0-9A-F]{12}$'),
  guest_name text not null check (char_length(guest_name) between 1 and 80),
  room_label text check (room_label is null or char_length(room_label) <= 40),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  issued_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists checkin_cards_slug_idx on public.checkin_cards (slug, created_at desc);
alter table public.checkin_cards enable row level security;

-- ---------- kebijakan baris ----------
drop policy if exists "pemilik ajukan check-in" on public.checkin_requests;
create policy "pemilik ajukan check-in" on public.checkin_requests for insert to authenticated
  with check (
    requested_by = auth.uid() and status = 'menunggu'
    and decided_by is null and decided_at is null and decision_note is null
    and exists (select 1 from public.invitations i where i.slug = checkin_requests.slug and i.owner_id = auth.uid())
    and (select count(*) from public.checkin_requests r where r.slug = checkin_requests.slug and r.status = 'menunggu') < 30
  );

drop policy if exists "pemilik dan staf baca pengajuan" on public.checkin_requests;
create policy "pemilik dan staf baca pengajuan" on public.checkin_requests for select to authenticated
  using (public.is_staff() or exists (select 1 from public.invitations i where i.slug = checkin_requests.slug and i.owner_id = auth.uid()));

drop policy if exists "pemilik batalkan pengajuan" on public.checkin_requests;
create policy "pemilik batalkan pengajuan" on public.checkin_requests for update to authenticated
  using (requested_by = auth.uid() and status = 'menunggu')
  with check (requested_by = auth.uid() and status = 'dibatalkan');

drop policy if exists "pemilik dan staf baca kartu" on public.checkin_cards;
create policy "pemilik dan staf baca kartu" on public.checkin_cards for select to authenticated
  using (public.is_staff() or exists (select 1 from public.invitations i where i.slug = checkin_cards.slug and i.owner_id = auth.uid()));

-- Hak akses tabel: anon tidak punya apa-apa; pemilik hanya boleh mengubah kolom status pengajuan; kartu hanya bisa dibaca.
revoke all on public.checkin_requests from anon;
revoke all on public.checkin_cards from anon;
revoke update on public.checkin_requests from authenticated;
grant update (status) on public.checkin_requests to authenticated;
revoke insert, update, delete on public.checkin_cards from authenticated;

-- ---------- fungsi untuk staf ----------
create or replace function public.setujui_pengajuan_checkin(p_request_id bigint, p_room_label text default null, p_expires_at timestamptz default null)
returns table (kartu_id bigint, kode text, berlaku_sampai timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  r public.checkin_requests%rowtype;
  v_exp timestamptz;
  v_code text;
  v_id bigint;
begin
  if not public.is_staff() then raise exception 'Hanya admin yang boleh melakukan ini.'; end if;
  select * into r from public.checkin_requests where id = p_request_id for update;
  if not found then raise exception 'Pengajuan tidak ditemukan.'; end if;
  if r.status <> 'menunggu' then raise exception 'Pengajuan ini sudah diproses.'; end if;
  -- bawaan: berlaku sampai dua hari setelah acara
  v_exp := coalesce(p_expires_at, (select i.event_date from public.invitations i where i.slug = r.slug) + interval '2 days');
  if v_exp is null or v_exp <= now() then raise exception 'Masa berlaku kartu sudah lewat.'; end if;
  if v_exp > now() + interval '90 days' then raise exception 'Masa berlaku terlalu jauh (maksimal 90 hari).'; end if;
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  insert into public.checkin_cards (request_id, slug, code, guest_name, room_label, expires_at, issued_by)
    values (r.id, r.slug, v_code, r.guest_name, nullif(left(btrim(coalesce(p_room_label, '')), 40), ''), v_exp, auth.uid())
    returning id into v_id;
  update public.checkin_requests set status = 'disetujui', decided_by = auth.uid(), decided_at = now() where id = r.id;
  insert into public.audit_logs (actor_id, actor_email, action, target_type, target_id, detail)
    values (auth.uid(), auth.jwt() ->> 'email', 'checkin_disetujui', 'checkin_request', r.id::text, jsonb_build_object('slug', r.slug, 'card_id', v_id));
  return query select v_id, v_code, v_exp;
end $$;

create or replace function public.tolak_pengajuan_checkin(p_request_id bigint, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_staff() then raise exception 'Hanya admin yang boleh melakukan ini.'; end if;
  update public.checkin_requests
    set status = 'ditolak', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(left(btrim(coalesce(p_note, '')), 300), '')
    where id = p_request_id and status = 'menunggu';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Pengajuan tidak ditemukan atau sudah diproses.'; end if;
  insert into public.audit_logs (actor_id, actor_email, action, target_type, target_id, detail)
    values (auth.uid(), auth.jwt() ->> 'email', 'checkin_ditolak', 'checkin_request', p_request_id::text, '{}'::jsonb);
end $$;

create or replace function public.cabut_kartu_checkin(p_card_id bigint)
returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_staff() then raise exception 'Hanya admin yang boleh melakukan ini.'; end if;
  update public.checkin_cards set revoked_at = now() where id = p_card_id and revoked_at is null;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Kartu tidak ditemukan atau sudah dicabut.'; end if;
  insert into public.audit_logs (actor_id, actor_email, action, target_type, target_id, detail)
    values (auth.uid(), auth.jwt() ->> 'email', 'checkin_kartu_dicabut', 'checkin_card', p_card_id::text, '{}'::jsonb);
end $$;

-- ---------- pemeriksaan kartu (dipakai dunia 3D; boleh anon) ----------
create or replace function public.cek_kartu_checkin(p_slug text, p_code text)
returns table (nama_tamu text, label_kamar text, berlaku_sampai timestamptz)
language sql stable security definer set search_path = public as $$
  select c.guest_name, c.room_label, c.expires_at
  from public.checkin_cards c
  where c.slug = p_slug
    and c.code = upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'))
    and c.revoked_at is null
    and c.expires_at > now()
$$;

-- Supabase memberi EXECUTE ke anon/authenticated secara bawaan, jadi dicabut eksplisit lalu diberikan seperlunya.
revoke all on function public.setujui_pengajuan_checkin(bigint, text, timestamptz) from public, anon, authenticated;
revoke all on function public.tolak_pengajuan_checkin(bigint, text) from public, anon, authenticated;
revoke all on function public.cabut_kartu_checkin(bigint) from public, anon, authenticated;
grant execute on function public.setujui_pengajuan_checkin(bigint, text, timestamptz) to authenticated;
grant execute on function public.tolak_pengajuan_checkin(bigint, text) to authenticated;
grant execute on function public.cabut_kartu_checkin(bigint) to authenticated;
revoke all on function public.cek_kartu_checkin(text, text) from public, anon, authenticated;
grant execute on function public.cek_kartu_checkin(text, text) to anon, authenticated;
