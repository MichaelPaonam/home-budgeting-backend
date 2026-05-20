-- RLS sanity check. Run after any schema change.
-- Expected output: zero rows. Any row means a public table has RLS off.
-- Usage: psql "$SUPABASE_DB_URL" -f sql/check_rls.sql

\echo '-- Tables in public schema with RLS DISABLED (should be empty):'
select schemaname, tablename
from pg_tables
where schemaname = 'public'
  and rowsecurity = false
order by tablename;

\echo
\echo '-- Tables in public schema with RLS ENABLED but NO policies (deny-all is intentional for audit_log):'
select t.tablename
from pg_tables t
left join pg_policies p
  on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname = 'public'
  and t.rowsecurity = true
  and p.policyname is null
order by t.tablename;

\echo
\echo '-- Policy summary:'
select tablename, policyname, cmd, qual is not null as has_using, with_check is not null as has_with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
