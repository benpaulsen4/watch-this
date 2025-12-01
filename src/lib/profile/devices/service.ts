import { db } from "@/lib/db";
import { passkeyCredentials } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import type { PasskeyDevice } from "./types";

export async function listDevices(
  userId: string
): Promise<PasskeyDevice[] | "dbError"> {
  try {
    const rows = await db
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

    return rows.map((r) => ({
      id: r.id,
      credentialId: r.credentialId,
      deviceName: r.deviceName ?? null,
      createdAt: r.createdAt.toISOString(),
      lastUsed: r.lastUsed ? r.lastUsed.toISOString() : null,
    }));
  } catch {
    return "dbError";
  }
}
