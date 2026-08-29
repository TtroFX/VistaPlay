create table if not exists public.user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.user_state enable row level security;

drop policy if exists "users read own state" on public.user_state;
create policy "users read own state" on public.user_state for select using (auth.uid() = user_id);

drop policy if exists "users insert own state" on public.user_state;
create policy "users insert own state" on public.user_state for insert with check (auth.uid() = user_id);

drop policy if exists "users update own state" on public.user_state;
create policy "users update own state" on public.user_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists user_state_updated_at_idx on public.user_state(updated_at desc);

revoke all on public.user_state from anon;
grant select, insert, update on public.user_state to authenticated;
