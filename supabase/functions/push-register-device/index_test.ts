// Tests for the push-register-device Edge Function handler.
//
// Same inline-handler strategy as reports-monthly tests: we test the
// routing/validation layer without real OTel or Supabase connections.

import { assertEquals } from "jsr:@std/assert@1";
import { unauthorized, badRequest, ok, serverError } from "../_shared/auth.ts";

// ---------------------------------------------------------------------------
// Inline handler (mirrors index.ts logic)
// ---------------------------------------------------------------------------

async function pushRegisterHandler(
  req: Request,
  userId: string | null,
  dbError: { message: string } | null = null,
): Promise<Response> {
  if (!userId) return unauthorized();
  if (req.method !== "POST") return badRequest("POST only");

  let body: { platform?: unknown; token?: unknown; app_version?: unknown };
  try {
    body = await req.json();
  } catch {
    return badRequest("invalid JSON");
  }

  if (body.platform !== "ios" && body.platform !== "android") {
    return badRequest("platform must be 'ios' or 'android'");
  }
  if (typeof body.token !== "string" || (body.token as string).length < 10) {
    return badRequest("token required");
  }

  if (dbError) return serverError(dbError.message);
  return ok({ registered: true });
}

function post(body: unknown): Request {
  return new Request("http://localhost/push-register-device", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_TOKEN = "a".repeat(64); // 64-char APNs-style token

// ---------------------------------------------------------------------------
// Auth checks
// ---------------------------------------------------------------------------

Deno.test("push-register-device: 401 when userId is null", async () => {
  const req = post({ platform: "ios", token: VALID_TOKEN });
  const res = await pushRegisterHandler(req, null);
  assertEquals(res.status, 401);
});

// ---------------------------------------------------------------------------
// Method checks
// ---------------------------------------------------------------------------

Deno.test("push-register-device: 400 on GET", async () => {
  const req = new Request("http://localhost/push-register-device", { method: "GET" });
  const res = await pushRegisterHandler(req, "user-1");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "POST only");
});

// ---------------------------------------------------------------------------
// Platform validation
// ---------------------------------------------------------------------------

Deno.test("push-register-device: 400 on unknown platform", async () => {
  const req = post({ platform: "windows", token: VALID_TOKEN });
  const res = await pushRegisterHandler(req, "user-1");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "platform must be 'ios' or 'android'");
});

Deno.test("push-register-device: 400 on missing platform", async () => {
  const req = post({ token: VALID_TOKEN });
  const res = await pushRegisterHandler(req, "user-1");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "platform must be 'ios' or 'android'");
});

// ---------------------------------------------------------------------------
// Token validation
// ---------------------------------------------------------------------------

Deno.test("push-register-device: 400 when token too short (< 10 chars)", async () => {
  const req = post({ platform: "ios", token: "short" });
  const res = await pushRegisterHandler(req, "user-1");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "token required");
});

Deno.test("push-register-device: 400 when token is missing", async () => {
  const req = post({ platform: "android" });
  const res = await pushRegisterHandler(req, "user-1");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "token required");
});

Deno.test("push-register-device: 400 when token is not a string", async () => {
  const req = post({ platform: "ios", token: 12345678901 });
  const res = await pushRegisterHandler(req, "user-1");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "token required");
});

// ---------------------------------------------------------------------------
// Invalid JSON
// ---------------------------------------------------------------------------

Deno.test("push-register-device: 400 on invalid JSON body", async () => {
  const req = new Request("http://localhost/push-register-device", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not valid json",
  });
  const res = await pushRegisterHandler(req, "user-1");
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "invalid JSON");
});

// ---------------------------------------------------------------------------
// Happy paths
// ---------------------------------------------------------------------------

Deno.test("push-register-device: 200 with ios platform", async () => {
  const req = post({ platform: "ios", token: VALID_TOKEN });
  const res = await pushRegisterHandler(req, "user-1");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body, { registered: true });
});

Deno.test("push-register-device: 200 with android platform", async () => {
  const req = post({ platform: "android", token: VALID_TOKEN });
  const res = await pushRegisterHandler(req, "user-1");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body, { registered: true });
});

Deno.test("push-register-device: 200 with optional app_version", async () => {
  const req = post({ platform: "ios", token: VALID_TOKEN, app_version: "1.2.3" });
  const res = await pushRegisterHandler(req, "user-1");
  assertEquals(res.status, 200);
});

// ---------------------------------------------------------------------------
// DB error propagation
// ---------------------------------------------------------------------------

Deno.test("push-register-device: 500 when DB returns error", async () => {
  const req = post({ platform: "ios", token: VALID_TOKEN });
  const res = await pushRegisterHandler(req, "user-1", { message: "unique violation" });
  assertEquals(res.status, 500);
  const body = await res.json();
  assertEquals(body.error, "unique violation");
});
