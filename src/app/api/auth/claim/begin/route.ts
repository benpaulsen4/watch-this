import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { passkeyClaims } from "@/lib/db";
import { eq } from "drizzle-orm";
import {
  verifyClaimToken,
  createChallengeToken,
  generateAdditionalPasskeyRegistrationOptions,
} from "@/lib/auth/webauthn";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const verified = await verifyClaimToken(token);
    if (!verified) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const claimRows = await db
      .select()
      .from(passkeyClaims)
      .where(eq(passkeyClaims.id, verified.claimId))
      .limit(1);

    if (claimRows.length === 0) {
      return NextResponse.json({ error: "Claim not found" }, { status: 404 });
    }

    const claim = claimRows[0];
    if (claim.status !== "active") {
      return NextResponse.json({ error: "Claim not active" }, { status: 400 });
    }
    if (claim.expiresAt && claim.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: "Claim expired" }, { status: 400 });
    }

    const options = await generateAdditionalPasskeyRegistrationOptions(
      verified.userId
    );
    const challengeToken = await createChallengeToken(options.challenge);

    return NextResponse.json({ options, challengeToken });
  } catch (error) {
    console.error("Claim begin error:", error);
    return NextResponse.json(
      { error: "Failed to begin claim" },
      { status: 500 }
    );
  }
}
