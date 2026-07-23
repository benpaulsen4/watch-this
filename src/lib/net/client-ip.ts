import { ipAddress } from "@vercel/functions";

/**
 * Resolve the client IP for use as a **security control** (e.g. a rate-limit
 * bucket key).
 *
 * SECURITY: we deliberately do NOT parse `x-forwarded-for`. That header is a
 * proxy-appended chain whose left-most entry is fully client-controlled, so
 * keying a limiter on it lets an attacker mint a fresh bucket per request by
 * rotating a forged value -- defeating the limit entirely (and this holds even
 * with a durable/Redis store).
 *
 * `ipAddress()` reads `x-real-ip`, which Vercel sets at its edge and controls
 * (a client-supplied value is overwritten before the request reaches us), so it
 * is not forgeable in production. Next 16 removed `request.ip`, so this is the
 * supported way to get it.
 *
 * When it is unavailable (local/non-Vercel dev), we fall back to a single FIXED
 * key rather than any client-supplied value: rate-limit precision does not
 * matter in dev, but the key must never be rotatable via a header. All dev
 * traffic then shares one bucket, which is the safe failure mode.
 */
export function getClientIp(request: Request): string {
  return ipAddress(request) ?? "unknown";
}
