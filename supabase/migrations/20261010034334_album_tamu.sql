insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('album', 'album', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create table if not exists public.album_tamu (
  id bigint generated always as identity primary key,
  slug text not null references public.invitations(slug) on delete cascade,
  path text not null unique check (char_length(path) <= 200),
  name text check (name is null or char_length(name) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists album_tamu_slug_idx on public.album_tamu (slug, created_at desc);
alter table public.album_tamu enable row level security;

create or replace function public.album_aktif(s text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.invitations i
    where i.slug = s and i.status = 'active' and coalesce(i.extra->>'album_on', 'false') = 'true');
$$;
grant execute on function public.album_aktif(text) to anon, authenticated;

drop policy if exists "album lihat" on public.album_tamu;
create policy "album lihat" on public.album_tamu for select to anon, authenticated
  using (exists (select 1 from public.invitations i where i.slug = album_tamu.slug and (i.status = 'active' or i.owner_id = auth.uid())));
drop policy if exists "album kirim" on public.album_tamu;
create policy "album kirim" on public.album_tamu for insert to anon, authenticated
  with check (public.album_aktif(slug) and path like slug || '/%');
drop policy if exists "album hapus pemilik" on public.album_tamu;
create policy "album hapus pemilik" on public.album_tamu for delete to authenticated
  using (exists (select 1 from public.invitations i where i.slug = album_tamu.slug and i.owner_id = auth.uid()));

create or replace function public.jaga_album() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.album_tamu where slug = new.slug) >= 300 then
    raise exception 'Album penuh (maksimal 300 foto)' using errcode = '54000';
  end if;
  if (select count(*) from public.album_tamu where slug = new.slug and created_at > now() - interval '1 minute') >= 25 then
    raise exception 'Terlalu banyak kiriman, coba sebentar lagi' using errcode = '54000';
  end if;
  return new;
end $$;
drop trigger if exists jaga_album on public.album_tamu;
create trigger jaga_album before insert on public.album_tamu for each row execute function public.jaga_album();

drop policy if exists "album unggah" on storage.objects;
create policy "album unggah" on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'album'
    and name ~ '^[a-z0-9-]{3,40}/[0-9a-f-]{36}\.jpg$'
    and public.album_aktif((storage.foldername(name))[1])
    and (select count(*) from storage.objects o where o.bucket_id = 'album' and (storage.foldername(o.name))[1] = (storage.foldername(objects.name))[1]) < 400
  );
drop policy if exists "album hapus berkas pemilik" on storage.objects;
create policy "album hapus berkas pemilik" on storage.objects for delete to authenticated
  using (bucket_id = 'album' and exists (select 1 from public.invitations i where i.slug = (storage.foldername(name))[1] and i.owner_id = auth.uid()));
drop policy if exists "album lihat berkas" on storage.objects;
create policy "album lihat berkas" on storage.objects for select to anon, authenticated using (bucket_id = 'album');
