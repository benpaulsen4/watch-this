import { tmdbClient } from "@/lib/tmdb/client";
import { ContentCard } from "./ContentCard";
import {
  mapAllWithContentStatus,
  mapWithContentStatus,
} from "@/lib/content-status/service";

export default async function TrendingStrip({
  items,
  userId,
}: {
  items: number;
  userId: string;
}) {
  const tmdbTrending = await tmdbClient.getTrending("all", "day");

  if (!tmdbTrending.results || tmdbTrending.results.length === 0) {
    return null;
  }

  // Enrich results with watch status
  const trendingContent = await mapAllWithContentStatus(
    tmdbTrending.results.slice(0, items),
    userId
  );

  return (
    <>
      {trendingContent.map((item) => (
        <ContentCard key={item.tmdbId} content={item} />
      ))}
    </>
  );
}
