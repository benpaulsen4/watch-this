import { authedRoute } from "@/lib/api/route";
import * as episodesApi from "@/lib/episodes/contract";
import { markNextEpisodeWatchedSchemas } from "@/lib/episodes/schemas";
import { markNextEpisodeWatched } from "@/lib/episodes/service";

// POST /api/status/episodes/next - Mark the next available episode as watched
export const POST = authedRoute(
  episodesApi.markNextEpisodeWatched,
  markNextEpisodeWatchedSchemas,
  ({ user, body }) => markNextEpisodeWatched(user.id, body.tmdbId),
);
