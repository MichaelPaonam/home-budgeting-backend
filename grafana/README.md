# Grafana Cloud — provisioning notes
#
# 1. Sign up at https://grafana.com/products/cloud/ (free tier).
#    Free tier includes: 10k metric series, 50 GB logs, 50 GB traces, 14-day retention.
#
# 2. Collect these values from your Grafana Cloud stack:
#    - OTLP endpoint: https://<stack>.otlp.grafana.net (shown under "Connections > OpenTelemetry")
#    - OTLP token:    an API token with "MetricsPublisher" + "TracesPublisher" + "LogsPublisher" scopes
#    - Postgres datasource: configure "Supabase Postgres" datasource using the direct connection
#      string from Supabase dashboard → Settings → Database → "Direct connection"
#      Port 5432; disable SSL certificate verification for the free tier if it complains.
#
# 3. Add secrets to Supabase Edge Functions (never commit real values):
#      supabase secrets set OTEL_EXPORTER_OTLP_ENDPOINT=https://<stack>.otlp.grafana.net
#      supabase secrets set OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64(instanceId:token)>
#      supabase secrets set OTEL_SERVICE_NAME=home-budgeting-backend
#      supabase secrets set OTEL_SERVICE_VERSION=0.2.0
#
#    For local dev copy supabase/functions/.env.local.example → .env.local and fill in values.
#
# 4. Import dashboard:
#    Grafana UI → Dashboards → Import → Upload JSON → grafana/dashboards/backend-overview.json
#    Select the "Supabase Postgres" and "Tempo" datasources when prompted.
#
# 5. Alert rules (configure in Grafana UI under Alerting → Alert rules):
#
#    Rule: High Error Rate
#      Condition : error_rate > 0.05 for 5m
#      TraceQL   : { service.name="home-budgeting-backend" && status=error } | rate()
#      Severity  : critical
#
#    Rule: High p95 Latency
#      Condition : p95 span duration > 1000ms for 5m
#      TraceQL   : { service.name="home-budgeting-backend" } | histogram_over_time(duration)
#      Severity  : warning
#
#    Rule: Auth Spike
#      SQL (Postgres datasource):
#        SELECT count(*) FROM public.audit_log
#        WHERE table_name = 'device_tokens'
#          AND action = 'INSERT'
#          AND occurred_at > now() - interval '5 minutes'
#      Condition : count > 100
#      Severity  : warning (potential credential stuffing / bot registration)
#
#    Rule: No Transactions (dead canary)
#      SQL:
#        SELECT count(*) FROM public.transactions
#        WHERE created_at > now() - interval '1 hour'
#      Condition : count = 0  (fires only during expected active hours)
#      Severity  : warning
#
# 6. Notification channels: configure under Alerting → Contact points.
#    Recommended: email (built-in), Slack webhook, or PagerDuty (all free integrations).
