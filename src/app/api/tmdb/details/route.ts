import { NextResponse } from "next/server";

import { AuthenticatedRequest,withAuth } from "@/lib/auth/api-middleware";
import { tmdbClient } from "@/lib/tmdb/client";

export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const type = searchParams.get("type") as "movie" | "tv";

    if (!id || !type) {
      return NextResponse.json(
        { error: "Content ID and type are required" },
        { status: 400 },
      );
    }

    const contentId = parseInt(id);
    if (isNaN(contentId) || contentId <= 0) {
      return NextResponse.json(
        { error: "Invalid content ID" },
        { status: 400 },
      );
    }

    if (!["movie", "tv"].includes(type)) {
      return NextResponse.json(
        { error: 'Type must be either "movie" or "tv"' },
        { status: 400 },
      );
    }

    let details;

    if (type === "movie") {
      details = await tmdbClient.getMovieDetails(contentId);
    } else {
      details = await tmdbClient.getTVShowDetails(contentId);
    }

    return NextResponse.json(details);
  } catch (error) {
    console.error("TMDB details error:", error);

    if (error instanceof Error && error.message.includes("TMDB API error")) {
      if (error.message.includes("404")) {
        return NextResponse.json(
          { error: "Content not found" },
          { status: 404 },
        );
      }

      return NextResponse.json(
        { error: "External service unavailable" },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: "Failed to get content details" },
      { status: 500 },
    );
  }
});
