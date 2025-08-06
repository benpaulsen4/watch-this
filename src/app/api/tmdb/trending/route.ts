import { NextResponse } from "next/server";
import { tmdbClient } from "@/lib/tmdb/client";
import {
  withAuth,
  handleApiError,
  AuthenticatedRequest,
} from "@/lib/auth/api-middleware";

export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const mediaType = searchParams.get("media_type") as
      | "all"
      | "movie"
      | "tv"
      | null;
    const timeWindow = searchParams.get("time_window") as "day" | "week" | null;

    const validMediaTypes = ["all", "movie", "tv"];
    const validTimeWindows = ["day", "week"];

    if (mediaType && !validMediaTypes.includes(mediaType)) {
      return NextResponse.json(
        { error: 'Media type must be "all", "movie", or "tv"' },
        { status: 400 }
      );
    }

    if (timeWindow && !validTimeWindows.includes(timeWindow)) {
      return NextResponse.json(
        { error: 'Time window must be "day" or "week"' },
        { status: 400 }
      );
    }

    const results = await tmdbClient.getTrending(
      mediaType || "all",
      timeWindow || "week"
    );

    return NextResponse.json(results);
  } catch (error) {
    return handleApiError(error, "TMDB trending");
  }
});
