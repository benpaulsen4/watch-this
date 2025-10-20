import { NextResponse } from "next/server";
import { tmdbClient } from "@/lib/tmdb/client";
import { withAuth, handleApiError } from "@/lib/auth/api-middleware";

async function handler() {
  try {
    const regions = await tmdbClient.getWatchProviderRegions();
    return NextResponse.json(regions);
  } catch (error) {
    return handleApiError(error, "Fetch watch provider regions");
  }
}

export const GET = withAuth(handler);
