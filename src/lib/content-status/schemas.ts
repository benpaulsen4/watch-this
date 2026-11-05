import { z } from "zod";

import { q } from "../api/query";
import { ContentType, MovieWatchStatus, WatchStatus } from "../db/schema";

const TMDB_ID_INVALID = "tmdbId must be a positive integer";
const CONTENT_TYPE_INVALID = "Invalid content type. Must be 'movie' or 'tv'";
const MOVIE_STATUS_INVALID =
  "Invalid movie status. Must be 'planning' or 'completed'";
// Every status is a TV status, so this is the message for one outside the set.
const STATUS_INVALID =
  "Invalid TV status. Must be 'planning', 'watching', 'paused', 'completed', or 'dropped'";

const contentType = z.enum(ContentType, CONTENT_TYPE_INVALID);
const status = z.enum(WatchStatus, STATUS_INVALID);

/** Movies only have two statuses; TV shows use all of them. */
function checkMovieStatus(
  body: { contentType: string; status?: string },
  context: z.core.$RefinementCtx,
) {
  const movieStatuses: readonly string[] = Object.values(MovieWatchStatus);
  if (
    body.contentType === ContentType.MOVIE &&
    body.status !== undefined &&
    !movieStatuses.includes(body.status)
  ) {
    context.addIssue({
      code: "custom",
      path: ["status"],
      message: MOVIE_STATUS_INVALID,
    });
  }
}

const contentQuery = z.object({
  tmdbId: q.int({ min: 1, message: TMDB_ID_INVALID }),
  contentType,
});

export const getContentStatusSchemas = { query: contentQuery };

export const createOrUpdateContentStatusSchemas = {
  body: z
    .object({
      tmdbId: z.int(TMDB_ID_INVALID).positive(TMDB_ID_INVALID),
      contentType,
      status,
    })
    .superRefine(checkMovieStatus),
};

export const updateContentStatusSchemas = {
  body: z
    .object({
      tmdbId: z.int(TMDB_ID_INVALID).positive(TMDB_ID_INVALID),
      contentType,
      status: status.optional(),
    })
    .superRefine(checkMovieStatus),
};

export const deleteContentStatusSchemas = { query: contentQuery };
