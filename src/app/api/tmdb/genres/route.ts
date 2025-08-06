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
    return handleApiError(error, "TMDB genres");
  }
});
