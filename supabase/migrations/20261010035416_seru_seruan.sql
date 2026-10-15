alter table public.album_tamu add column if not exists tantangan smallint check (tantangan is null or tantangan between 0 and 7);

create or replace function public.jaga_banjir() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  execute format('select count(*) from public.%I where slug = $1', TG_TABLE_NAME) into n using new.slug;
  if n >= TG_ARGV[0]::int then raise exception 'Sudah penuh' using errcode = '54000'; end if;
  execute format('select count(*) from public.%I where slug = $1 and created_at > now() - interval ''1 minute''', TG_TABLE_NAME) into n using new.slug;
  if n >= TG_ARGV[1]::int then raise exception 'Terlalu banyak kiriman, coba sebentar lagi' using errcode = '54000'; end if;
  return new;
end $$;

create or replace function public.kuis_aktif(s text, tot int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.invitations i where i.slug = s and i.status = 'active'
    and jsonb_typeof(i.extra->'quiz') = 'array' and jsonb_array_length(i.extra->'quiz') = tot);
$$;
grant execute on function public.kuis_aktif(text, int) to anon, authenticated;
create table if not exists public.kuis_skor (
  id bigint generated always as identity primary key,
  slug text not null references public.invitations(slug) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  skor smallint not null check (skor >= 0),
  total smallint not null check (total between 1 and 10),
  created_at timestamptz not null default now(),
  check (skor <= total)
);
create unique index if not exists kuis_skor_unik on public.kuis_skor (slug, lower(name));
alter table public.kuis_skor enable row level security;
drop policy if exists "kuis lihat" on public.kuis_skor;
create policy "kuis lihat" on public.kuis_skor for select to anon, authenticated
  using (exists (select 1 from public.invitations i where i.slug = kuis_skor.slug and (i.status = 'active' or i.owner_id = auth.uid())));
drop policy if exists "kuis kirim" on public.kuis_skor;
create policy "kuis kirim" on public.kuis_skor for insert to anon, authenticated with check (public.kuis_aktif(slug, total::int));
drop policy if exists "kuis hapus pemilik" on public.kuis_skor;
create policy "kuis hapus pemilik" on public.kuis_skor for delete to authenticated
  using (exists (select 1 from public.invitations i where i.slug = kuis_skor.slug and i.owner_id = auth.uid()));
drop trigger if exists jaga_kuis on public.kuis_skor;
create trigger jaga_kuis before insert on public.kuis_skor for each row execute function public.jaga_banjir(500, 30);

create or replace function public.kapsul_aktif(s text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.invitations i where i.slug = s and i.status = 'active' and coalesce(i.extra->>'kapsul_on', 'false') = 'true');
$$;
grant execute on function public.kapsul_aktif(text) to anon, authenticated;
create table if not exists public.kapsul_tamu (
  id bigint generated always as identity primary key,
  slug text not null references public.invitations(slug) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  pesan text not null check (char_length(pesan) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists kapsul_tamu_slug_idx on public.kapsul_tamu (slug, created_at);
alter table public.kapsul_tamu enable row level security;
drop policy if exists "kapsul kirim" on public.kapsul_tamu;
create policy "kapsul kirim" on public.kapsul_tamu for insert to anon, authenticated with check (public.kapsul_aktif(slug));
drop policy if exists "kapsul baca pemilik setelah buka" on public.kapsul_tamu;
create policy "kapsul baca pemilik setelah buka" on public.kapsul_tamu for select to authenticated
  using (exists (select 1 from public.invitations i where i.slug = kapsul_tamu.slug and i.owner_id = auth.uid()
    and i.extra->>'kapsul_buka' ~ '^\d{4}-\d{2}-\d{2}$' and (i.extra->>'kapsul_buka')::date <= current_date));
drop policy if exists "kapsul hapus pemilik" on public.kapsul_tamu;
create policy "kapsul hapus pemilik" on public.kapsul_tamu for delete to authenticated
  using (exists (select 1 from public.invitations i where i.slug = kapsul_tamu.slug and i.owner_id = auth.uid()));
drop trigger if exists jaga_kapsul on public.kapsul_tamu;
create trigger jaga_kapsul before insert on public.kapsul_tamu for each row execute function public.jaga_banjir(300, 20);
create or replace function public.kapsul_jumlah(p_slug text) returns bigint
language sql stable security definer set search_path = public as $$
  select count(*) from public.kapsul_tamu k join public.invitations i on i.slug = k.slug
  where k.slug = p_slug and i.owner_id = auth.uid();
$$;
grant execute on function public.kapsul_jumlah(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('suara', 'suara', true, 1572864, array['audio/webm','audio/mp4','audio/ogg'])
on conflict (id) do update set public = true, file_size_limit = 1572864, allowed_mime_types = array['audio/webm','audio/mp4','audio/ogg'];
create or replace function public.suara_aktif(s text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.invitations i where i.slug = s and i.status = 'active' and coalesce(i.extra->>'suara_on', 'false') = 'true');
$$;
grant execute on function public.suara_aktif(text) to anon, authenticated;
create table if not exists public.suara_tamu (
  id bigint generated always as identity primary key,
  slug text not null references public.invitations(slug) on delete cascade,
  path text not null unique check (char_length(path) <= 200),
  name text check (name is null or char_length(name) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists suara_tamu_slug_idx on public.suara_tamu (slug, created_at desc);
alter table public.suara_tamu enable row level security;
drop policy if exists "suara lihat" on public.suara_tamu;
create policy "suara lihat" on public.suara_tamu for select to anon, authenticated
  using (exists (select 1 from public.invitations i where i.slug = suara_tamu.slug and (i.status = 'active' or i.owner_id = auth.uid())));
drop policy if exists "suara kirim" on public.suara_tamu;
create policy "suara kirim" on public.suara_tamu for insert to anon, authenticated with check (public.suara_aktif(slug) and path like slug || '/%');
drop policy if exists "suara hapus pemilik" on public.suara_tamu;
create policy "suara hapus pemilik" on public.suara_tamu for delete to authenticated
  using (exists (select 1 from public.invitations i where i.slug = suara_tamu.slug and i.owner_id = auth.uid()));
drop trigger if exists jaga_suara on public.suara_tamu;
create trigger jaga_suara before insert on public.suara_tamu for each row execute function public.jaga_banjir(100, 10);
drop policy if exists "suara unggah" on storage.objects;
create policy "suara unggah" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'suara' and name ~ '^[a-z0-9-]{3,40}/[0-9a-f-]{36}\.(webm|m4a|ogg)$'
    and public.suara_aktif((storage.foldername(name))[1])
    and (select count(*) from storage.objects o where o.bucket_id = 'suara' and (storage.foldername(o.name))[1] = (storage.foldername(objects.name))[1]) < 150);
drop policy if exists "suara lihat berkas" on storage.objects;
create policy "suara lihat berkas" on storage.objects for select to anon, authenticated using (bucket_id = 'suara');
drop policy if exists "suara hapus berkas pemilik" on storage.objects;
create policy "suara hapus berkas pemilik" on storage.objects for delete to authenticated
  using (bucket_id = 'suara' and exists (select 1 from public.invitations i where i.slug = (storage.foldername(name))[1] and i.owner_id = auth.uid()));
