import { NextRequest, NextResponse } from "next/server";
import { tmdbClient } from "@/lib/tmdb/client";
import { getCurrentUser } from "@/lib/auth/webauthn";

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    // TODO get the user and auth status from middleware state
    const sessionToken = request.cookies.get("session")?.value;
    const user = await getCurrentUser(sessionToken);

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

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
    console.error("TMDB trending error:", error);

    if (error instanceof Error && error.message.includes("TMDB API error")) {
      return NextResponse.json(
        { error: "External service unavailable" },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Failed to get trending content" },
      { status: 500 }
    );
  }
}
