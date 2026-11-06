import { z } from "zod";

import { q } from "../api/query";

const CONTENT_TYPE_INVALID = 'Type must be either "movie" or "tv"';

const contentType = z.enum(["movie", "tv"], CONTENT_TYPE_INVALID);

export const getContentDetailsSchemas = {
  query: z.object({
    id: q.int({ min: 1, message: "Invalid content ID" }),
    type: contentType,
  }),
};

export const getCreditsSchemas = {
  query: z.object({
    id: q.int({ min: 1, message: "Invalid id" }),
    type: z.enum(["movie", "tv"], "Invalid type"),
  }),
};

export const getGenresSchemas = {
  query: z.object({
    type: z
      .enum(["movie", "tv", "all"], 'Type must be "movie", "tv", or "all"')
      .optional(),
  }),
};

// Season 0 holds specials, and some seasons number an episode 0.
export const getSeasonOrEpisodeSchemas = {
  params: z.object({ id: q.int({ min: 1, message: "Invalid TV show ID" }) }),
  query: z.object({
    season: q.int({ min: 0, message: "Invalid season number" }),
    episode: q.int({ min: 0, message: "Invalid episode number" }).optional(),
  }),
};
