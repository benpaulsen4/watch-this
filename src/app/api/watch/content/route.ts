import { NextResponse } from "next/server";

import {
  type AuthenticatedRequest,
  handleApiError,
  withAuth,
} from "@/lib/auth/api-middleware";
import { tmdbClient } from "@/lib/tmdb/client";

// GET /api/watch/content?type=movie|tv&id=123&region=US
async function handler(request: AuthenticatedRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const id = searchParams.get("id");
    const region = searchParams.get("region")?.toUpperCase();

    if (!type || (type !== "movie" && type !== "tv")) {
      return NextResponse.json(
        { error: "type must be 'movie' or 'tv'" },
        { status: 400 },
      );
    }

    const numericId = Number(id);
    if (!numericId || Number.isNaN(numericId)) {
      return NextResponse.json(
        { error: "id must be a valid number" },
        { status: 400 },
      );
    }

    if (!region) {
      return NextResponse.json(
        { error: "region is required" },
        { status: 400 },
      );
    }

    const data = await tmdbClient.getContentWatchProviders(type, numericId);
    const regionData = data?.results?.[region] || null;

    return NextResponse.json({ region, providers: regionData });
  } catch (error) {
    return handleApiError(error, "Fetch content watch providers");
  }
}

export const GET = withAuth(handler);
