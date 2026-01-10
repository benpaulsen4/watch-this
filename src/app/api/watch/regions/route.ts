import { NextResponse } from "next/server";

import { handleApiError,withAuth } from "@/lib/auth/api-middleware";
import { tmdbClient } from "@/lib/tmdb/client";

async function handler() {
  try {
    const regions = await tmdbClient.getWatchProviderRegions();
    return NextResponse.json(regions);
  } catch (error) {
    return handleApiError(error, "Fetch watch provider regions");
  }
}

export const GET = withAuth(handler);
