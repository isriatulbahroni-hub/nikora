create table public.invitations(
  slug text primary key, groom text not null, bride text not null,
  event_date timestamptz not null, venue text, address text, maps_url text, message text);
create table public.rsvps(
  id bigserial primary key, slug text references public.invitations(slug) on delete cascade,
  name text not null, attending boolean not null, guests int default 1, wish text,
  created_at timestamptz default now());
create index rsvps_slug_idx on public.rsvps(slug);
alter table public.invitations enable row level security;
alter table public.rsvps enable row level security;
create policy "baca undangan" on public.invitations for select using (true);
create policy "baca ucapan" on public.rsvps for select using (true);
create policy "kirim rsvp" on public.rsvps for insert with check (char_length(name)<=80 and guests between 1 and 10 and (wish is null or char_length(wish)<=300));
