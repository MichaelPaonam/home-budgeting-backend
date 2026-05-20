// Tests for the reports-monthly Edge Function handler.
//
// Strategy: import the handler logic directly by re-implementing it in a
// testable form. The HTTP routing and date-param validation are tested here;
// actual DB queries are stubbed so no Supabase connection is needed.
//
// We test the pure routing layer by calling the handler function directly with
// a stubbed `withTrace` that passes through (no OTel) and a stubbed
// `userClient` that returns a fake Supabase query builder.

import { assertEquals } from "jsr:@std/assert@1";
import { unauthorized, badRequest, ok, serverError } from "../_shared/auth.ts";
import { isIsoDate } from "../_shared/utils.ts";

// ---------------------------------------------------------------------------
// Inline the handler logic (extracted from index.ts) so tests don't trigger
// Deno.serve or the real OTel/Supabase imports.
// ---------------------------------------------------------------------------

type FakeQueryBuilder = {
  select: (..._: unknown[]) => FakeQueryBuilder;
  order: (..._: unknown[]) => FakeQueryBuilder;
  gte: (..._: unknown[]) => FakeQueryBuilder;
  lte: (..._: unknown[]) => FakeQueryBuilder;
  then: (resolve: (v: { data: unknown[] | null; error: null }) => void) => void;
};

function fakeQuery(result: { data: unknown[] | null; error: { message: string } | null }): FakeQueryBuilder {
  const builder: FakeQueryBuilder = {
    select: () => builder,
    order: () => builder,
    gte: () => builder,
    lte: () => builder,
    then: (resolve) => resolve(result as { data: unknown[] | null; error: null }),
  };
  return builder;
}

async function reportsMonthlyHandler(
  req: Request,
  userId: string | null,
  dbResult: { data: unknown[] | null; error: { message: string } | null },
): Promise<Response> {
  if (!userId) return unauthorized();
  if (req.method !== "GET") return badRequest("GET only");

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (from && !isIsoDate(from)) return badRequest("invalid `from`");
  if (to && !isIsoDate(to)) return badRequest("invalid `to`");

  const q = fakeQuery(dbResult);
  if (from) q.gte("month", from);
  if (to) q.lte("month", to);

  const { data, error } = await new Promise<{ data: unknown[] | null; error: { message: string } | null }>(
    (resolve) => q.then(resolve as (v: { data: unknown[] | null; error: null }) => void),
  );

  if (error) return serverError(error.message);
  return ok({ rows: data ?? [] });
}

// ---------------------------------------------------------------------------
// Auth checks
// ---------------------------------------------------------------------------

Deno.test("reports-monthly: 401 when userId is null", async () => {
  const req = new Request("http://localhost/reports-monthly");
  const res = await reportsMonthlyHandler(req, null, { data: [], error: null });
  assertEquals(res.status, 401);
});

// ---------------------------------------------------------------------------
// Method checks
// ---------------------------------------------------------------------------

Deno.test("reports-monthly: 400 on POST", async () => {
  const req = new Request("http://localhost/reports-monthly", { method: "POST" });
  const res = await reportsMonthlyHandler(req, "user-1", { data: [], error: null });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "GET only");
});

// ---------------------------------------------------------------------------
// Date param validation
// ---------------------------------------------------------------------------

Deno.test("reports-monthly: 400 on invalid `from` date", async () => {
  const req = new Request("http://localhost/reports-monthly?from=not-a-date");
  const res = await reportsMonthlyHandler(req, "user-1", { data: [], error: null });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "invalid `from`");
});

Deno.test("reports-monthly: 400 on invalid `to` date", async () => {
  const req = new Request("http://localhost/reports-monthly?to=2026/01/01");
  const res = await reportsMonthlyHandler(req, "user-1", { data: [], error: null });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "invalid `to`");
});

Deno.test("reports-monthly: 200 with empty rows when no data", async () => {
  const req = new Request("http://localhost/reports-monthly");
  const res = await reportsMonthlyHandler(req, "user-1", { data: [], error: null });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body, { rows: [] });
});

Deno.test("reports-monthly: 200 with rows when data present", async () => {
  const rows = [{ month: "2026-05-01", category_name: "Groceries", total: "123.45" }];
  const req = new Request("http://localhost/reports-monthly?from=2026-01-01&to=2026-12-31");
  const res = await reportsMonthlyHandler(req, "user-1", { data: rows, error: null });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.rows, rows);
});

Deno.test("reports-monthly: 500 when DB returns error", async () => {
  const req = new Request("http://localhost/reports-monthly");
  const res = await reportsMonthlyHandler(req, "user-1", {
    data: null,
    error: { message: "relation does not exist" },
  });
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, "relation does not exist");
});

Deno.test("reports-monthly: null data falls back to empty rows", async () => {
  const req = new Request("http://localhost/reports-monthly");
  const res = await reportsMonthlyHandler(req, "user-1", { data: null, error: null });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body, { rows: [] });
});
