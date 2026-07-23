import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  type NewUserStreamingProvider,
  users,
  userStreamingProviders,
} from "@/lib/db/schema";

import type {
  SaveStreamingPreferencesRequest,
  StreamingPreferences,
} from "./types";

export async function getStreamingPreferences(
  userId: string,
): Promise<StreamingPreferences | "dbError"> {
  try {
    const [userRow] = await db
      .select({ country: users.country })
      .from(users)
      .where(eq(users.id, userId));

    const savedProviders = await db
      .select()
      .from(userStreamingProviders)
      .where(eq(userStreamingProviders.userId, userId));

    return {
      country: userRow?.country ?? null,
      providers: savedProviders.map((p) => ({
        id: p.providerId,
        name: p.providerName || null,
        logoPath: p.logoPath || null,
        region: p.region,
      })),
    };
  } catch {
    return "dbError";
  }
}

export async function updateStreamingPreferences(
  userId: string,
  payload: SaveStreamingPreferencesRequest,
): Promise<StreamingPreferences | "invalidRegion" | "dbError"> {
  const country = payload.country;
  const region = (payload.region || country || "").toUpperCase();
  if (payload.providers && !region) {
    return "invalidRegion";
  }

  try {
    // DATA-07(a): the country update, the delete of the user's existing
    // providers for this region and the re-insert must be one unit. Previously
    // a failing insert left the delete committed, silently wiping the user's
    // saved providers with nothing written back and no way to recover them.
    await db.transaction(async (tx) => {
      if (country) {
        await tx.update(users).set({ country }).where(eq(users.id, userId));
      }

      if (payload.providers) {
        await tx
          .delete(userStreamingProviders)
          .where(
            and(
              eq(userStreamingProviders.userId, userId),
              eq(userStreamingProviders.region, region),
            ),
          );

        const trimmed = payload.providers.slice(0, 50);
        if (trimmed.length > 0) {
          const rows: NewUserStreamingProvider[] = trimmed.map((p) => ({
            userId,
            providerId: p.providerId,
            providerName: p.providerName || null,
            logoPath: p.logoPath || null,
            region,
          }));
          await tx.insert(userStreamingProviders).values(rows);
        }
      }
    });

    return await getStreamingPreferences(userId);
  } catch {
    return "dbError";
  }
}
