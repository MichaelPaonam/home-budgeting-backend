-- Reporting views.
-- security_invoker = true is critical: views run with the *caller's* RLS,
-- not the view owner's. Without it the views silently bypass RLS.

-- Monthly totals per category (expense + income), excluding soft-deleted rows.
create or replace view public.v_monthly_by_category
with (security_invoker = true)
as
select
  t.user_id,
  date_trunc('month', t.occurred_on)::date as month,
  t.category_id,
  c.name  as category_name,
  c.kind  as category_kind,
  t.currency,
  sum(t.amount) as total,
  count(*)      as txn_count
from public.transactions t
left join public.categories c on c.id = t.category_id
where t.deleted_at is null
  and t.kind in ('expense','income')
group by t.user_id, month, t.category_id, c.name, c.kind, t.currency;

comment on view public.v_monthly_by_category is
  'Per-user monthly totals grouped by category. Excludes transfers and soft-deleted rows. Runs under caller RLS.';

-- Budget vs actual for the current period.
-- For monthly budgets only in v1; weekly/yearly can be added when needed.
create or replace view public.v_budget_status
with (security_invoker = true)
as
with current_month as (
  select date_trunc('month', current_date)::date as m
),
spent as (
  select
    t.user_id,
    t.category_id,
    t.currency,
    sum(t.amount) as spent_amount
  from public.transactions t, current_month
  where t.deleted_at is null
    and t.kind = 'expense'
    and date_trunc('month', t.occurred_on) = current_month.m
  group by t.user_id, t.category_id, t.currency
)
select
  b.id            as budget_id,
  b.user_id,
  b.category_id,
  c.name          as category_name,
  b.period,
  b.amount        as budget_amount,
  b.currency,
  coalesce(s.spent_amount, 0) as spent_amount,
  greatest(b.amount - coalesce(s.spent_amount, 0), 0) as remaining_amount,
  case
    when b.amount = 0 then null
    else round(coalesce(s.spent_amount, 0) / b.amount * 100, 2)
  end             as percent_used
from public.budgets b
join public.categories c on c.id = b.category_id
left join spent s
  on s.user_id = b.user_id
 and s.category_id = b.category_id
 and s.currency = b.currency
where b.period = 'monthly'
  and (b.ends_on is null or b.ends_on >= current_date);

comment on view public.v_budget_status is
  'Current-month budget vs actual per active monthly budget. Runs under caller RLS.';
