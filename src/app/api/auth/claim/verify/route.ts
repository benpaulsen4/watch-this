import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import {
  verifyAdditionalPasskeyRegistration,
  verifyChallengeToken,
  verifyClaimToken,
} from "@/lib/auth/webauthn";
import { activityFeed, db , passkeyClaims } from "@/lib/db";

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

    const challenge = await verifyChallengeToken(challengeToken);
    if (!challenge) {
      return NextResponse.json({ error: "Invalid challenge" }, { status: 400 });
    }

    const claimRows = await db
      .select()
      .from(passkeyClaims)
      .where(eq(passkeyClaims.id, claim.claimId))
      .limit(1);

    if (claimRows.length === 0) {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }

    const claimRow = claimRows[0];
    if (claimRow.status !== "active") {
      return NextResponse.json({ error: "Claim not active" }, { status: 400 });
    }
    if (claimRow.expiresAt && claimRow.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "Claim expired" }, { status: 400 });
    }

    await verifyAdditionalPasskeyRegistration(
      claim.userId,
      registrationResponse,
      challenge.challenge,
      deviceName,
    );

    await db
      .update(passkeyClaims)
      .set({ status: "consumed", consumedAt: new Date() })
      .where(eq(passkeyClaims.id, claim.claimId));

    await db.insert(activityFeed).values({
      userId: claim.userId,
      activityType: "claim_consumed",
      metadata: { claimId: claim.claimId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Claim verify error:", error);
    return NextResponse.json(
      { error: "Failed to verify claim" },
      { status: 500 },
    );
  }
}
