import { eq } from "drizzle-orm";

import { publicRoute } from "@/lib/api/route";
import * as authApi from "@/lib/auth/contract";
import { claimBeginSchemas } from "@/lib/auth/schemas";
import {
  createChallengeToken,
  generateAdditionalPasskeyRegistrationOptions,
  verifyClaimToken,
} from "@/lib/auth/webauthn";
import { db, passkeyClaims } from "@/lib/db";

// GET /api/auth/claim/begin?token=... - registration options for a passkey on
// a new device, from a claim link
export const GET = publicRoute(
  authApi.claimBegin,
  claimBeginSchemas,
  async ({ query: { token } }) => {
    const verified = await verifyClaimToken(token);
    if (!verified) return "invalidToken";

    const claimRows = await db
      .select()
      .from(passkeyClaims)
      .where(eq(passkeyClaims.id, verified.claimId))
      .limit(1);

    const claim = claimRows[0];
    if (!claim) return "notFound";
    if (claim.status !== "active") return "notActive";
    if (claim.expiresAt && claim.expiresAt.getTime() < Date.now()) {
      return "expired";
    }

    const options = await generateAdditionalPasskeyRegistrationOptions(
      verified.userId,
    );
    const challengeToken = await createChallengeToken(options.challenge, {
      flow: "claim",
      userId: verified.userId,
      claimId: verified.claimId,
    });

    return { options, challengeToken };
  },
);
