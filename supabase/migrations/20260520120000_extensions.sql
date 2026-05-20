-- Required extensions.
-- pgcrypto: gen_random_uuid()
-- pg_stat_statements: query performance metrics surfaced to Grafana later.
-- citext: case-insensitive text (used for category name uniqueness if needed).

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_stat_statements;
create extension if not exists citext with schema extensions;
