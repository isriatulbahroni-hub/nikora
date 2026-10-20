-- Moderasi obrolan ("CCTV"): peringatan dan blokir tamu per acara, berdasarkan HMAC id perangkat (bukan id mentah).
-- Tanpa kebijakan RLS: hanya service role (fungsi /api/moderate dan /api/token di server) yang membaca/menulis.
create table if not exists public.guest_moderation (
  event text not null check (char_length(event) between 1 and 40),
  device_hash text not null check (char_length(device_hash) between 16 and 64),
  strikes integer not null default 0 check (strikes >= 0),
  banned boolean not null default false,
  banned_at timestamptz,
  reason text check (reason is null or char_length(reason) <= 200),
  updated_at timestamptz not null default now(),
  primary key (event, device_hash)
);
alter table public.guest_moderation enable row level security;

-- Tambah satu pelanggaran secara atomik; blokir otomatis saat melewati batas peringatan (p_max).
create or replace function public.moderation_strike(p_event text, p_device text, p_max integer)
returns table (out_strikes integer, out_banned boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.guest_moderation as g (event, device_hash, strikes, updated_at)
  values (p_event, p_device, 1, now())
  on conflict (event, device_hash) do update set strikes = g.strikes + 1, updated_at = now();

  update public.guest_moderation g
     set banned = true, banned_at = now(), reason = 'kata kasar berulang'
   where g.event = p_event and g.device_hash = p_device and g.strikes > p_max and not g.banned;

  return query
    select g.strikes, g.banned from public.guest_moderation g
     where g.event = p_event and g.device_hash = p_device;
end;
$$;

revoke all on function public.moderation_strike(text, text, integer) from public, anon, authenticated;
grant execute on function public.moderation_strike(text, text, integer) to service_role;

-- Membuka blokir (pemilik/admin lewat SQL editor atau service role):
--   update public.guest_moderation set banned = false, strikes = 0 where event = '<slug>' and device_hash = '<hash>';
