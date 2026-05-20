-- budgets: target spend per category per period.

create table public.budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  period      text not null check (period in ('weekly','monthly','yearly')),
  amount      numeric(14,2) not null check (amount >= 0),
  currency    char(3) not null,
  starts_on   date not null,
  ends_on     date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

comment on table public.budgets is
  'Spend target per category per period. ends_on null means "ongoing".';

-- Prevent overlapping budgets for the same (user, category, period).
-- A user typically has one active budget per category per period at a time.
create unique index budgets_active_unique
  on public.budgets (user_id, category_id, period)
  where ends_on is null;

create index budgets_user_idx on public.budgets (user_id);

create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();
