import { type NextRequest, NextResponse } from "next/server";

import {
  AuthenticatedRequest,
  handleApiError,
  withAuth,
} from "@/lib/auth/api-middleware";
import { parsePeriodLabel } from "@/lib/series-finale/periods";
import { getOrGenerateSnapshot } from "@/lib/series-finale/service";

// GET /api/series-finale/[period] - the frozen payload, generated if absent.
// The path is parsed from `request.url` rather than a route-params argument
// because `withAuth` wraps a single-argument handler -- this matches how
// `src/app/api/tmdb/episodes/[id]/route.ts` already extracts its id.
const handler = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const label = new URL(request.url).pathname.split("/").at(-1) ?? "";
    const period = parsePeriodLabel(label);

    if (!period) {
      return NextResponse.json({ error: "Invalid period" }, { status: 400 });
    }

    // `getOrGenerateSnapshot` is the one authority on whether this period is
    // over -- it gates in the user's own timezone, not UTC. A route-level
    // completeness check here would judge the wrong clock.
    const payload = await getOrGenerateSnapshot(request.user.id, period);

    if (!payload) {
      return NextResponse.json(
        { error: "Period not available" },
        { status: 404 },
      );
    }

    return NextResponse.json({ payload });
  } catch (error) {
    return handleApiError(error, "Series Finale payload");
  }
});

// Every response carries one user's recap data (or its absence) at a URL that
// is the same for every user, so no shared cache may keep it -- 401s and
// errors included, rather than trusting each branch to remember.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const response = await handler(request);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
