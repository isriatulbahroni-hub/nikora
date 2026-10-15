-- Pemilik tidak boleh mengaktifkan kembali undangan yang dinonaktifkan admin, atau menonaktifkannya sendiri.
-- Perubahan lewat panel (service role) dan SQL admin tidak dibatasi.
create or replace function public.jaga_status_undangan() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.role() = 'authenticated' and new.status is distinct from old.status
     and (old.status = 'inactive' or new.status = 'inactive') then
    raise exception 'Status undangan hanya bisa diubah oleh admin';
  end if;
  return new;
end $$;
revoke execute on function public.jaga_status_undangan() from public, anon, authenticated;
drop trigger if exists trg_jaga_status on public.invitations;
create trigger trg_jaga_status before update on public.invitations
  for each row execute function public.jaga_status_undangan();
