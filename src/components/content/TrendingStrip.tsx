import { tmdbClient } from "@/lib/tmdb/client";
import { enrichWithContentStatus } from "@/lib/tmdb/contentUtils";
import { ContentCard } from "./ContentCard";

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
    .map((t) => enrichWithContentStatus(t, userId));
  const trendingContent = await Promise.all(trendingPromises);

  return (
    <>
      {trendingContent.map((item) => (
        <ContentCard key={item.id} content={item} />
      ))}
    </>
  );
}
