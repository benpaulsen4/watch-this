import { NextResponse } from "next/server";

import { listActivityTimeline } from "@/lib/activity/service";
import type { ActivityTimelineResponse } from "@/lib/activity/types";
import { AuthenticatedRequest,withAuth } from "@/lib/auth/api-middleware";

// GET /api/activity - Get paginated activity timeline
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "10");
    const cursor = searchParams.get("cursor") || undefined;
    const type = searchParams.get("type") || undefined;

    const result = await listActivityTimeline(
      request.user.id,
      request.user.timezone,
      {
        limit,
        cursor,
        type,
      },
    );

    if (typeof result === "string") {
      if (result === "invalidCursor") {
        return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
      }
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    const typed: ActivityTimelineResponse = result;
    return NextResponse.json(typed);
  } catch (error) {
    console.error("Error fetching activity timeline:", error);
    return NextResponse.json(
      { error: "Failed to fetch activity timeline" },
      { status: 500 },
    );
  }
});
