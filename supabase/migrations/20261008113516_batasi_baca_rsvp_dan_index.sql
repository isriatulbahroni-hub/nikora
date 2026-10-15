drop policy if exists "baca ucapan" on public.rsvps;
create policy "baca ucapan" on public.rsvps for select using (wish is not null);
create index if not exists rsvps_slug_created_idx on public.rsvps (slug, created_at desc);
