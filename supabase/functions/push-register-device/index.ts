// POST /push-register-device
// Body: { platform: 'ios'|'android', token: string, app_version?: string }
//
// Stores or refreshes a device token for push delivery. Re-registration
// rebinds the (platform, token) pair to the current user — handles the case
// where a user signs out on device A and a different user signs in on the
// same device.

import { withTrace } from "../_shared/otel.ts";
import { userClient, unauthorized, badRequest, ok, serverError } from "../_shared/auth.ts";

interface RegisterBody {
  platform: "ios" | "android";
  token: string;
  app_version?: string;
}

Deno.serve((req) =>
  withTrace("push-register-device", req, async ({ span, userId }) => {
    if (!userId) return unauthorized();
    if (req.method !== "POST") return badRequest("POST only");

    let body: Partial<RegisterBody>;
    try {
      body = await req.json();
    } catch {
      return badRequest("invalid JSON");
    }

    if (body.platform !== "ios" && body.platform !== "android") {
      return badRequest("platform must be 'ios' or 'android'");
    }
    if (typeof body.token !== "string" || body.token.length < 10) {
      return badRequest("token required");
    }

    span.setAttribute("device.platform", body.platform);

    const supabase = userClient(req);
    const { error } = await supabase
      .from("device_tokens")
      .upsert(
        {
          user_id: userId,
          platform: body.platform,
          token: body.token,
          app_version: body.app_version ?? null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "platform,token" },
      );

    if (error) {
      span.recordException(error as unknown as Error);
      return serverError(error.message);
    }

    return ok({ registered: true });
  })
);
