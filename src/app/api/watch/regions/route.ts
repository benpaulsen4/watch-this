import { authedRoute } from "@/lib/api/route";
import { tmdbClient } from "@/lib/tmdb/client";
import * as tmdbApi from "@/lib/tmdb/contract";

// GET /api/watch/regions - Regions TMDB has watch providers for
export const GET = authedRoute(tmdbApi.getWatchProviderRegions, {}, () =>
  tmdbClient.getWatchProviderRegions(),
);
