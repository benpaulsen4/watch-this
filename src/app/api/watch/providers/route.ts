import { authedRoute } from "@/lib/api/route";
import { tmdbClient, type TMDBWatchProvider } from "@/lib/tmdb/client";
import * as tmdbApi from "@/lib/tmdb/contract";
import { getRegionWatchProvidersSchemas } from "@/lib/tmdb/schemas";

// GET /api/watch/providers?region=US - Movie and TV providers in a region
export const GET = authedRoute(
  tmdbApi.getRegionWatchProviders,
  getRegionWatchProvidersSchemas,
  async ({ query }) => {
    const [movieProviders, tvProviders] = await Promise.all([
      tmdbClient.getWatchProviders("movie", query.region),
      tmdbClient.getWatchProviders("tv", query.region),
    ]);

    // Merge and de-duplicate providers by provider_id
    const map = new Map<number, TMDBWatchProvider>();
    [...movieProviders.results, ...tvProviders.results].forEach((p) => {
      if (!map.has(p.provider_id)) {
        map.set(p.provider_id, p);
      }
    });

    return { results: Array.from(map.values()) };
  },
);
