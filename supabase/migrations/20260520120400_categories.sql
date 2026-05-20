-- categories: per-user expense/income classification, optional hierarchy.
-- Default categories are seeded into each user via seed_default_categories(),
-- called from the auth.users insert trigger.

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  kind        text not null check (kind in ('expense','income')),
  parent_id   uuid references public.categories(id) on delete set null,
  icon        text,
  color       text,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name, kind)
);

comment on table public.categories is
  'Per-user transaction categories. (user_id, name, kind) is unique. Archive via archived_at.';

create index categories_user_id_idx on public.categories (user_id);
create index categories_parent_idx on public.categories (parent_id);

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- Seed sensible defaults for a new user.
create or replace function public.seed_default_categories(uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (user_id, name, kind, icon) values
    (uid, 'Groceries',      'expense', 'cart'),
    (uid, 'Dining',         'expense', 'fork.knife'),
    (uid, 'Transport',      'expense', 'car'),
    (uid, 'Housing',        'expense', 'house'),
    (uid, 'Utilities',      'expense', 'bolt'),
    (uid, 'Entertainment',  'expense', 'film'),
    (uid, 'Health',         'expense', 'heart'),
    (uid, 'Shopping',       'expense', 'bag'),
    (uid, 'Other',          'expense', 'ellipsis'),
    (uid, 'Salary',         'income',  'banknote'),
    (uid, 'Refunds',        'income',  'arrow.uturn.left'),
    (uid, 'Other Income',   'income',  'plus.circle')
  on conflict (user_id, name, kind) do nothing;
end;
$$;

-- Extend the auth-user trigger to seed categories alongside the profile row.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;

  perform public.seed_default_categories(new.id);
  return new;
end;
$$;
