// Pure date-validation utility shared across Edge Functions.

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Returns true iff s is a non-null, non-empty YYYY-MM-DD string. */
export function isIsoDate(s: string | null | undefined): boolean {
  return typeof s === "string" && s.length > 0 && ISO_DATE_RE.test(s);
}

/**
 * Parse the W3C `Authorization: Basic <base64(id:token)>` style header value
 * used for OTLP authentication into a key→value map.
 * Input format: "key1=val1,key2=val2"
 */
export function parseOtelHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx < 1) continue;
    const k = pair.slice(0, eqIdx).trim();
    const v = pair.slice(eqIdx + 1).trim();
    if (k && v) out[k] = v;
  }
  return out;
}

/**
 * Extract the `sub` claim from a JWT without verifying the signature.
 * Returns null on any parse failure. The Supabase gateway has already
 * verified the signature before Edge Functions run.
 */
export function extractJwtSub(bearer: string): string | null {
  if (!bearer.toLowerCase().startsWith("bearer ")) return null;
  try {
    const jwt = bearer.slice(7);
    const payloadB64 = jwt.split(".")[1];
    if (!payloadB64) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")),
          (c) => c.charCodeAt(0),
        ),
      ),
    );
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
