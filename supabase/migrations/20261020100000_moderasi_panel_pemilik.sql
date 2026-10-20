-- Panel pemilik acara: nama terakhir tamu (agar pelanggar dikenali) dan pengaturan moderasi per acara.
-- Tanpa kebijakan RLS: hanya service role (fungsi serverless) yang membaca/menulis.
alter table public.guest_moderation add column if not exists last_name text check (last_name is null or char_length(last_name) <= 24);

create table if not exists public.moderation_settings (
  event text primary key check (char_length(event) between 1 and 40),
  level text not null default 'normal' check (level in ('normal', 'ketat')),
  allow text[] not null default '{}' check (cardinality(allow) <= 50),
  extra text[] not null default '{}' check (cardinality(extra) <= 50),
  updated_at timestamptz not null default now()
);
alter table public.moderation_settings enable row level security;

-- Ganti fungsi strike: tambah p_name (opsional). Fungsi lama dibuang agar tidak ada dua versi.
drop function if exists public.moderation_strike(text, text, integer);
create or replace function public.moderation_strike(p_event text, p_device text, p_max integer, p_name text default null)
returns table (out_strikes integer, out_banned boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.guest_moderation as g (event, device_hash, strikes, last_name, updated_at)
  values (p_event, p_device, 1, left(p_name, 24), now())
  on conflict (event, device_hash) do update
    set strikes = g.strikes + 1, last_name = coalesce(left(p_name, 24), g.last_name), updated_at = now();

  update public.guest_moderation g
     set banned = true, banned_at = now(), reason = 'kata kasar berulang'
   where g.event = p_event and g.device_hash = p_device and g.strikes > p_max and not g.banned;

  return query
    select g.strikes, g.banned from public.guest_moderation g
     where g.event = p_event and g.device_hash = p_device;
end;
$$;

revoke all on function public.moderation_strike(text, text, integer, text) from public, anon, authenticated;
grant execute on function public.moderation_strike(text, text, integer, text) to service_role;
