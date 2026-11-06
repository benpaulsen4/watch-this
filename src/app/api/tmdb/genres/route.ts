import { authedRoute } from "@/lib/api/route";
import { tmdbClient } from "@/lib/tmdb/client";
import * as tmdbApi from "@/lib/tmdb/contract";
import { getGenresSchemas } from "@/lib/tmdb/schemas";

// GET /api/tmdb/genres - Movie, TV, or combined genres
export const GET = authedRoute(
  tmdbApi.getGenres,
  getGenresSchemas,
  async ({ query }) => {
    if (query.type === "movie") return tmdbClient.getMovieGenres();
    if (query.type === "tv") return tmdbClient.getTVGenres();

    // Get both movie and TV genres
    const [movieGenres, tvGenres] = await Promise.all([
      tmdbClient.getMovieGenres(),
      tmdbClient.getTVGenres(),
    ]);

    // Combine and deduplicate genres
    const allGenres = [...movieGenres.genres, ...tvGenres.genres];
    const uniqueGenres = allGenres.filter(
      (genre, index, self) =>
        index === self.findIndex((g) => g.id === genre.id),
    );

    return {
      genres: uniqueGenres.sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
);
