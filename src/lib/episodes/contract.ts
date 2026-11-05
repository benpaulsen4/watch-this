import { defineContract, schemas, type } from "../api/contract";
import type {
  batchUpdateEpisodeStatusesSchemas,
  deleteEpisodeStatusesSchemas,
  listEpisodeStatusesSchemas,
  markNextEpisodeWatchedSchemas,
  updateEpisodeStatusSchemas,
} from "./schemas";
import type {
  BatchUpdateEpisodesResult,
  DeleteEpisodeStatusesResponse,
  ListEpisodeStatusResponse,
  MarkNextEpisodeResult,
  UpdateEpisodeStatusResult,
} from "./types";

export const listEpisodeStatuses = defineContract({
  method: "GET",
  path: "/api/status/episodes",
  label: "Get episode status",
  schemas: schemas<typeof listEpisodeStatusesSchemas>(),
  response: type<ListEpisodeStatusResponse>(),
});

export const updateEpisodeStatus = defineContract({
  method: "POST",
  path: "/api/status/episodes",
  label: "Update episode status",
  status: 201,
  schemas: schemas<typeof updateEpisodeStatusSchemas>(),
  response: type<UpdateEpisodeStatusResult>(),
});

export const batchUpdateEpisodeStatuses = defineContract({
  method: "PUT",
  path: "/api/status/episodes",
  label: "Batch update episode status",
  schemas: schemas<typeof batchUpdateEpisodeStatusesSchemas>(),
  response: type<BatchUpdateEpisodesResult>(),
});

export const deleteEpisodeStatuses = defineContract({
  method: "DELETE",
  path: "/api/status/episodes",
  label: "Delete episode status",
  schemas: schemas<typeof deleteEpisodeStatusesSchemas>(),
  response: type<DeleteEpisodeStatusesResponse>(),
});

export const markNextEpisodeWatched = defineContract({
  method: "POST",
  path: "/api/status/episodes/next",
  label: "Mark next episode as watched",
  status: 201,
  schemas: schemas<typeof markNextEpisodeWatchedSchemas>(),
  response: type<MarkNextEpisodeResult>(),
  errors: {
    notFound: { status: 404, message: "TV show not found" },
    noNextEpisode: {
      status: 400,
      message: "No next episode available. You're all caught up!",
    },
    notAired: { status: 400, message: "Next episode hasn't aired yet." },
  },
});
