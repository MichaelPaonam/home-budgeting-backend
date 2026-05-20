-- profiles: 1:1 with auth.users. Holds app-level user prefs.
-- Created automatically via on_auth_user_created trigger so no client-side
-- INSERT is needed after signup.

create table public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  display_name      text,
  default_currency  char(3) not null default 'USD',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.profiles is
  'Per-user app preferences. id == auth.users.id (1:1).';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row when a new auth user is created.
-- Uses SECURITY DEFINER because the trigger fires on auth.users which the
-- caller (Supabase Auth) does not own in the public schema's grant model.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
