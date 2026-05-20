-- device_tokens: APNs / FCM registration tokens for push notifications.
-- Populated by the push-register-device Edge Function. Out of MVP for sending,
-- but the table is needed so the function has a target.

create table public.device_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  platform    text not null check (platform in ('ios','android')),
  token       text not null,
  app_version text,
  last_seen_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (platform, token)
);

comment on table public.device_tokens is
  'APNs/FCM tokens for push delivery. (platform, token) globally unique; user_id rebinds on re-register.';

create index device_tokens_user_idx on public.device_tokens (user_id);

create trigger device_tokens_set_updated_at
  before update on public.device_tokens
  for each row execute function public.set_updated_at();
