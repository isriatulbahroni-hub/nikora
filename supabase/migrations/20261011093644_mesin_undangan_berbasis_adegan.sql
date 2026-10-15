-- 1. Jenis acara dan tema pada undangan yang sudah ada (undangan lama tetap 'pernikahan')
alter table public.invitations
  add column if not exists event_type text not null default 'pernikahan',
  add column if not exists theme text not null default 'klasik';

alter table public.invitations
  add constraint invitations_event_type_check
  check (event_type in ('pernikahan','khitanan','ulang_tahun','tazkirah','tarannum','karaoke','komunitas')),
  add constraint invitations_theme_check
  check (char_length(theme) between 1 and 40);

-- 2. Fungsi updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 3. Adegan undangan
create table public.invitation_scenes (
  id bigint generated always as identity primary key,
  slug text not null references public.invitations(slug) on delete cascade on update cascade,
  kind text not null check (kind in ('amplop','surat','cover','kisah','detail','galeri','rsvp','bukutamu','hadiah','hari_acara','penutup','arsip')),
  position integer not null check (position >= 0),
  active boolean not null default true,
  config jsonb not null default '{}'::jsonb check (pg_column_size(config) < 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invitation_scenes_slug_position_key unique (slug, position) deferrable initially deferred
);
create index invitation_scenes_slug_idx on public.invitation_scenes (slug, position);
create trigger invitation_scenes_updated_at before update on public.invitation_scenes
  for each row execute function public.set_updated_at();

-- 4. Media undangan
create table public.invitation_media (
  id bigint generated always as identity primary key,
  slug text not null references public.invitations(slug) on delete cascade on update cascade,
  path text not null unique check (char_length(path) <= 200),
  kind text not null check (kind in ('foto','video','audio')),
  caption text check (caption is null or char_length(caption) <= 200),
  position integer not null default 0 check (position >= 0),
  meta jsonb not null default '{}'::jsonb check (pg_column_size(meta) < 10000),
  created_at timestamptz not null default now()
);
create index invitation_media_slug_idx on public.invitation_media (slug, position);

-- 5. Tujuan hadiah (rekening, dompet digital, QR)
create table public.invitation_gifts (
  id bigint generated always as identity primary key,
  slug text not null references public.invitations(slug) on delete cascade on update cascade,
  kind text not null check (kind in ('bank','ewallet','qris')),
  label text not null check (char_length(label) between 1 and 60),
  account_name text check (account_name is null or char_length(account_name) <= 80),
  account_no text check (account_no is null or char_length(account_no) <= 40),
  qr_path text check (qr_path is null or char_length(qr_path) <= 200),
  position integer not null default 0 check (position >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index invitation_gifts_slug_idx on public.invitation_gifts (slug, position);

-- 6. RLS
alter table public.invitation_scenes enable row level security;
alter table public.invitation_media enable row level security;
alter table public.invitation_gifts enable row level security;

-- Baca: siapa pun boleh membaca selama undangannya terbaca (aktif, milik sendiri, atau staff); aturan ini mengikuti RLS invitations
create policy "baca adegan undangan" on public.invitation_scenes for select to public
  using (exists (select 1 from public.invitations i where i.slug = invitation_scenes.slug));
create policy "baca media undangan" on public.invitation_media for select to public
  using (exists (select 1 from public.invitations i where i.slug = invitation_media.slug));
create policy "baca hadiah undangan" on public.invitation_gifts for select to public
  using (active and exists (select 1 from public.invitations i where i.slug = invitation_gifts.slug)
         or exists (select 1 from public.invitations i where i.slug = invitation_gifts.slug and i.owner_id = (select auth.uid())));

-- Tulis: hanya pemilik undangan
create policy "pemilik tambah adegan" on public.invitation_scenes for insert to authenticated
  with check (exists (select 1 from public.invitations i where i.slug = invitation_scenes.slug and i.owner_id = (select auth.uid())));
create policy "pemilik ubah adegan" on public.invitation_scenes for update to authenticated
  using (exists (select 1 from public.invitations i where i.slug = invitation_scenes.slug and i.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.invitations i where i.slug = invitation_scenes.slug and i.owner_id = (select auth.uid())));
create policy "pemilik hapus adegan" on public.invitation_scenes for delete to authenticated
  using (exists (select 1 from public.invitations i where i.slug = invitation_scenes.slug and i.owner_id = (select auth.uid())));

create policy "pemilik tambah media" on public.invitation_media for insert to authenticated
  with check (exists (select 1 from public.invitations i where i.slug = invitation_media.slug and i.owner_id = (select auth.uid())));
create policy "pemilik ubah media" on public.invitation_media for update to authenticated
  using (exists (select 1 from public.invitations i where i.slug = invitation_media.slug and i.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.invitations i where i.slug = invitation_media.slug and i.owner_id = (select auth.uid())));
create policy "pemilik hapus media" on public.invitation_media for delete to authenticated
  using (exists (select 1 from public.invitations i where i.slug = invitation_media.slug and i.owner_id = (select auth.uid())));

create policy "pemilik tambah hadiah" on public.invitation_gifts for insert to authenticated
  with check (exists (select 1 from public.invitations i where i.slug = invitation_gifts.slug and i.owner_id = (select auth.uid())));
create policy "pemilik ubah hadiah" on public.invitation_gifts for update to authenticated
  using (exists (select 1 from public.invitations i where i.slug = invitation_gifts.slug and i.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.invitations i where i.slug = invitation_gifts.slug and i.owner_id = (select auth.uid())));
create policy "pemilik hapus hadiah" on public.invitation_gifts for delete to authenticated
  using (exists (select 1 from public.invitations i where i.slug = invitation_gifts.slug and i.owner_id = (select auth.uid())));
