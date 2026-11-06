import type { RegistrationResponseJSON } from "@simplewebauthn/server";

import { publicRoute } from "@/lib/api/route";
import * as authApi from "@/lib/auth/contract";
import { claimVerifySchemas } from "@/lib/auth/schemas";
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

// POST /api/auth/claim/verify - attach the new device's passkey to the account
export const POST = publicRoute(
  authApi.claimVerify,
  claimVerifySchemas,
  async ({ body }) => {
    const { token, challengeToken, registrationResponse, deviceName } = body;

    const claim = await verifyClaimToken(token);
    if (!claim) return "invalidToken";

    const challenge = await verifyChallengeToken(challengeToken, {
      flow: "claim",
      userId: claim.userId,
      claimId: claim.claimId,
    });
    if (!challenge) return "invalidChallenge";

    // Consume the claim and register the passkey atomically. The claim is
    // consumed first via a single conditional UPDATE, so concurrent redemptions
    // cannot both proceed; if registration then fails, the transaction rolls
    // back the consume and the claim stays available for a retry.
    try {
      await db.transaction(async (tx) => {
        const consumed = await consumeClaim(tx, claim.claimId);
        if (!consumed) {
          throw new ClaimUnavailableError();
        }

        // Register the passkey on the SAME transaction, so if anything after
        // this (or this itself) throws, the credential insert rolls back
        // alongside the claim consumption -- no orphan credential can persist
        // while the claim reverts to active.
        await verifyAdditionalPasskeyRegistration(
          claim.userId,
          registrationResponse as unknown as RegistrationResponseJSON,
          challenge.challenge,
          deviceName,
          tx,
        );

        await tx.insert(activityFeed).values({
          userId: claim.userId,
          activityType: "claim_consumed",
          metadata: { claimId: claim.claimId },
        });
      });
    } catch (error) {
      if (error instanceof ClaimUnavailableError) return "notActive";
      throw error;
    }

    return { success: true as const };
  },
);
