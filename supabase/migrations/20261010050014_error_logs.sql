-- Log error aplikasi (server dan browser). Tanpa kebijakan RLS: hanya service role (server) yang bisa membaca/menulis.
create table if not exists public.error_logs (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  source text not null check (source in ('server','client')),
  message text not null check (char_length(message) <= 500),
  stack text check (stack is null or char_length(stack) <= 4000),
  url text check (url is null or char_length(url) <= 300)
);
create index if not exists error_logs_at_idx on public.error_logs (at desc);
alter table public.error_logs enable row level security;
