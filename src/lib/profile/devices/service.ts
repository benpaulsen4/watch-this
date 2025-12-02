import { db } from "@/lib/db";
import { passkeyCredentials, passkeyClaims, activityFeed } from "@/lib/db";
import { desc, eq, isNull, and, gt } from "drizzle-orm";
import type {
  PasskeyDevice,
  ClaimInitiateResponse,
  ClaimInitiator,
} from "./types";
import { createClaimToken } from "@/lib/auth/webauthn";

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
        isNull(passkeyCredentials.deletedAt)
      )
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

function getOrigin() {
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return process.env.WEBAUTHN_ORIGIN || "http://localhost:3000";
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
  const rows = await db
    .select({ id: passkeyCredentials.id })
    .from(passkeyCredentials)
    .where(
      and(
        eq(passkeyCredentials.userId, userId),
        isNull(passkeyCredentials.deletedAt)
      )
    );
  return rows.length;
}

export async function initiateClaim(
  userId: string,
  initiator: ClaimInitiator
): Promise<ClaimInitiateResponse | "maxDevices" | "rateLimit"> {
  const activeDevices = await countActiveDevices(userId);
  if (activeDevices >= 10) {
    return "maxDevices";
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const claimsLastHour = await db
    .select({ id: passkeyClaims.id })
    .from(passkeyClaims)
    .where(
      and(
        eq(passkeyClaims.userId, userId),
        gt(passkeyClaims.createdAt, oneHourAgo)
      )
    );
  if (claimsLastHour.length >= 5 && initiator === "user") {
    return "rateLimit";
  }

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const claimCode = generateClaimCode();
  const [claim] = await db
    .insert(passkeyClaims)
    .values({ userId, claimCode, status: "active", initiator, expiresAt })
    .returning();

  await db.insert(activityFeed).values({
    userId,
    activityType: "claim_generated",
    metadata: { initiator },
  });

  const token = await createClaimToken(claim.id, userId);
  const origin = getOrigin();
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

export async function cancelClaim(
  userId: string,
  claimId: string
): Promise<"success" | "notFound"> {
  try {
    await db
      .update(passkeyClaims)
      .set({ status: "cancelled" })
      .where(
        and(eq(passkeyClaims.id, claimId), eq(passkeyClaims.userId, userId))
      );
    return "success";
  } catch {
    return "notFound";
  }
}

export async function deletePasskey(
  userId: string,
  credentialId: string
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
          eq(passkeyCredentials.userId, userId)
        )
      );

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
