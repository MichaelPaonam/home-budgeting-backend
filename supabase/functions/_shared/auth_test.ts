// Tests for _shared/auth.ts response helpers.
// These are pure functions — no Supabase connection needed.

import { assertEquals } from "jsr:@std/assert@1";
import { unauthorized, badRequest, serverError, ok } from "./auth.ts";

Deno.test("unauthorized - default message and status", async () => {
  const res = unauthorized();
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body, { error: "Unauthorized" });
});

Deno.test("unauthorized - custom message", async () => {
  const res = unauthorized("Token expired");
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body, { error: "Token expired" });
});

Deno.test("unauthorized - content-type is application/json", () => {
  const res = unauthorized();
  assertEquals(res.headers.get("content-type"), "application/json");
});

Deno.test("badRequest - status 400 with provided message", async () => {
  const res = badRequest("missing field");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body, { error: "missing field" });
});

Deno.test("badRequest - content-type is application/json", () => {
  const res = badRequest("x");
  assertEquals(res.headers.get("content-type"), "application/json");
});

Deno.test("serverError - default message and status 500", async () => {
  const res = serverError();
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body, { error: "Internal error" });
});

Deno.test("serverError - custom message", async () => {
  const res = serverError("DB down");
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body, { error: "DB down" });
});

Deno.test("ok - status 200 by default with JSON body", async () => {
  const res = ok({ rows: [1, 2, 3] });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body, { rows: [1, 2, 3] });
});

Deno.test("ok - content-type is application/json", () => {
  const res = ok({});
  assertEquals(res.headers.get("content-type"), "application/json");
});

Deno.test("ok - respects custom status via ResponseInit", async () => {
  const res = ok({ imported: 5 }, { status: 201 });
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body, { imported: 5 });
});

Deno.test("ok - merges extra headers with content-type", () => {
  const res = ok({}, { headers: { "x-request-id": "abc" } });
  assertEquals(res.headers.get("x-request-id"), "abc");
  assertEquals(res.headers.get("content-type"), "application/json");
});
