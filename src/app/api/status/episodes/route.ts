import { authedRoute } from "@/lib/api/route";
import * as episodesApi from "@/lib/episodes/contract";
import {
  batchUpdateEpisodeStatusesSchemas,
  deleteEpisodeStatusesSchemas,
  listEpisodeStatusesSchemas,
  updateEpisodeStatusSchemas,
} from "@/lib/episodes/schemas";
import {
  batchUpdateEpisodeStatuses,
  deleteEpisodeStatuses,
  listEpisodeStatuses,
  updateEpisodeStatus,
} from "@/lib/episodes/service";

// GET /api/status/episodes - Get episode watch status for authenticated user
export const GET = authedRoute(
  episodesApi.listEpisodeStatuses,
  listEpisodeStatusesSchemas,
  ({ user, query }) =>
    listEpisodeStatuses(
      user.id,
      query.tmdbId,
      query.seasonNumber,
      query.episodeNumber,
    ),
);

// POST /api/status/episodes - Mark episode as watched/unwatched
export const POST = authedRoute(
  episodesApi.updateEpisodeStatus,
  updateEpisodeStatusSchemas,
  ({ user, body }) => updateEpisodeStatus(user.id, body),
);

// PUT /api/status/episodes - Batch update multiple episodes
export const PUT = authedRoute(
  episodesApi.batchUpdateEpisodeStatuses,
  batchUpdateEpisodeStatusesSchemas,
  ({ user, body }) =>
    batchUpdateEpisodeStatuses(user.id, body.tmdbId, body.episodes),
);

// DELETE /api/status/episodes - Remove episode watch status
export const DELETE = authedRoute(
  episodesApi.deleteEpisodeStatuses,
  deleteEpisodeStatusesSchemas,
  async ({ user, query }) => {
    const { deletedCount } = await deleteEpisodeStatuses(
      user.id,
      query.tmdbId,
      query.seasonNumber,
      query.episodeNumber,
    );
    return {
      message: `Removed ${deletedCount} episode status(es) successfully`,
      deletedCount,
    };
  },
);
