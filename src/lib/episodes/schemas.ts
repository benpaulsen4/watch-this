import { z } from "zod";

import { q } from "../api/query";

const TMDB_ID_INVALID = "tmdbId must be a positive integer";
const EPISODE_NUMBERS_REQUIRED =
  "seasonNumber and episodeNumber must be numbers";
const EPISODE_NUMBERS_INVALID = "Invalid season or episode number";
const EPISODE_ITEM_INVALID =
  "Each episode must have seasonNumber, episodeNumber, and watched properties";

const tmdbId = z.int(TMDB_ID_INVALID).positive(TMDB_ID_INVALID);

// Season 0 holds specials, and some seasons number an episode 0, so the
// filters accept 0 for both.
const episodeQuery = z.object({
  tmdbId: q.int({ min: 1, message: TMDB_ID_INVALID }),
  seasonNumber: q
    .int({ min: 0, message: "seasonNumber must be a whole number" })
    .optional(),
  episodeNumber: q
    .int({ min: 0, message: "episodeNumber must be a whole number" })
    .optional(),
});

export const listEpisodeStatusesSchemas = { query: episodeQuery };

export const updateEpisodeStatusSchemas = {
  body: z.object({
    tmdbId,
    seasonNumber: z
      .int(EPISODE_NUMBERS_REQUIRED)
      .min(0, EPISODE_NUMBERS_INVALID),
    episodeNumber: z
      .int(EPISODE_NUMBERS_REQUIRED)
      .min(1, EPISODE_NUMBERS_INVALID),
    watched: z.boolean().default(true),
  }),
};

export const batchUpdateEpisodeStatusesSchemas = {
  body: z.object({
    tmdbId,
    episodes: z
      .array(
        z.object({
          seasonNumber: z.int(EPISODE_ITEM_INVALID).min(0, EPISODE_ITEM_INVALID),
          episodeNumber: z
            .int(EPISODE_ITEM_INVALID)
            .min(0, EPISODE_ITEM_INVALID),
          watched: z.boolean(EPISODE_ITEM_INVALID),
        }),
        "tmdbId and episodes array are required",
      )
      .min(1, "Episodes array cannot be empty")
      .max(100, "Cannot update more than 100 episodes at once"),
  }),
};

export const deleteEpisodeStatusesSchemas = { query: episodeQuery };

export const markNextEpisodeWatchedSchemas = {
  body: z.object({
    tmdbId: z
      .int("tmdbId is required and must be a number")
      .positive("tmdbId is required and must be a number"),
  }),
};
