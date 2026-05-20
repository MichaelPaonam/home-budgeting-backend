// Pure validation logic for the bulk-import endpoint.
// Extracted here so it can be unit-tested without any Supabase/OTel setup.

export interface TxnInput {
  client_uuid: string;
  account_id: string;
  category_id?: string | null;
  amount: number;
  kind: "expense" | "income" | "transfer";
  currency: string;
  occurred_on: string;
  note?: string | null;
}

export const MAX_BATCH = 500;
const KIND_VALUES = new Set(["expense", "income", "transfer"]);
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type ValidationResult =
  | { ok: true; rows: TxnInput[] }
  | { ok: false; error: string };

export function validateTransactions(rows: unknown): ValidationResult {
  if (!Array.isArray(rows)) return { ok: false, error: "transactions must be an array" };
  if (rows.length === 0) return { ok: false, error: "transactions is empty" };
  if (rows.length > MAX_BATCH) return { ok: false, error: `max ${MAX_BATCH} rows per request` };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] as Partial<TxnInput>;
    if (!r || typeof r !== "object") return { ok: false, error: `row ${i}: not an object` };
    if (typeof r.client_uuid !== "string") return { ok: false, error: `row ${i}: client_uuid required` };
    if (typeof r.account_id !== "string") return { ok: false, error: `row ${i}: account_id required` };
    if (typeof r.amount !== "number" || !(r.amount >= 0)) return { ok: false, error: `row ${i}: amount must be >= 0` };
    if (typeof r.kind !== "string" || !KIND_VALUES.has(r.kind)) return { ok: false, error: `row ${i}: invalid kind` };
    if (typeof r.currency !== "string" || r.currency.length !== 3) return { ok: false, error: `row ${i}: currency must be 3 chars` };
    if (typeof r.occurred_on !== "string" || !ISO_DATE.test(r.occurred_on)) {
      return { ok: false, error: `row ${i}: occurred_on must be YYYY-MM-DD` };
    }
  }
  return { ok: true, rows: rows as TxnInput[] };
}
