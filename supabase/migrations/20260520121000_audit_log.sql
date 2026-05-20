-- audit_log: generic before/after capture for every write to user-owned tables.
-- Cheap, queryable from Grafana via the Postgres datasource. Not exposed to
-- anon clients (RLS denies all by default; only service_role reads it).

create table public.audit_log (
  id          bigserial primary key,
  occurred_at timestamptz not null default now(),
  user_id     uuid,                 -- auth.uid() at write time, may be null for system writes
  table_name  text not null,
  row_id      text,                 -- text to accommodate any PK type
  action      text not null check (action in ('INSERT','UPDATE','DELETE')),
  diff        jsonb                 -- before/after as { "before": ..., "after": ... }
);

comment on table public.audit_log is
  'Generic write audit. Populated by audit_row() trigger on user-owned tables. Read via service_role only.';

create index audit_log_table_time_idx
  on public.audit_log (table_name, occurred_at desc);

create index audit_log_user_time_idx
  on public.audit_log (user_id, occurred_at desc);

-- RLS on audit_log: enabled with NO policies => deny-all to anon/authenticated.
-- service_role bypasses RLS, which is what Edge Functions / Grafana datasource use.
alter table public.audit_log enable row level security;

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_row_id  text;
  v_diff    jsonb;
begin
  -- Best-effort user attribution. auth.uid() may be null for service-role writes.
  begin
    v_user_id := auth.uid();
  exception when others then
    v_user_id := null;
  end;

  if (tg_op = 'DELETE') then
    v_row_id := coalesce(old.id::text, null);
    v_diff := jsonb_build_object('before', to_jsonb(old));
  elsif (tg_op = 'UPDATE') then
    v_row_id := coalesce(new.id::text, old.id::text);
    v_diff := jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new));
  else  -- INSERT
    v_row_id := coalesce(new.id::text, null);
    v_diff := jsonb_build_object('after', to_jsonb(new));
  end if;

  insert into public.audit_log (user_id, table_name, row_id, action, diff)
  values (v_user_id, tg_table_name, v_row_id, tg_op, v_diff);

  return coalesce(new, old);
end;
$$;

-- Attach to every user-owned table.
create trigger accounts_audit
  after insert or update or delete on public.accounts
  for each row execute function public.audit_row();

create trigger categories_audit
  after insert or update or delete on public.categories
  for each row execute function public.audit_row();

create trigger transactions_audit
  after insert or update or delete on public.transactions
  for each row execute function public.audit_row();

create trigger budgets_audit
  after insert or update or delete on public.budgets
  for each row execute function public.audit_row();

create trigger device_tokens_audit
  after insert or update or delete on public.device_tokens
  for each row execute function public.audit_row();

-- profiles intentionally not audited (low write volume, sensitive prefs;
-- can be added later if needed).
