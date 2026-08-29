-- Existing deployments: opt into explicit Data API grants and optimized RLS predicates.
alter table public.user_state enable row level security;

alter table public.user_state drop constraint if exists user_state_payload_object;
alter table public.user_state add constraint user_state_payload_object check (jsonb_typeof(payload) = 'object') not valid;
alter table public.user_state validate constraint user_state_payload_object;

drop policy if exists "users read own state" on public.user_state;
create policy "users read own state" on public.user_state for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "users insert own state" on public.user_state;
create policy "users insert own state" on public.user_state for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "users update own state" on public.user_state;
create policy "users update own state" on public.user_state for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on public.user_state from anon;
revoke all on public.user_state from authenticated;
grant select, insert, update on public.user_state to authenticated;

drop index if exists public.user_state_updated_at_idx;
