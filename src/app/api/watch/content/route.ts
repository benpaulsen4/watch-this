import { authedRoute } from "@/lib/api/route";
import { tmdbClient } from "@/lib/tmdb/client";
import * as tmdbApi from "@/lib/tmdb/contract";
import { getContentWatchProvidersSchemas } from "@/lib/tmdb/schemas";

// GET /api/watch/content?type=movie|tv&id=123&region=US
export const GET = authedRoute(
  tmdbApi.getContentWatchProviders,
  getContentWatchProvidersSchemas,
  async ({ query }) => {
    const data = await tmdbClient.getContentWatchProviders(
      query.type,
      query.id,
    );
    return {
      region: query.region,
      providers: data?.results?.[query.region] || null,
    };
  },
);
