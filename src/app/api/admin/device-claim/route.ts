import { timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

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

export async function POST(request: NextRequest) {
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { username, userId } = body || {};
    if (!username && !userId) {
      return NextResponse.json(
        { error: "username or userId required" },
        { status: 400 },
      );
    }

    let targetUserId = userId as string | undefined;
    if (!targetUserId && username) {
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);
      if (rows.length === 0) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }
      targetUserId = rows[0].id;
    }

    const res = await initiateClaim(targetUserId!, "admin");
    if (res === "maxDevices") {
      console.warn("Admin device-claim: max devices reached", {
        ip,
        targetUserId,
      });
      return NextResponse.json(
        { error: "Maximum devices reached" },
        { status: 400 },
      );
    }
    if (res === "rateLimit") {
      console.warn("Admin device-claim: rate limit reached", {
        ip,
        targetUserId,
      });
      return NextResponse.json(
        { error: "Too many claims for this user, try again later" },
        { status: 429 },
      );
    }

    // Log every successful issuance for auditing.
    console.info("Admin device-claim: issued", {
      ip,
      targetUserId,
      claimId: res.claimId,
    });

    return NextResponse.json(res);
  } catch (error) {
    console.error("Admin device claim error:", { ip, error });
    return NextResponse.json(
      { error: "Failed to create device claim" },
      { status: 500 },
    );
  }
}
