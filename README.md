# Home Budgeting — Backend

Supabase-native backend for the Home Budgeting iOS + Android apps.

- **Database**: Supabase Postgres (migrations in `supabase/migrations/`)
- **API**: Supabase PostgREST (auto-generated from schema + RLS) + Deno Edge Functions
- **Auth**: Supabase GoTrue — email magic link / OTP (Apple + Google ready, zero schema change)
- **Observability**: OpenTelemetry → Grafana Cloud (traces + dashboards)
- **Frontend web**: https://github.com/MichaelPaonam/home-budgeting

## Quick start

```bash
npm install            # installs supabase CLI
supabase start         # requires Docker; starts local Postgres + Studio on :54323
supabase db reset      # apply all migrations from scratch
supabase functions serve --env-file ./supabase/functions/.env.local
```

Copy `supabase/functions/.env.local.example` → `supabase/functions/.env.local` and fill in secrets before running functions locally.

## Deploy

```bash
supabase link --project-ref <ref>   # one-time
supabase db push                    # apply pending migrations
supabase functions deploy           # deploy all Edge Functions
supabase secrets set OTEL_EXPORTER_OTLP_ENDPOINT=https://...
supabase secrets set OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic ...
```

## Grafana setup

See `grafana/README.md`. Import `grafana/dashboards/backend-overview.json` into Grafana Cloud.

## Docs

- Data model + ERD: `docs/data-model.md`
- Agent / coding conventions: `AGENTS.md`
