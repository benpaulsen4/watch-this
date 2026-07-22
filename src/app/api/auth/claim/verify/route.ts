import { NextRequest, NextResponse } from "next/server";

import {
  verifyAdditionalPasskeyRegistration,
  verifyChallengeToken,
  verifyClaimToken,
} from "@/lib/auth/webauthn";
import { activityFeed, db } from "@/lib/db";
import { consumeClaim } from "@/lib/profile/devices/service";

// Thrown when the claim could not be atomically consumed (already
// consumed/cancelled/expired), to roll back the surrounding transaction.
class ClaimUnavailableError extends Error {}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, challengeToken, registrationResponse, deviceName } =
      body || {};

    if (!token || !challengeToken || !registrationResponse) {
      return NextResponse.json(
        { error: "Missing parameters" },
        { status: 400 },
      );
    }

    const claim = await verifyClaimToken(token);
    if (!claim) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const challenge = await verifyChallengeToken(challengeToken, {
      flow: "claim",
      userId: claim.userId,
      claimId: claim.claimId,
    });
    if (!challenge) {
      return NextResponse.json({ error: "Invalid challenge" }, { status: 400 });
    }

    // Consume the claim and register the passkey atomically. The claim is
    // consumed first via a single conditional UPDATE, so concurrent redemptions
    // cannot both proceed; if registration then fails, the transaction rolls
    // back the consume and the claim stays available for a retry.
    await db.transaction(async (tx) => {
      const consumed = await consumeClaim(tx, claim.claimId);
      if (!consumed) {
        throw new ClaimUnavailableError();
      }

      await verifyAdditionalPasskeyRegistration(
        claim.userId,
        registrationResponse,
        challenge.challenge,
        deviceName,
      );

      await tx.insert(activityFeed).values({
        userId: claim.userId,
        activityType: "claim_consumed",
        metadata: { claimId: claim.claimId },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ClaimUnavailableError) {
      return NextResponse.json(
        { error: "Claim not active" },
        { status: 400 },
      );
    }
    console.error("Claim verify error:", error);
    return NextResponse.json(
      { error: "Failed to verify claim" },
      { status: 500 },
    );
  }
}
