create or replace function public.lagu_aktif(s text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.invitations i where i.slug = s and i.status = 'active' and coalesce(i.extra->>'lagu_on', 'false') = 'true');
$$;
grant execute on function public.lagu_aktif(text) to anon, authenticated;

create table if not exists public.lagu (
  id bigint generated always as identity primary key,
  slug text not null references public.invitations(slug) on delete cascade,
  judul text not null check (char_length(judul) between 1 and 80),
  name text check (name is null or char_length(name) <= 40),
  played boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists lagu_slug_idx on public.lagu (slug, created_at);
alter table public.lagu enable row level security;
drop policy if exists "lagu lihat" on public.lagu;
create policy "lagu lihat" on public.lagu for select to anon, authenticated
  using (exists (select 1 from public.invitations i where i.slug = lagu.slug and (i.status = 'active' or i.owner_id = auth.uid())));
drop policy if exists "lagu kirim" on public.lagu;
create policy "lagu kirim" on public.lagu for insert to anon, authenticated with check (public.lagu_aktif(slug) and played = false);
drop policy if exists "lagu ubah pemilik" on public.lagu;
create policy "lagu ubah pemilik" on public.lagu for update to authenticated
  using (exists (select 1 from public.invitations i where i.slug = lagu.slug and i.owner_id = auth.uid()))
  with check (exists (select 1 from public.invitations i where i.slug = lagu.slug and i.owner_id = auth.uid()));
drop policy if exists "lagu hapus pemilik" on public.lagu;
create policy "lagu hapus pemilik" on public.lagu for delete to authenticated
  using (exists (select 1 from public.invitations i where i.slug = lagu.slug and i.owner_id = auth.uid()));
drop trigger if exists jaga_lagu on public.lagu;
create trigger jaga_lagu before insert on public.lagu for each row execute function public.jaga_banjir(150, 15);

create table if not exists public.lagu_vote (
  lagu_id bigint not null references public.lagu(id) on delete cascade,
  slug text not null references public.invitations(slug) on delete cascade,
  voter text not null check (char_length(voter) between 8 and 64),
  created_at timestamptz not null default now(),
  primary key (lagu_id, voter)
);
alter table public.lagu_vote enable row level security;
drop policy if exists "lagu vote kirim" on public.lagu_vote;
create policy "lagu vote kirim" on public.lagu_vote for insert to anon, authenticated
  with check (public.lagu_aktif(slug) and exists (select 1 from public.lagu l where l.id = lagu_id and l.slug = lagu_vote.slug));
drop trigger if exists jaga_lagu_vote on public.lagu_vote;
create trigger jaga_lagu_vote before insert on public.lagu_vote for each row execute function public.jaga_banjir(3000, 80);

create or replace function public.hitung_lagu(p_slug text)
returns table(id bigint, judul text, name text, played boolean, votes bigint)
language sql stable security definer set search_path = public as $$
  select l.id, l.judul, l.name, l.played, count(v.voter)::bigint
  from public.lagu l
  join public.invitations i on i.slug = l.slug and i.status = 'active'
  left join public.lagu_vote v on v.lagu_id = l.id
  where l.slug = p_slug
  group by l.id
  order by l.played, count(v.voter) desc, l.created_at
  limit 100
$$;
grant execute on function public.hitung_lagu(text) to anon, authenticated;

create or replace function public.voting_aktif(s text, p text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.invitations i
    where i.slug = s and i.status = 'active' and coalesce(i.extra->>'voting_on', 'false') = 'true'
      and jsonb_typeof(i.extra->'peserta') = 'array'
      and exists (select 1 from jsonb_array_elements(i.extra->'peserta') e where e->>'id' = p));
$$;
grant execute on function public.voting_aktif(text, text) to anon, authenticated;
create table if not exists public.peserta_vote (
  id bigint generated always as identity primary key,
  slug text not null references public.invitations(slug) on delete cascade,
  peserta text not null check (char_length(peserta) between 1 and 20),
  voter text not null check (char_length(voter) between 8 and 64),
  created_at timestamptz not null default now(),
  unique (slug, voter)
);
alter table public.peserta_vote enable row level security;
drop policy if exists "vote peserta kirim" on public.peserta_vote;
create policy "vote peserta kirim" on public.peserta_vote for insert to anon, authenticated with check (public.voting_aktif(slug, peserta));
drop policy if exists "vote peserta hapus pemilik" on public.peserta_vote;
create policy "vote peserta hapus pemilik" on public.peserta_vote for delete to authenticated
  using (exists (select 1 from public.invitations i where i.slug = peserta_vote.slug and i.owner_id = auth.uid()));
drop trigger if exists jaga_vote_peserta on public.peserta_vote;
create trigger jaga_vote_peserta before insert on public.peserta_vote for each row execute function public.jaga_banjir(3000, 80);
create or replace function public.hitung_peserta(p_slug text) returns table(peserta text, n bigint)
language sql stable security definer set search_path = public as $$
  select v.peserta, count(*)::bigint from public.peserta_vote v
  join public.invitations i on i.slug = v.slug and i.status = 'active'
  where v.slug = p_slug group by v.peserta
$$;
grant execute on function public.hitung_peserta(text) to anon, authenticated;
