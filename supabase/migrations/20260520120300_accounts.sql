-- accounts: where money lives ("Cash", "Visa ****1234", "Checking").
-- Owned by a user; one user can have many.

create table public.accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  type        text not null check (type in ('cash','checking','savings','credit','other')),
  currency    char(3) not null,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.accounts is
  'User-owned money containers. Soft-archived via archived_at, never hard-deleted while transactions reference them.';

create index accounts_user_id_idx on public.accounts (user_id);
create index accounts_user_active_idx on public.accounts (user_id) where archived_at is null;

create trigger accounts_set_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();
