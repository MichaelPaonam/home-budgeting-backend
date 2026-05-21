# Data model

All tables live in the `public` schema. `auth.users` is Supabase-managed (GoTrue) and is never written to directly.

---

## ERD (simplified)

```
auth.users (Supabase-managed)
    │
    ├─── profiles          (1:1, id = auth.users.id)
    │
    ├─── accounts          (1:N, user_id)
    │        │
    │        └─── transactions (N:1 account_id)
    │
    ├─── categories        (1:N, user_id, optional parent_id for hierarchy)
    │        │
    │        ├─── transactions (N:1 category_id, nullable)
    │        └─── budgets      (N:1 category_id)
    │
    ├─── device_tokens     (1:N, user_id)
    │
    └─── (audit_log)       (written by triggers, not a user-owned table)
```

---

## Table reference

### `profiles`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | = `auth.users.id`, cascade delete |
| `display_name` | text | nullable |
| `default_currency` | char(3) | `'USD'` default |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | auto-stamped by trigger |

Created automatically on signup via `handle_new_auth_user()` trigger on `auth.users`.

---

### `accounts`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid FK | → `auth.users.id` cascade |
| `name` | text | e.g. "Cash", "Visa ****1234" |
| `type` | text | `cash \| checking \| savings \| credit \| other` |
| `currency` | char(3) | ISO 4217 |
| `archived_at` | timestamptz | soft-archive; null = active |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | auto-stamped |

Transactions reference accounts with `ON DELETE RESTRICT` — archive accounts, don't delete them.

---

### `categories`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | |
| `name` | text | unique per `(user_id, name, kind)` |
| `kind` | text | `expense \| income` |
| `parent_id` | uuid FK | self-ref → `categories.id`; nullable (top-level) |
| `icon` | text | SF Symbol name (iOS) or Material icon name |
| `color` | text | hex string e.g. `#FF5733`; nullable |
| `archived_at` | timestamptz | soft-archive |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | auto-stamped |

12 defaults are seeded for every new user by `seed_default_categories(uid)` (called from the auth trigger).

#### Design note: per-user category rows

Categories are stored as one row per user, even for the 12 defaults. Two users with "Groceries" hold two rows that share a name but nothing else.

This is deliberate, not an oversight. Reasons:

1. **Users will customise.** Renames, splits, archives, color/icon edits, custom additions. The moment categories are user-editable they are user data, and a shared catalog forces a copy-on-write migration the first time anyone edits anything.
2. **RLS stays simple.** `using (user_id = auth.uid())` works the same as every other table. A shared catalog needs `user_id = auth.uid() OR user_id IS NULL`, which complicates every join and policy.
3. **`transactions.category_id` is a plain FK.** No special-casing for "is this global or personal" in reports/aggregations.
4. **Storage is irrelevant.** 12 rows × ~200 B × N users. Not a real cost at any plausible scale.

Tradeoffs we accept:

- Adding a new default category does **not** propagate to existing users automatically. Backfill recipe below.
- Cross-user analytics ("what % of users spent on Groceries this month") have to match by name, which is fuzzy once users rename. Acceptable — not a launch-blocking metric.
- Localisation of default names is not handled. The seed function hardcodes English. If/when we localise, pass a locale into `seed_default_categories(uid, locale)` and branch the insert.

#### Future-scope improvements (not yet applied)

When we want to enable "Reset to defaults", "What changed in defaults", or cross-user analytics on stable identifiers, add:

1. **`slug` column** — stable identifier across user renames.
   ```sql
   alter table public.categories add column slug text;
   update public.categories set slug = lower(regexp_replace(name, '\s+', '_', 'g'));
   alter table public.categories alter column slug set not null;
   create unique index categories_user_slug_kind_idx on public.categories (user_id, slug, kind);
   ```
   Update `seed_default_categories()` to write `slug = 'groceries'`, `'dining'`, etc. Renames change `name`, never `slug`.

2. **`is_default` boolean** — distinguish system-seeded rows from user-created ones, so a "Reset defaults" feature is unambiguous.
   ```sql
   alter table public.categories add column is_default boolean not null default false;
   ```
   Seed function sets `true`; any user edit on those fields can flip to `false` if we want to track "user has diverged from default".

3. **Backfill recipe for new defaults.** When adding e.g. "Subscriptions" to the seed list, also run:
   ```sql
   insert into public.categories (user_id, name, slug, kind, icon, is_default)
   select id, 'Subscriptions', 'subscriptions', 'expense', 'repeat', true
   from auth.users
   on conflict (user_id, slug, kind) do nothing;
   ```
   Ship this in the same migration that updates `seed_default_categories()`. New signups get it from the seed; existing users get it from the backfill.

4. **Locale-aware seeding** (only when we localise the apps). Add `locale` to `profiles`, pass it to a `seed_default_categories(uid uuid, locale text)`, branch on locale to insert translated names while keeping `slug` stable.

None of these are needed today. Add them when the corresponding product feature lands.

---

### `transactions`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | |
| `account_id` | uuid FK | → `accounts.id` RESTRICT |
| `category_id` | uuid FK | → `categories.id` SET NULL on delete; nullable |
| `amount` | numeric(14,2) | always ≥ 0 — direction from `kind` |
| `kind` | text | `expense \| income \| transfer` |
| `currency` | char(3) | |
| `occurred_on` | date | user-entered date; not `created_at` |
| `note` | text | nullable |
| `client_uuid` | uuid | mobile idempotency key; `(user_id, client_uuid)` unique |
| `transfer_pair_id` | uuid FK | self-ref for transfer pairs; nullable |
| `deleted_at` | timestamptz | soft-delete for offline sync |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | auto-stamped |

**Sync pattern**: mobile fetches `updated_at >= last_sync_ts`, applies soft-deletes locally where `deleted_at is not null`.

**Transfer recording**: a transfer creates two rows — one `expense` on the source account and one `income` on the destination — linked by `transfer_pair_id`.

---

### `budgets`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | |
| `category_id` | uuid FK | → `categories.id` cascade |
| `period` | text | `weekly \| monthly \| yearly` |
| `amount` | numeric(14,2) | target spend |
| `currency` | char(3) | |
| `starts_on` | date | |
| `ends_on` | date | null = ongoing |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | auto-stamped |

Unique partial index on `(user_id, category_id, period) where ends_on is null` — only one active open-ended budget per category+period at a time.

---

### `device_tokens`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | |
| `platform` | text | `ios \| android` |
| `token` | text | APNs device token or FCM registration token |
| `app_version` | text | nullable, for targeting |
| `last_seen_at` | timestamptz | updated on every re-register |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | auto-stamped |

`(platform, token)` globally unique — re-registration rebinds the token to the current user.

---

### `audit_log`
| Column | Type | Notes |
|---|---|---|
| `id` | bigserial PK | |
| `occurred_at` | timestamptz | default `now()` |
| `user_id` | uuid | `auth.uid()` at write time; null for system writes |
| `table_name` | text | |
| `row_id` | text | cast PK of the affected row |
| `action` | text | `INSERT \| UPDATE \| DELETE` |
| `diff` | jsonb | `{ "before": {...}, "after": {...} }` |

RLS enabled with no policies → deny-all to anon/authenticated keys. Readable only via `service_role` (e.g. Grafana Postgres datasource).

---

## Views

### `v_monthly_by_category`
Aggregates `transactions` by `(user_id, month, category_id, currency)`. Excludes transfers and soft-deleted rows. `security_invoker = true` — RLS applies; each caller only sees their own data.

### `v_budget_status`
Joins active monthly `budgets` with current-month spend from `transactions`. Returns `budget_amount`, `spent_amount`, `remaining_amount`, `percent_used`. Same `security_invoker = true` guarantee.

---

## RLS summary

| Table | RLS | Policy |
|---|---|---|
| `profiles` | ✅ | SELECT + UPDATE where `id = auth.uid()` |
| `accounts` | ✅ | ALL where `user_id = auth.uid()` |
| `categories` | ✅ | ALL where `user_id = auth.uid()` |
| `transactions` | ✅ | ALL where `user_id = auth.uid()` |
| `budgets` | ✅ | ALL where `user_id = auth.uid()` |
| `device_tokens` | ✅ | ALL where `user_id = auth.uid()` |
| `audit_log` | ✅ | **No policies** — deny-all to clients |

`service_role` bypasses RLS on all tables by design.
Views: `security_invoker = true` — do not bypass RLS.
