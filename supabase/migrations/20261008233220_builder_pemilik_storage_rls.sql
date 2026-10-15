-- 1. Kepemilikan undangan
alter table public.invitations add column if not exists owner_id uuid references auth.users(id) on delete set null;
create index if not exists invitations_owner_idx on public.invitations (owner_id);

-- 2. Batasan keamanan data
alter table public.invitations drop constraint if exists invitations_slug_format;
alter table public.invitations add constraint invitations_slug_format
  check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' and slug not in ('admin','api','kirim','masuk','dashboard','editor','_next','favicon'));
alter table public.invitations drop constraint if exists invitations_extra_size;
alter table public.invitations add constraint invitations_extra_size check (pg_column_size(extra) < 100000);

-- 3. Batas jumlah undangan per pemilik (naikkan sesuai paket nanti)
create or replace function public.batasi_undangan_per_pemilik() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is not null and (select count(*) from public.invitations where owner_id = new.owner_id) >= 10 then
    raise exception 'Batas 10 undangan per akun tercapai';
  end if;
  return new;
end $$;
drop trigger if exists trg_batasi_undangan on public.invitations;
create trigger trg_batasi_undangan before insert on public.invitations
  for each row execute function public.batasi_undangan_per_pemilik();

-- 4. RLS: pemilik mengelola undangannya sendiri; baca publik tetap ada
drop policy if exists "pemilik tambah undangan" on public.invitations;
drop policy if exists "pemilik ubah undangan" on public.invitations;
drop policy if exists "pemilik hapus undangan" on public.invitations;
drop policy if exists "pemilik baca rsvp" on public.rsvps;
create policy "pemilik tambah undangan" on public.invitations for insert to authenticated with check (owner_id = auth.uid());
create policy "pemilik ubah undangan" on public.invitations for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "pemilik hapus undangan" on public.invitations for delete to authenticated using (owner_id = auth.uid());
create policy "pemilik baca rsvp" on public.rsvps for select to authenticated
  using (exists (select 1 from public.invitations i where i.slug = rsvps.slug and i.owner_id = auth.uid()));

-- 5. Penyimpanan media (foto, video, musik): maks 50 MB per file, jenis file dibatasi
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 52428800,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','audio/mpeg','audio/mp4','audio/aac','audio/ogg','audio/wav'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media lihat milik sendiri" on storage.objects;
drop policy if exists "media unggah milik sendiri" on storage.objects;
drop policy if exists "media hapus milik sendiri" on storage.objects;
create policy "media lihat milik sendiri" on storage.objects for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media unggah milik sendiri" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "media hapus milik sendiri" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
