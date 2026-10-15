-- Pemilik hanya boleh menonaktifkan/mengaktifkan undangannya sendiri. Status yang diatur admin/staff tidak bisa diubah pemilik.
alter table public.invitations add column if not exists status_by text not null default 'staff';
alter table public.invitations drop constraint if exists invitations_status_by_check;
alter table public.invitations add constraint invitations_status_by_check check (status_by in ('owner','staff'));

create or replace function public.jaga_status_undangan() returns trigger
language plpgsql security definer set search_path = public as $$
declare pemilik boolean := auth.uid() is not null and not public.is_staff();
begin
  if new.status is not distinct from old.status then
    new.status_by := old.status_by;      -- penanda tidak bisa diubah langsung
    return new;
  end if;
  if pemilik then
    -- pemilik: active -> inactive, atau inactive -> active hanya jika dulu dinonaktifkan oleh pemilik sendiri
    if not ((old.status = 'active' and new.status = 'inactive')
         or (old.status = 'inactive' and new.status = 'active' and old.status_by = 'owner')) then
      raise exception 'Status undangan ini diatur admin dan tidak bisa Anda ubah' using errcode = '42501';
    end if;
    new.status_by := 'owner';
  else
    new.status_by := 'staff';            -- panel admin (service role) atau staff
  end if;
  return new;
end $$;

drop trigger if exists jaga_status_undangan on public.invitations;
create trigger jaga_status_undangan before update of status, status_by on public.invitations
  for each row execute function public.jaga_status_undangan();
