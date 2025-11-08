import { SearchClient } from "@/components/search/SearchClient";
import { getCurrentUser } from "@/lib/auth/webauthn";
import { tmdbClient } from "@/lib/tmdb/client";
import { enrichWithContentStatus } from "@/lib/tmdb/contentUtils";
import { cookies } from "next/headers";

export default async function SearchPage() {
  const user = await getCurrentUser((await cookies()).get("session")?.value);

  if (!user) return null;

  const [movieGenres, tvGenres] = await Promise.all([
    tmdbClient.getMovieGenres(),
    tmdbClient.getTVGenres(),
  ]);

  // Combine and deduplicate genres
  const allGenres = [...movieGenres.genres, ...tvGenres.genres];
  const uniqueGenres = allGenres.filter(
    (genre, index, self) => index === self.findIndex((g) => g.id === genre.id),
  );

  const sortedGenres = uniqueGenres.sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const trending = await tmdbClient.getTrending("all", "day");

  const trendingContent = await Promise.all(
    trending.results.map((t) => enrichWithContentStatus(t, user.id)),
  );
  return (
    <SearchClient genres={sortedGenres} trendingContent={trendingContent} />
  );
}
