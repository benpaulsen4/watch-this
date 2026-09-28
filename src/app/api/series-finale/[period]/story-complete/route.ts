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

// POST /api/series-finale/[period]/story-complete - record that the viewer
// has gone through the whole story. Task 3 reads this to gate the phone
// recap, which defaults to the story and unlocks once it has been completed
// -- remembered on the account so it holds across devices, the way
// `dismissedAt` remembers "Not now".
//
// Idempotent via COALESCE rather than a read-then-write: the first completed
// timestamp wins, and two racing requests (e.g. a slow tab still open after
// the story finished elsewhere) can't overwrite it with a later one.
const handler = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const segments = new URL(request.url).pathname.split("/");
    const label = segments.at(-2) ?? "";
    const period = parsePeriodLabel(label);

    if (!period) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    const [updated] = await db
      .update(seriesFinale)
      .set({
        storyCompletedAt: sql`coalesce(${seriesFinale.storyCompletedAt}, now())`,
      })
      .where(
        and(
          eq(seriesFinale.userId, request.user.id),
          eq(seriesFinale.periodStart, period.start),
          eq(seriesFinale.periodEnd, period.end),
        ),
      )
      .returning({ id: seriesFinale.id });

    if (!updated) {
      return NextResponse.json(
        { error: "Period not available" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "Series Finale story complete");
  }
});

// Every response is per-user at a URL shared by every user, so no shared
// cache may keep it -- 401s and errors included.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const response = await handler(request);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
