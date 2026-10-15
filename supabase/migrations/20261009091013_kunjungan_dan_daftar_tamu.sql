create table if not exists public.visits (
  id bigint generated always as identity primary key,
  slug text not null references public.invitations(slug) on delete cascade,
  lang text,
  kat text,
  created_at timestamptz not null default now(),
  constraint visits_lang_len check (lang is null or char_length(lang) <= 5),
  constraint visits_kat_len check (kat is null or char_length(kat) <= 20)
);
create index if not exists visits_slug_idx on public.visits (slug, created_at desc);
alter table public.visits enable row level security;
drop policy if exists "catat kunjungan" on public.visits;
create policy "catat kunjungan" on public.visits for insert to public
  with check (exists (select 1 from public.invitations i where i.slug = visits.slug));
drop policy if exists "pemilik baca kunjungan" on public.visits;
create policy "pemilik baca kunjungan" on public.visits for select to authenticated
  using (exists (select 1 from public.invitations i where i.slug = visits.slug and i.owner_id = auth.uid()));

create table if not exists public.guests (
  id bigint generated always as identity primary key,
  slug text not null references public.invitations(slug) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  category text check (category is null or char_length(category) <= 20),
  created_at timestamptz not null default now()
);
create index if not exists guests_slug_idx on public.guests (slug);
alter table public.guests enable row level security;
drop policy if exists "pemilik kelola tamu" on public.guests;
create policy "pemilik kelola tamu" on public.guests for all to authenticated
  using (exists (select 1 from public.invitations i where i.slug = guests.slug and i.owner_id = auth.uid()))
  with check (exists (select 1 from public.invitations i where i.slug = guests.slug and i.owner_id = auth.uid()));
