import { NextResponse } from "next/server";

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
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const periods = await listAvailableSnapshots(request.user.id);
    return NextResponse.json({ periods });
  } catch (error) {
    return handleApiError(error, "Series Finale list");
  }
});
