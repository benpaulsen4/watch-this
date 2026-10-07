import { type NextRequest, NextResponse } from "next/server";

import {
  AuthenticatedRequest,
  handleApiError,
  withAuth,
} from "@/lib/auth/api-middleware";
import { listAvailableSnapshots } from "@/lib/series-finale/service";

// GET /api/series-finale - available periods for the current user; feeds the
// dashboard banner and profile rows. Generates any snapshot that is missing
// or stale (see `listAvailableSnapshots`) -- this is the feature's only entry
// point, so it cannot return placeholders for periods nobody has opened.
const handler = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const periods = await listAvailableSnapshots(request.user.id);
    return NextResponse.json({ periods });
  } catch (error) {
    return handleApiError(error, "Series Finale list");
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
