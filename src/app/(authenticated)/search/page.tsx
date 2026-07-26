import { Suspense } from "react";

import { ContentCardSkeleton } from "@/components/content/ContentCardSkeleton";
import TrendingStrip from "@/components/content/TrendingStrip";
import { SearchClient } from "@/components/search/SearchClient";
import { tmdbClient } from "@/lib/tmdb/client";

import { requireUser } from "../requireUser";

export default async function SearchPage() {
  const user = await requireUser("/search");

  const [movieGenres, tvGenres] = await Promise.all([
    tmdbClient.getMovieGenres(),
    tmdbClient.getTVGenres(),
  ]);

  // Combine and deduplicate genres
  const allGenres = [...movieGenres.genres, ...tvGenres.genres];
  const uniqueGenres = allGenres.filter(
    (genre, index, self) => index === self.findIndex((g) => g.id === genre.id)
  );

  const sortedGenres = uniqueGenres.sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  return (
    <SearchClient genres={sortedGenres}>
      <Suspense
        fallback={Array.from({ length: 20 }).map((_, i) => (
          <ContentCardSkeleton key={i} />
        ))}
      >
        <TrendingStrip items={20} userId={user.id} />
      </Suspense>
    </SearchClient>
  );
}
