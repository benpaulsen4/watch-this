import { tmdbClient } from "@/lib/tmdb/client";
import { ContentCard } from "./ContentCard";
import { mapWithContentStatus } from "@/lib/content-status/service";

export default async function TrendingStrip({
  items,
  userId,
}: {
  items: number;
  userId: string;
}) {
  const tmdbTrending = await tmdbClient.getTrending("all", "day");
  const trendingPromises = tmdbTrending.results
    .slice(0, items)
    .map((t) => mapWithContentStatus(t, userId));
  const trendingContent = await Promise.all(trendingPromises);

  return (
    <>
      {trendingContent.map((item) => (
        <ContentCard key={item.tmdbId} content={item} />
      ))}
    </>
  );
}
