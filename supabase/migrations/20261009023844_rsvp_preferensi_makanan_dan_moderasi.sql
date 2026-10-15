alter table public.rsvps add column if not exists meal text;
alter table public.rsvps drop constraint if exists rsvps_meal_len;
alter table public.rsvps add constraint rsvps_meal_len check (meal is null or char_length(meal) <= 60);

drop policy if exists "kirim rsvp" on public.rsvps;
create policy "kirim rsvp" on public.rsvps for insert to public
  with check (char_length(name) <= 80 and guests between 1 and 10
    and (wish is null or char_length(wish) <= 300)
    and (meal is null or char_length(meal) <= 60));

drop policy if exists "pemilik hapus rsvp" on public.rsvps;
create policy "pemilik hapus rsvp" on public.rsvps for delete to authenticated
  using (exists (select 1 from public.invitations i where i.slug = rsvps.slug and i.owner_id = auth.uid()));
