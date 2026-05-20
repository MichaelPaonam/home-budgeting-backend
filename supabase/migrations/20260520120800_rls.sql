-- Row Level Security.
-- Every public, user-owned table: enable RLS + "owner only" policy.
-- service_role bypasses RLS by design (for Edge Functions doing admin work).
--
-- Sanity check after running migrations:
--   select schemaname, tablename, rowsecurity
--   from pg_tables
--   where schemaname = 'public' and rowsecurity = false;
-- An empty result means every public table is locked down.

-- profiles ---------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profiles: owner select"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles: owner update"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- INSERT and DELETE for profiles are handled by the auth trigger / cascade.
-- We deliberately do NOT add insert/delete policies for the anon client.

-- accounts ---------------------------------------------------------------
alter table public.accounts enable row level security;

create policy "accounts: owner all"
  on public.accounts for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- categories -------------------------------------------------------------
alter table public.categories enable row level security;

create policy "categories: owner all"
  on public.categories for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- transactions -----------------------------------------------------------
alter table public.transactions enable row level security;

create policy "transactions: owner all"
  on public.transactions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- budgets ----------------------------------------------------------------
alter table public.budgets enable row level security;

create policy "budgets: owner all"
  on public.budgets for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- device_tokens ----------------------------------------------------------
alter table public.device_tokens enable row level security;

create policy "device_tokens: owner all"
  on public.device_tokens for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
