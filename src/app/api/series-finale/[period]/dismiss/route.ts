import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  AuthenticatedRequest,
  handleApiError,
  withAuth,
} from "@/lib/auth/api-middleware";
import { db } from "@/lib/db";
import { seriesFinale } from "@/lib/db/schema";
import { parsePeriodLabel } from "@/lib/series-finale/periods";

// POST /api/series-finale/[period]/dismiss - hide the dashboard banner
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const segments = new URL(request.url).pathname.split("/");
    const label = segments.at(-2) ?? "";
    const period = parsePeriodLabel(label);

    if (!period) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    await db
      .update(seriesFinale)
      .set({ dismissedAt: new Date() })
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
