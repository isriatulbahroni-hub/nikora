create table if not exists public.premium_emails (
  email text primary key check (email = lower(email) and char_length(email) between 5 and 254),
  plan_id bigint references public.plans(id) on delete set null,
  expires_at timestamptz,
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.premium_emails enable row level security;
drop policy if exists "staff baca email premium" on public.premium_emails;
create policy "staff baca email premium" on public.premium_emails for select to authenticated using (public.is_staff());
