create table if not exists public.staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin')),
  permissions text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
alter table public.staff enable row level security;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and active)
$$;
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and active and role = 'owner')
$$;

drop policy if exists "staff baca diri sendiri" on public.staff;
create policy "staff baca diri sendiri" on public.staff for select to authenticated
  using (user_id = auth.uid() or public.is_owner());

alter table public.invitations add column if not exists status text not null default 'active';
alter table public.invitations drop constraint if exists invitations_status_check;
alter table public.invitations add constraint invitations_status_check check (status in ('active','inactive','archived'));
alter table public.invitations add column if not exists created_at timestamptz;
alter table public.invitations alter column created_at set default now();
create index if not exists invitations_status_idx on public.invitations (status);

drop policy if exists "baca undangan" on public.invitations;
drop policy if exists "baca undangan aktif" on public.invitations;
create policy "baca undangan aktif" on public.invitations for select
  using (status = 'active' or owner_id = auth.uid() or public.is_staff());

alter table public.invitations drop constraint if exists invitations_slug_format;
alter table public.invitations add constraint invitations_slug_format
  check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' and slug not in ('admin','api','kirim','masuk','dashboard','editor','panel','_next','favicon')) not valid;

create table if not exists public.plans (
  id bigserial primary key,
  name text not null unique,
  price_idr bigint not null default 0 check (price_idr >= 0),
  duration_days int check (duration_days is null or duration_days > 0),
  max_invitations int not null default 10 check (max_invitations > 0),
  is_premium boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.plans (name, price_idr, duration_days, max_invitations, is_premium)
values ('Gratis', 0, null, 10, false) on conflict (name) do nothing;

create table if not exists public.subscriptions (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id bigint not null references public.plans(id) on delete restrict,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  source text not null default 'manual' check (source in ('manual','payment')),
  payment_id bigint,
  set_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on public.subscriptions (user_id, created_at desc);

create table if not exists public.payments (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  plan_id bigint references public.plans(id) on delete set null,
  amount_idr bigint not null check (amount_idr >= 0),
  status text not null default 'pending' check (status in ('pending','paid','failed','refunded')),
  method text,
  reference text,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists payments_status_idx on public.payments (status, created_at desc);
alter table public.subscriptions drop constraint if exists subscriptions_payment_fk;
alter table public.subscriptions add constraint subscriptions_payment_fk
  foreign key (payment_id) references public.payments(id) on delete set null;

create table if not exists public.audit_logs (
  id bigserial primary key,
  actor_id uuid,
  actor_email text,
  action text not null,
  target_type text,
  target_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_time_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_target_idx on public.audit_logs (target_id);

alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payments enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "staff baca paket" on public.plans;
drop policy if exists "staff baca langganan" on public.subscriptions;
drop policy if exists "staff baca pembayaran" on public.payments;
drop policy if exists "pemilik baca audit" on public.audit_logs;
drop policy if exists "staff baca rsvp" on public.rsvps;
create policy "staff baca paket" on public.plans for select to authenticated using (public.is_staff());
create policy "staff baca langganan" on public.subscriptions for select to authenticated using (public.is_staff());
create policy "staff baca pembayaran" on public.payments for select to authenticated using (public.is_staff());
create policy "pemilik baca audit" on public.audit_logs for select to authenticated using (public.is_owner());
create policy "staff baca rsvp" on public.rsvps for select to authenticated using (public.is_staff());
