import { and, eq, sql } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import {
  AuthenticatedRequest,
  handleApiError,
  withAuth,
} from "@/lib/auth/api-middleware";
import { db } from "@/lib/db";
import { seriesFinale } from "@/lib/db/schema";
import { parsePeriodLabel } from "@/lib/series-finale/periods";

// POST /api/series-finale/[period]/dismiss - hide the dashboard banner. Sent
// by "Not now", and by the recap page once its foot is reached (seeing the
// year puts the banner away too).
//
// The first dismissal wins (COALESCE, as story-complete does): the recap
// sends this on every visit that reaches its foot, and a repeat must not
// rewrite when the banner was first put away.
const handler = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const segments = new URL(request.url).pathname.split("/");
    const label = segments.at(-2) ?? "";
    const period = parsePeriodLabel(label);

    if (!period) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    await db
      .update(seriesFinale)
      .set({ dismissedAt: sql`coalesce(${seriesFinale.dismissedAt}, now())` })
      .where(
        and(
          eq(seriesFinale.userId, request.user.id),
          eq(seriesFinale.periodStart, period.start),
          eq(seriesFinale.periodEnd, period.end),
        ),
      );

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "Series Finale dismiss");
  }
});

// Every response is per-user at a URL shared by every user, so no shared
// cache may keep it -- 401s and errors included (as story-complete does).
export async function POST(request: NextRequest): Promise<NextResponse> {
  const response = await handler(request);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
