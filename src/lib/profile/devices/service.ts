import { and, count, desc, eq, gt, isNull, sql } from "drizzle-orm";

import { createClaimToken, getWebAuthnOrigin } from "@/lib/auth/webauthn";
import {
  activityFeed,
  db,
  type PasskeyClaim,
  passkeyClaims,
  passkeyCredentials,
  users,
} from "@/lib/db";
import { expectRow } from "@/lib/db/expectRow";

import type {
  ClaimInitiateResponse,
  ClaimInitiator,
  PasskeyDevice,
} from "./types";

// A Drizzle query executor: either the top-level `db` or a transaction handle.
type DbExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function listDevices(userId: string): Promise<PasskeyDevice[]> {
  const rows = await db
    .select({
      id: passkeyCredentials.id,
      credentialId: passkeyCredentials.credentialId,
      deviceName: passkeyCredentials.deviceName,
      createdAt: passkeyCredentials.createdAt,
      lastUsed: passkeyCredentials.lastUsed,
    })
    .from(passkeyCredentials)
    .where(
      and(
        eq(passkeyCredentials.userId, userId),
        isNull(passkeyCredentials.deletedAt),
      ),
    )
    .orderBy(desc(passkeyCredentials.lastUsed));

  return rows.map((r) => ({
    id: r.id,
    credentialId: r.credentialId,
    deviceName: r.deviceName ?? null,
    createdAt: r.createdAt.toISOString(),
    lastUsed: r.lastUsed ? r.lastUsed.toISOString() : null,
  }));
}

function generateClaimCode(length: number = 12): string {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += charset[Math.floor(Math.random() * charset.length)];
  }
  return code;
}

export async function countActiveDevices(userId: string): Promise<number> {
  // DATA-08a: count in the database rather than selecting every row and
  // reading `.length`. This runs on the hot path of claim creation and
  // passkey deletion.
  const [row] = await db
    .select({ value: count() })
    .from(passkeyCredentials)
    .where(
      and(
        eq(passkeyCredentials.userId, userId),
        isNull(passkeyCredentials.deletedAt),
      ),
    );
  return row?.value ?? 0;
}

export async function initiateClaim(
  userId: string,
  initiator: ClaimInitiator,
): Promise<ClaimInitiateResponse | "maxDevices" | "rateLimit"> {
  const activeDevices = await countActiveDevices(userId);
  if (activeDevices >= 10) {
    return "maxDevices";
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  // DATA-08a: aggregate in the database instead of materialising every claim
  // row just to read its length.
  const [claimsLastHour] = await db
    .select({ value: count() })
    .from(passkeyClaims)
    .where(
      and(
        eq(passkeyClaims.userId, userId),
        gt(passkeyClaims.createdAt, oneHourAgo),
      ),
    );
  // Enforce the 5/hour claim cap for admin-initiated claims too, not just
  // user-initiated ones, so a leaked/abused admin secret can't mint unlimited
  // device claims for a single user.
  if ((claimsLastHour?.value ?? 0) >= 5) {
    return "rateLimit";
  }

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const claimCode = generateClaimCode();
  // Unconditional single-row insert with no onConflict clause: it returns the
  // new row or throws.
  const claim = expectRow(
    await db
      .insert(passkeyClaims)
      .values({ userId, claimCode, status: "active", initiator, expiresAt })
      .returning(),
    "initiateClaim insert passkeyClaims"
  );

  await db.insert(activityFeed).values({
    userId,
    activityType: "claim_generated",
    metadata: { initiator },
  });

  const token = await createClaimToken(claim.id, userId);
  // SUPPLY-02: this used to derive the origin from the same env vars
  // independently, so a magic link could point somewhere the ceremony would
  // then refuse to validate against. One helper, one answer.
  const origin = getWebAuthnOrigin();
  const magicLink = `${origin}/auth/claim?token=${encodeURIComponent(token)}`;

  return {
    claimId: claim.id,
    claimCode,
    token,
    magicLink,
    qrPayload: magicLink,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Atomically consume a passkey claim. A single conditional UPDATE flips the
 * row to "consumed" only if it is still active and unexpired, so two concurrent
 * redemptions can never both succeed: the database serializes the writes and
 * only the first matches the WHERE clause. Returns the consumed row, or null if
 * the claim was already consumed/cancelled/expired (i.e. not available).
 *
 * Pass a transaction handle as `executor` so the consume can be rolled back if
 * the subsequent passkey registration fails, leaving the claim retryable.
 */
export async function consumeClaim(
  executor: DbExecutor,
  claimId: string,
): Promise<PasskeyClaim | null> {
  const now = new Date();
  const [row] = await executor
    .update(passkeyClaims)
    .set({ status: "consumed", consumedAt: now })
    .where(
      and(
        eq(passkeyClaims.id, claimId),
        eq(passkeyClaims.status, "active"),
        gt(passkeyClaims.expiresAt, now),
      ),
    )
    .returning();
  return row ?? null;
}

export async function cancelClaim(
  userId: string,
  claimId: string,
): Promise<"success" | "notFound"> {
  try {
    await db
      .update(passkeyClaims)
      .set({ status: "cancelled" })
      .where(
        and(eq(passkeyClaims.id, claimId), eq(passkeyClaims.userId, userId)),
      );
    return "success";
  } catch {
    return "notFound";
  }
}

export async function deletePasskey(
  userId: string,
  credentialId: string,
): Promise<"success" | "minimum" | "notFound"> {
  try {
    const activeCount = await countActiveDevices(userId);
    if (activeCount <= 1) {
      return "minimum";
    }

    await db
      .update(passkeyCredentials)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(passkeyCredentials.id, credentialId),
          eq(passkeyCredentials.userId, userId),
        ),
      );

    // Deleting a passkey revokes every outstanding session for this user by
    // bumping their token version, so a lost/compromised device cannot keep a
    // live session for up to 7 days after the credential is removed.
    await db
      .update(users)
      .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
      .where(eq(users.id, userId));

    await db.insert(activityFeed).values({
      userId,
      activityType: "passkey_deleted",
      metadata: { credentialId },
    });

    return "success";
  } catch {
    return "notFound";
  }
}
