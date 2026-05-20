# AGENTS.md

Supabase-native backend for the Home Budgeting mobile app (iOS + Android).
Express + pg are gone. This repo contains: SQL migrations, Deno Edge Functions,
Grafana dashboard JSON, and observability config.

---

## Repo layout

```
supabase/
  config.toml                  Local dev config (supabase CLI)
  migrations/                  Timestamped SQL, applied in filename order
  functions/
    _shared/otel.ts            OTel init + withTrace() wrapper (Deno)
    _shared/auth.ts            userClient() / serviceClient() helpers
    reports-monthly/           Edge Function: GET monthly spend by category
    transactions-bulk-import/  Edge Function: POST idempotent CSV import
    push-register-device/      Edge Function: POST register APNs/FCM token
  functions/.env.local.example Secret template for local dev
grafana/
  dashboards/backend-overview.json  Import into Grafana Cloud
  README.md                    Step-by-step Grafana Cloud setup + alert rules
sql/
  check_rls.sql                Sanity query — run after every schema change
docs/
  data-model.md                Full ERD + column notes + RLS rationale
package.json                   Dev tooling only (supabase CLI)
```

---

## Developer commands

```bash
npm install                    # installs supabase CLI only

supabase start                 # start local Postgres + Studio (Docker required)
supabase stop

supabase db reset              # drops and replays all migrations from scratch
supabase db push               # apply pending migrations to linked remote project
supabase db diff               # show drift between local schema and migrations

supabase link --project-ref <ref>   # link to a Supabase project (one-time)

supabase functions serve \
  --env-file ./supabase/functions/.env.local   # run Edge Functions locally

supabase functions deploy <function-name>      # deploy one function
supabase functions deploy                      # deploy all

supabase secrets set KEY=value  # push env var to deployed functions
supabase secrets list

npm run rls:check              # run sql/check_rls.sql (needs SUPABASE_DB_URL in env)

# Tests (Deno — no Supabase connection required)
deno task test                 # run all unit tests
deno task test:watch           # re-run on file change
deno task check                # type-check all Edge Function sources
```

`npm test` delegates to `deno task test` — 64 unit tests, all pure/offline.

---

## Environment variables

Local dev: copy `supabase/functions/.env.local.example` → `.env.local` and fill in.
Deployed: set via `supabase secrets set`.

| Var | Where used |
|---|---|
| `SUPABASE_URL` | injected automatically by Supabase runtime |
| `SUPABASE_ANON_KEY` | injected automatically |
| `SUPABASE_SERVICE_ROLE_KEY` | injected automatically; never expose to clients |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `_shared/otel.ts` — Grafana Cloud OTLP URL |
| `OTEL_EXPORTER_OTLP_HEADERS` | `_shared/otel.ts` — `Authorization=Basic <token>` |
| `OTEL_SERVICE_NAME` | defaults to `home-budgeting-backend` |
| `OTEL_SERVICE_VERSION` | defaults to `0.2.0` |
| `SENTRY_DSN` | optional crash reporting |

If `OTEL_EXPORTER_OTLP_ENDPOINT` is blank, spans go to stdout (Supabase log pipeline).

---

## Authentication

Supabase Auth (GoTrue) handles auth. MVP: **email magic link / OTP only**.

Adding Apple or Google later: enable the provider in Supabase dashboard → Auth → Providers.
Zero schema changes needed — `auth.users.id` is the stable FK everywhere.

Mobile flow:
- Auth tokens stored in platform secure store (iOS Keychain / Android EncryptedSharedPreferences).
- Pass JWT as `Authorization: Bearer <token>` on every request.
- Supabase gateway validates JWT before Edge Functions run (`verify_jwt = true`).

---

## Data model (tables in `public` schema)

`profiles` → `accounts` → `transactions` (core ledger)
`categories` → `transactions`
`budgets` → (references `categories`)
`device_tokens` (push registration)
`audit_log` (written by triggers, read via service_role only)

Full ERD and column notes: `docs/data-model.md`.

Key design decisions:
- All amounts `numeric(14,2)`, never `float`.
- `transactions.amount` always positive; direction from `kind` (`expense`/`income`/`transfer`).
- `client_uuid` on `transactions` is the mobile idempotency key; `(user_id, client_uuid)` unique.
- `deleted_at` on `transactions` enables soft-delete for offline-first sync.
- `updated_at` on all tables auto-stamped by `set_updated_at()` trigger.
- Mobile delta-sync: `GET transactions?updated_at=gte.<last_sync_ts>&deleted_at=is.null`

---

## RLS

Every `public` table has RLS enabled. All user-owned tables use:
```sql
using (user_id = auth.uid())
with check (user_id = auth.uid())
```

`service_role` bypasses RLS by design — used only in Edge Functions for admin work.
`audit_log` has RLS enabled with **no policies** = deny-all to client keys.

Views use `security_invoker = true` so RLS is not bypassed.

After any schema change:
```bash
npm run rls:check
# or directly:
psql "$SUPABASE_DB_URL" -f sql/check_rls.sql
```
Expected: zero rows in the "RLS disabled" query.

---

## Edge Functions — conventions

- Entry point: `supabase/functions/<name>/index.ts` (Deno, ESM).
- Shared code lives in `_shared/`; import with relative path `../`.
- Every function wraps its handler in `withTrace(name, req, async ({span, userId}) => ...)`.
- User-scoped DB work: `userClient(req)` — runs under RLS as the calling user.
- Admin DB work: `serviceClient()` — bypasses RLS; never pass to clients.
- Error shape: `{ error: "message" }` with appropriate HTTP status.

---

## Migrations — conventions

- File naming: `YYYYMMDDhhmmss_description.sql` (Supabase CLI format).
- Never edit a migration that has been applied to the remote project — create a new one.
- `supabase db reset` replays all migrations; safe to use locally at any time.
- Trigger `set_updated_at()` is defined in `20260520120100_updated_at_trigger.sql`; any
  new table with `updated_at` must add:
  ```sql
  create trigger <table>_set_updated_at
    before update on public.<table>
    for each row execute function public.set_updated_at();
  ```
- Any new user-owned table needs RLS + policy added to `20260520120800_rls.sql`
  (or a new migration), and an audit trigger referencing `public.audit_row()`.

---

## Observability

- OTel spans flow from mobile (`traceparent` header) through Edge Functions to Grafana Tempo.
- Business metrics (DAU, transactions/day, signups) queried directly from Postgres.
- `audit_log` table is the audit trail; queryable from Grafana Postgres datasource.
- Setup steps: `grafana/README.md`.
- Dashboard to import: `grafana/dashboards/backend-overview.json`.

---

## Not in this repo

- Mobile apps (iOS / Android) — separate repos.
- Frontend web app — https://github.com/MichaelPaonam/home-budgeting
- Database schema creation beyond migrations (no ORM, no introspection scripts).
- Push notification sender (APNs/FCM) — `device_tokens` table is ready, sender not built yet.
- Scheduled jobs (`pg_cron`) — requires Supabase Pro tier; use Supabase scheduled Edge
  Functions on free tier instead.
