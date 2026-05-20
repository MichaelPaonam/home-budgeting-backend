// GET /reports-monthly?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Thin wrapper over v_monthly_by_category. Exists as an Edge Function (rather
// than relying on the auto-exposed view) so we can attach OTel spans, validate
// inputs, and shape the response for the mobile client.

import { withTrace } from "../_shared/otel.ts";
import { userClient, unauthorized, badRequest, ok, serverError } from "../_shared/auth.ts";
import { isIsoDate } from "../_shared/utils.ts";

Deno.serve((req) =>
  withTrace("reports-monthly", req, async ({ span, userId }) => {
    if (!userId) return unauthorized();
    if (req.method !== "GET") return badRequest("GET only");

    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (from && !isIsoDate(from)) return badRequest("invalid `from`");
    if (to && !isIsoDate(to)) return badRequest("invalid `to`");

    span.setAttribute("report.from", from ?? "");
    span.setAttribute("report.to", to ?? "");

    const supabase = userClient(req);
    let q = supabase
      .from("v_monthly_by_category")
      .select("month, category_id, category_name, category_kind, currency, total, txn_count")
      .order("month", { ascending: false });

    if (from) q = q.gte("month", from);
    if (to) q = q.lte("month", to);

    const { data, error } = await q;
    if (error) {
      span.recordException(error as unknown as Error);
      return serverError(error.message);
    }

    span.setAttribute("report.row_count", data?.length ?? 0);
    return ok({ rows: data ?? [] });
  })
);
