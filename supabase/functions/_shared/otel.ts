// Shared OpenTelemetry init for Supabase Edge Functions (Deno runtime).
//
// Behavior:
//   - If OTEL_EXPORTER_OTLP_ENDPOINT is set, spans are sent to that collector
//     (Grafana Cloud OTLP/HTTP). Otherwise spans are logged to stdout as JSON
//     and Supabase's function log pipeline captures them.
//   - Continues incoming traces via the W3C `traceparent` header so the mobile
//     app's trace_id flows end-to-end.
//
// Usage in a function entry point:
//
//   import { withTrace } from "../_shared/otel.ts";
//   Deno.serve((req) => withTrace("reports-monthly", req, async (span) => {
//     ...
//     return new Response(...);
//   }));

import { trace, context, propagation, SpanStatusCode } from "npm:@opentelemetry/api@1.9.0";
import { Resource } from "npm:@opentelemetry/resources@1.30.0";
import {
  BasicTracerProvider,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  BatchSpanProcessor,
} from "npm:@opentelemetry/sdk-trace-base@1.30.0";
import { OTLPTraceExporter } from "npm:@opentelemetry/exporter-trace-otlp-http@0.57.0";
import { W3CTraceContextPropagator } from "npm:@opentelemetry/core@1.30.0";
import {
  SemanticResourceAttributes,
} from "npm:@opentelemetry/semantic-conventions@1.30.0";
import { parseOtelHeaders, extractJwtSub } from "./utils.ts";

const SERVICE_NAME = Deno.env.get("OTEL_SERVICE_NAME") ?? "home-budgeting-backend";
const SERVICE_VERSION = Deno.env.get("OTEL_SERVICE_VERSION") ?? "0.2.0";
const OTLP_ENDPOINT = Deno.env.get("OTEL_EXPORTER_OTLP_ENDPOINT") ?? "";
const OTLP_HEADERS_RAW = Deno.env.get("OTEL_EXPORTER_OTLP_HEADERS") ?? "";

const provider = new BasicTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
    [SemanticResourceAttributes.SERVICE_VERSION]: SERVICE_VERSION,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]:
      Deno.env.get("DENO_DEPLOYMENT_ID") ? "production" : "local",
  }),
});

if (OTLP_ENDPOINT) {
  provider.addSpanProcessor(
    new BatchSpanProcessor(
      new OTLPTraceExporter({
        url: `${OTLP_ENDPOINT.replace(/\/$/, "")}/v1/traces`,
        headers: parseOtelHeaders(OTLP_HEADERS_RAW),
      }),
    ),
  );
} else {
  // Fallback: stdout. Supabase ships function stdout to its log pipeline.
  provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
}

provider.register({ propagator: new W3CTraceContextPropagator() });

const tracer = trace.getTracer(SERVICE_NAME, SERVICE_VERSION);

export interface TraceCallbackArgs {
  span: ReturnType<typeof tracer.startSpan>;
  userId: string | null;
}

/**
 * Wrap an Edge Function handler in a server span. Continues the W3C trace
 * from `traceparent` if present; otherwise starts a new trace.
 */
export async function withTrace(
  spanName: string,
  req: Request,
  handler: (args: TraceCallbackArgs) => Promise<Response>,
): Promise<Response> {
  const parentCtx = propagation.extract(context.active(), {
    traceparent: req.headers.get("traceparent") ?? "",
    tracestate: req.headers.get("tracestate") ?? "",
  });

  const span = tracer.startSpan(spanName, {
    attributes: {
      "http.method": req.method,
      "http.url": req.url,
      "http.user_agent": req.headers.get("user-agent") ?? "",
      "client.app_version": req.headers.get("x-app-version") ?? "",
      "client.platform": req.headers.get("x-client-platform") ?? "",
    },
  }, parentCtx);

  // Best-effort user attribution via shared extractJwtSub utility.
  // Signature verification is done by Supabase's gateway (verify_jwt = true).
  const userId = extractJwtSub(req.headers.get("authorization") ?? "");
  if (userId) span.setAttribute("user.id", userId);

  try {
    const res = await context.with(trace.setSpan(parentCtx, span), () =>
      handler({ span, userId }));
    span.setAttribute("http.status_code", res.status);
    if (res.status >= 500) {
      span.setStatus({ code: SpanStatusCode.ERROR });
    }
    return res;
  } catch (err) {
    span.recordException(err as Error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: (err as Error).message,
    });
    throw err;
  } finally {
    span.end();
  }
}

export { tracer };
