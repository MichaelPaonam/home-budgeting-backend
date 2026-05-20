// Tests for _shared/validate.ts — validateTransactions() covers all branches.

import { assertEquals } from "jsr:@std/assert@1";
import { validateTransactions, MAX_BATCH } from "./validate.ts";

// Minimal valid row factory
function row(overrides: Record<string, unknown> = {}) {
  return {
    client_uuid: "550e8400-e29b-41d4-a716-446655440000",
    account_id: "660e8400-e29b-41d4-a716-446655440001",
    amount: 42.50,
    kind: "expense",
    currency: "USD",
    occurred_on: "2026-05-20",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

Deno.test("validateTransactions - accepts a single valid expense row", () => {
  const result = validateTransactions([row()]);
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.rows.length, 1);
});

Deno.test("validateTransactions - accepts income and transfer kinds", () => {
  const r1 = validateTransactions([row({ kind: "income" })]);
  assertEquals(r1.ok, true);
  const r2 = validateTransactions([row({ kind: "transfer" })]);
  assertEquals(r2.ok, true);
});

Deno.test("validateTransactions - accepts zero amount", () => {
  const result = validateTransactions([row({ amount: 0 })]);
  assertEquals(result.ok, true);
});

Deno.test("validateTransactions - accepts optional nullable fields", () => {
  const result = validateTransactions([row({ category_id: null, note: null })]);
  assertEquals(result.ok, true);
});

Deno.test("validateTransactions - accepts batch at MAX_BATCH limit", () => {
  const rows = Array.from({ length: MAX_BATCH }, (_, i) =>
    row({ client_uuid: `uuid-${i}` }));
  const result = validateTransactions(rows);
  assertEquals(result.ok, true);
});

// ---------------------------------------------------------------------------
// Top-level failures
// ---------------------------------------------------------------------------

Deno.test("validateTransactions - rejects non-array input", () => {
  for (const bad of [null, undefined, {}, "string", 42]) {
    const result = validateTransactions(bad);
    assertEquals(result.ok, false);
    if (!result.ok) assertEquals(result.error, "transactions must be an array");
  }
});

Deno.test("validateTransactions - rejects empty array", () => {
  const result = validateTransactions([]);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.error, "transactions is empty");
});

Deno.test("validateTransactions - rejects batch exceeding MAX_BATCH", () => {
  const rows = Array.from({ length: MAX_BATCH + 1 }, (_, i) =>
    row({ client_uuid: `uuid-${i}` }));
  const result = validateTransactions(rows);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.error, `max ${MAX_BATCH} rows per request`);
});

// ---------------------------------------------------------------------------
// Per-row field validation — errors include row index
// ---------------------------------------------------------------------------

Deno.test("validateTransactions - rejects non-object row", () => {
  const result = validateTransactions(["not-an-object"]);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.error, "row 0: not an object");
});

Deno.test("validateTransactions - rejects missing client_uuid", () => {
  const r = row();
  delete (r as Record<string, unknown>).client_uuid;
  const result = validateTransactions([r]);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.error, "row 0: client_uuid required");
});

Deno.test("validateTransactions - rejects missing account_id", () => {
  const r = row();
  delete (r as Record<string, unknown>).account_id;
  const result = validateTransactions([r]);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.error, "row 0: account_id required");
});

Deno.test("validateTransactions - rejects negative amount", () => {
  const result = validateTransactions([row({ amount: -1 })]);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.error, "row 0: amount must be >= 0");
});

Deno.test("validateTransactions - rejects string amount", () => {
  const result = validateTransactions([row({ amount: "10" })]);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.error, "row 0: amount must be >= 0");
});

Deno.test("validateTransactions - rejects invalid kind", () => {
  const result = validateTransactions([row({ kind: "refund" })]);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.error, "row 0: invalid kind");
});

Deno.test("validateTransactions - rejects 2-letter currency", () => {
  const result = validateTransactions([row({ currency: "US" })]);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.error, "row 0: currency must be 3 chars");
});

Deno.test("validateTransactions - rejects 4-letter currency", () => {
  const result = validateTransactions([row({ currency: "USDT" })]);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.error, "row 0: currency must be 3 chars");
});

Deno.test("validateTransactions - rejects non-ISO date", () => {
  for (const bad of ["20-05-2026", "2026/05/20", "not-a-date", ""]) {
    const result = validateTransactions([row({ occurred_on: bad })]);
    assertEquals(result.ok, false, `expected failure for occurred_on="${bad}"`);
    if (!result.ok) assertEquals(result.error, "row 0: occurred_on must be YYYY-MM-DD");
  }
});

Deno.test("validateTransactions - error points to correct row index", () => {
  const rows = [row({ client_uuid: "a" }), row({ client_uuid: "b" }), row({ kind: "bad" })];
  const result = validateTransactions(rows);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.error, "row 2: invalid kind");
});
