// POST /transactions-bulk-import
// Body: { transactions: TxnInput[] }
// TxnInput shape: {
//   client_uuid: string (required, idempotency key per row),
//   account_id: uuid,
//   category_id?: uuid,
//   amount: number,
//   kind: 'expense'|'income'|'transfer',
//   currency: string (3-letter),
//   occurred_on: 'YYYY-MM-DD',
//   note?: string
// }
//
// Idempotency: rows are upserted on (user_id, client_uuid). Re-running the
// same payload is safe.

import { withTrace } from "../_shared/otel.ts";
import { userClient, unauthorized, badRequest, ok, serverError } from "../_shared/auth.ts";
import { validateTransactions } from "../_shared/validate.ts";
import type { TxnInput } from "../_shared/validate.ts";

Deno.serve((req) =>
  withTrace("transactions-bulk-import", req, async ({ span, userId }) => {
    if (!userId) return unauthorized();
    if (req.method !== "POST") return badRequest("POST only");

    let body: { transactions?: unknown };
    try {
      body = await req.json();
    } catch {
      return badRequest("invalid JSON");
    }

    const validation = validateTransactions(body.transactions);
    if (!validation.ok) return badRequest(validation.error);

    span.setAttribute("import.row_count", validation.rows.length);

    const supabase = userClient(req);
    const payload = validation.rows.map((r) => ({
      ...r,
      user_id: userId, // RLS check enforces equality, but explicit is clearer
    }));

    const { data, error } = await supabase
      .from("transactions")
      .upsert(payload, { onConflict: "user_id,client_uuid" })
      .select("id, client_uuid");

    if (error) {
      span.recordException(error as unknown as Error);
      return serverError(error.message);
    }

    return ok({ imported: data?.length ?? 0, ids: data ?? [] });
  })
);
