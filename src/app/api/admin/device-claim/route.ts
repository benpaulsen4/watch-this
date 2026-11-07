import { timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";

import { invalidInput, publicRoute } from "@/lib/api/route";
import * as authApi from "@/lib/auth/contract";
import { adminDeviceClaimBody } from "@/lib/auth/schemas";
import { db, users } from "@/lib/db";
import { getClientIp } from "@/lib/net/client-ip";
import { initiateClaim } from "@/lib/profile/devices/service";

// Constant-time secret comparison that does not leak via early return or via
// timing correlated with how many leading characters match. When lengths
// differ we still run a fixed comparison so timing stays independent of the
// mismatch position, then fail.
function secretsMatch(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (providedBuf.length !== expectedBuf.length) {
    timingSafeEqual(expectedBuf, expectedBuf);
    return false;
  }
  return timingSafeEqual(providedBuf, expectedBuf);
}

// POST /api/admin/device-claim - issue a passkey claim for a user, authorized
// by the `x-admin-secret` header. The secret is checked before the body is
// read, so an unauthorized caller learns nothing about the expected input and
// every failed attempt is logged; that is why the body has no contract schema.
export const POST = publicRoute(
  authApi.adminDeviceClaim,
  {},
  async ({ request }) => {
    const ip = getClientIp(request);
    try {
      const secretHeader = request.headers.get("x-admin-secret");
      const adminSecret = process.env.ADMIN_API_SECRET;

      // Fail closed when the admin secret is not configured, and use a
      // constant-time comparison otherwise.
      const authorized =
        !!adminSecret &&
        !!secretHeader &&
        secretsMatch(secretHeader, adminSecret);

      if (!authorized) {
        // Log every failed attempt for auditing (never log the secret itself).
        console.warn("Admin device-claim: unauthorized attempt", {
          ip,
          secretConfigured: !!adminSecret,
          secretProvided: !!secretHeader,
        });
        return "unauthorized";
      }

      let json: unknown;
      try {
        json = await request.json();
      } catch {
        json = undefined;
      }
      const parsed = adminDeviceClaimBody.safeParse(json ?? {});
      if (!parsed.success) return invalidInput(parsed.error);
      const { username, userId } = parsed.data;

      let targetUserId = userId;
      if (!targetUserId && username) {
        const rows = await db
          .select()
          .from(users)
          .where(eq(users.username, username))
          .limit(1);
        const row = rows[0];
        if (!row) return "notFound";
        targetUserId = row.id;
      }

      const res = await initiateClaim(targetUserId!, "admin");
      if (res === "maxDevices") {
        console.warn("Admin device-claim: max devices reached", {
          ip,
          targetUserId,
        });
        return "maxDevices";
      }
      if (res === "rateLimit") {
        console.warn("Admin device-claim: rate limit reached", {
          ip,
          targetUserId,
        });
        return "rateLimit";
      }

      // Log every successful issuance for auditing.
      console.info("Admin device-claim: issued", {
        ip,
        targetUserId,
        claimId: res.claimId,
      });

      return res;
    } catch (error) {
      // Kept for the audit trail: the wrapper logs the error, but not the IP.
      console.error("Admin device claim error:", { ip, error });
      throw error;
    }
  },
);
