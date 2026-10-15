-- Hapus default tetap 'klasik'; tema bawaan kini mengikuti jenis acara
alter table public.invitations alter column theme drop default;

create or replace function public.isi_tema_bawaan()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.theme is null or new.theme = '' then
    new.theme := new.event_type;
  end if;
  return new;
end;
$$;

create trigger invitations_tema_bawaan
  before insert on public.invitations
  for each row execute function public.isi_tema_bawaan();

-- Undangan lama yang memakai 'klasik' beralih ke tema bawaan jenis acaranya
update public.invitations set theme = event_type where theme = 'klasik';
