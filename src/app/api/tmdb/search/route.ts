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
    const query = searchParams.get("q");
    const type = searchParams.get("type") as "multi" | "movie" | "tv" | null;
    const page = parseInt(searchParams.get("page") || "1");

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: "Search query is required" },
        { status: 400 }
      );
    }

    if (page < 1 || page > 1000) {
      return NextResponse.json(
        { error: "Page must be between 1 and 1000" },
        { status: 400 }
      );
    }

    let results;

    switch (type) {
      case "movie":
        results = await tmdbClient.searchMovies(query.trim(), page);
        break;
      case "tv":
        results = await tmdbClient.searchTVShows(query.trim(), page);
        break;
      case "multi":
      default:
        results = await tmdbClient.searchMulti(query.trim(), page);
        break;
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("TMDB search error:", error);

    if (error instanceof Error && error.message.includes("TMDB API error")) {
      return NextResponse.json(
        { error: "External service unavailable" },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
