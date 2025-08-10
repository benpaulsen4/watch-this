import { NextResponse } from "next/server";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
import { db } from "@/lib/db";
import { passkeyCredentials } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

// GET /api/profile/devices - Get all passkey devices for the authenticated user
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;

    // Get all passkey devices for the user
    const devices = await db
      .select({
        id: passkeyCredentials.id,
        credentialId: passkeyCredentials.credentialId,
        deviceName: passkeyCredentials.deviceName,
        createdAt: passkeyCredentials.createdAt,
        lastUsed: passkeyCredentials.lastUsed,
      })
      .from(passkeyCredentials)
      .where(eq(passkeyCredentials.userId, userId))
      .orderBy(desc(passkeyCredentials.lastUsed));

    return NextResponse.json({
      devices,
    });
  } catch (error) {
    console.error("Get devices error:", error);

    return NextResponse.json(
      { error: "Failed to retrieve devices" },
      { status: 500 }
    );
  }
});
