// Tests for _shared/utils.ts — pure utility functions.
// No network, no Supabase, no OTel needed.

import { assertEquals } from "jsr:@std/assert@1";
import { isIsoDate, parseOtelHeaders, extractJwtSub } from "./utils.ts";

// ---------------------------------------------------------------------------
// isIsoDate
// ---------------------------------------------------------------------------

Deno.test("isIsoDate - valid dates", () => {
  assertEquals(isIsoDate("2026-01-15"), true);
  assertEquals(isIsoDate("2000-12-31"), true);
  assertEquals(isIsoDate("1999-01-01"), true);
});

Deno.test("isIsoDate - invalid formats", () => {
  assertEquals(isIsoDate("26-01-15"), false);      // 2-digit year
  assertEquals(isIsoDate("2026/01/15"), false);     // wrong separator
  assertEquals(isIsoDate("2026-1-5"), false);       // no zero-padding
  assertEquals(isIsoDate("20260115"), false);       // no separator
  assertEquals(isIsoDate("not-a-date"), false);
  assertEquals(isIsoDate(""), false);
});

Deno.test("isIsoDate - null and undefined", () => {
  assertEquals(isIsoDate(null), false);
  assertEquals(isIsoDate(undefined), false);
});

// ---------------------------------------------------------------------------
// parseOtelHeaders
// ---------------------------------------------------------------------------

Deno.test("parseOtelHeaders - single key=value pair", () => {
  assertEquals(parseOtelHeaders("Authorization=Basic abc123"), {
    Authorization: "Basic abc123",
  });
});

Deno.test("parseOtelHeaders - multiple pairs", () => {
  assertEquals(parseOtelHeaders("k1=v1,k2=v2,k3=v3"), {
    k1: "v1",
    k2: "v2",
    k3: "v3",
  });
});

Deno.test("parseOtelHeaders - value containing = sign", () => {
  // Values like base64 strings contain = padding — only split on first =
  const result = parseOtelHeaders("Authorization=Basic dXNlcjpwYXNz==");
  assertEquals(result["Authorization"], "Basic dXNlcjpwYXNz==");
});

Deno.test("parseOtelHeaders - empty string returns empty object", () => {
  assertEquals(parseOtelHeaders(""), {});
});

Deno.test("parseOtelHeaders - trims whitespace around key and value", () => {
  assertEquals(parseOtelHeaders("  key  =  val  "), { key: "val" });
});

Deno.test("parseOtelHeaders - skips malformed pairs without = sign", () => {
  assertEquals(parseOtelHeaders("noequals,k=v"), { k: "v" });
});

// ---------------------------------------------------------------------------
// extractJwtSub
// ---------------------------------------------------------------------------

// JWT with payload {"sub": "user-abc-123", "exp": 9999999999}
// Header: eyJhbGciOiJIUzI1NiJ9
// Payload (base64url of JSON above)
// Signature: fakesig (not verified)
const VALID_JWT =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiAidXNlci1hYmMtMTIzIiwgImV4cCI6IDk5OTk5OTk5OTl9.fakesig";

Deno.test("extractJwtSub - extracts sub from valid bearer token", () => {
  assertEquals(extractJwtSub(`Bearer ${VALID_JWT}`), "user-abc-123");
});

Deno.test("extractJwtSub - case-insensitive bearer prefix", () => {
  assertEquals(extractJwtSub(`bearer ${VALID_JWT}`), "user-abc-123");
  assertEquals(extractJwtSub(`BEARER ${VALID_JWT}`), "user-abc-123");
});

Deno.test("extractJwtSub - returns null when no bearer prefix", () => {
  assertEquals(extractJwtSub(VALID_JWT), null);
  assertEquals(extractJwtSub(""), null);
});

Deno.test("extractJwtSub - returns null for malformed JWT", () => {
  assertEquals(extractJwtSub("Bearer notajwt"), null);
  assertEquals(extractJwtSub("Bearer a.b"), null);          // missing signature part is ok but payload b is invalid base64
});

Deno.test("extractJwtSub - returns null when payload has no sub claim", () => {
  // Build a JWT with no sub: {"role":"anon"}
  const noSubPayload = btoa(JSON.stringify({ role: "anon" }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const jwt = `eyJhbGciOiJIUzI1NiJ9.${noSubPayload}.fakesig`;
  assertEquals(extractJwtSub(`Bearer ${jwt}`), null);
});

Deno.test("extractJwtSub - returns null when sub is not a string", () => {
  const payload = btoa(JSON.stringify({ sub: 42 }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  const jwt = `eyJhbGciOiJIUzI1NiJ9.${payload}.fakesig`;
  assertEquals(extractJwtSub(`Bearer ${jwt}`), null);
});
