import {
  mapAllWithContentStatus,
} from "@/lib/content-status/service";
import { tmdbClient } from "@/lib/tmdb/client";

import { ContentCard } from "./ContentCard";

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
      {/* A TMDB id is only unique within a content type, and trending is fetched
          with type "all", so a movie and a show can arrive with the same id.
          Keys drive reconciliation, so a collision makes the two cards share
          component state. */}
      {trendingContent.map((item) => (
        <ContentCard
          key={`${item.contentType}-${item.tmdbId}`}
          content={item}
        />
      ))}
    </>
  );
}
