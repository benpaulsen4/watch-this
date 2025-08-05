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
    const type = searchParams.get("type") as "movie" | "tv" | "all";

    if (type && !["movie", "tv", "all"].includes(type)) {
      return NextResponse.json(
        { error: 'Type must be "movie", "tv", or "all"' },
        { status: 400 }
      );
    }

    let results;

    if (type === "movie") {
      results = await tmdbClient.getMovieGenres();
    } else if (type === "tv") {
      results = await tmdbClient.getTVGenres();
    } else {
      // Get both movie and TV genres
      const [movieGenres, tvGenres] = await Promise.all([
        tmdbClient.getMovieGenres(),
        tmdbClient.getTVGenres(),
      ]);

      // Combine and deduplicate genres
      const allGenres = [...movieGenres.genres, ...tvGenres.genres];
      const uniqueGenres = allGenres.filter(
        (genre, index, self) =>
          index === self.findIndex((g) => g.id === genre.id)
      );

      results = {
        genres: uniqueGenres.sort((a, b) => a.name.localeCompare(b.name)),
      };
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("TMDB genres error:", error);

    if (error instanceof Error && error.message.includes("TMDB API error")) {
      return NextResponse.json(
        { error: "External service unavailable" },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Failed to get genres" },
      { status: 500 }
    );
  }
}
