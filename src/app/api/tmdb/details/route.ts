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
    const id = searchParams.get("id");
    const type = searchParams.get("type") as "movie" | "tv";

    if (!id || !type) {
      return NextResponse.json(
        { error: "Content ID and type are required" },
        { status: 400 }
      );
    }

    const contentId = parseInt(id);
    if (isNaN(contentId) || contentId <= 0) {
      return NextResponse.json(
        { error: "Invalid content ID" },
        { status: 400 }
      );
    }

    if (!["movie", "tv"].includes(type)) {
      return NextResponse.json(
        { error: 'Type must be either "movie" or "tv"' },
        { status: 400 }
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
          { status: 404 }
        );
      }

      return NextResponse.json(
        { error: "External service unavailable" },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Failed to get content details" },
      { status: 500 }
    );
  }
}
