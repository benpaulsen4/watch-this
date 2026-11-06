import { and, eq, sql } from "drizzle-orm";

import { authedRoute } from "@/lib/api/route";
import { db } from "@/lib/db";
import { seriesFinale } from "@/lib/db/schema";
import * as seriesFinaleApi from "@/lib/series-finale/contract";
import { completeStorySchemas } from "@/lib/series-finale/schemas";

// POST /api/series-finale/[period]/story-complete - record that the viewer
// has gone through the whole story. Task 3 reads this to gate the phone
// recap, which defaults to the story and unlocks once it has been completed
// -- remembered on the account so it holds across devices, the way
// `dismissedAt` remembers "Not now".
//
// Idempotent via COALESCE rather than a read-then-write: the first completed
// timestamp wins, and two racing requests (e.g. a slow tab still open after
// the story finished elsewhere) can't overwrite it with a later one.
//
// Every response is per-user at a URL shared by every user, so no shared
// cache may keep it -- 401s and errors included, which `headers` covers.
export const POST = authedRoute(
  seriesFinaleApi.completeStory,
  completeStorySchemas,
  async ({ user, params: { period } }) => {
    const [updated] = await db
      .update(seriesFinale)
      .set({
        storyCompletedAt: sql`coalesce(${seriesFinale.storyCompletedAt}, now())`,
      })
      .where(
        and(
          eq(seriesFinale.userId, user.id),
          eq(seriesFinale.periodStart, period.start),
          eq(seriesFinale.periodEnd, period.end),
        ),
      )
      .returning({ id: seriesFinale.id });

    if (!updated) return "notFound";

    return { success: true as const };
  },
  { headers: { "Cache-Control": "private, no-store" } },
);
