import { and, eq, sql } from "drizzle-orm";

import { authedRoute } from "@/lib/api/route";
import { db } from "@/lib/db";
import { seriesFinale } from "@/lib/db/schema";
import * as seriesFinaleApi from "@/lib/series-finale/contract";
import { dismissSeriesFinaleSchemas } from "@/lib/series-finale/schemas";

// POST /api/series-finale/[period]/dismiss - hide the dashboard banner. Sent
// by "Not now", and by the recap page once its foot is reached (seeing the
// year puts the banner away too).
//
// The first dismissal wins (COALESCE, as story-complete does): the recap
// sends this on every visit that reaches its foot, and a repeat must not
// rewrite when the banner was first put away.
//
// Every response is per-user at a URL shared by every user, so no shared
// cache may keep it -- 401s and errors included, which `headers` covers.
export const POST = authedRoute(
  seriesFinaleApi.dismissSeriesFinale,
  dismissSeriesFinaleSchemas,
  async ({ user, params: { period } }) => {
    await db
      .update(seriesFinale)
      .set({ dismissedAt: sql`coalesce(${seriesFinale.dismissedAt}, now())` })
      .where(
        and(
          eq(seriesFinale.userId, user.id),
          eq(seriesFinale.periodStart, period.start),
          eq(seriesFinale.periodEnd, period.end),
        ),
      );

    return { success: true as const };
  },
  { headers: { "Cache-Control": "private, no-store" } },
);
