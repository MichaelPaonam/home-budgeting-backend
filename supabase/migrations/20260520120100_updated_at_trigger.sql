-- Shared `set_updated_at` trigger function.
-- Attached to every table with an `updated_at` column. Defined early so later
-- migrations can reference it.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger function: stamps NEW.updated_at = now() on every UPDATE.';
