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

const PAGE_INVALID = "Page must be between 1 and 1000";
const YEAR_INVALID = "Year must be between 1900 and next 5 years";

const page = q.int({ min: 1, max: 1000, message: PAGE_INVALID }).default(1);

/** Checked on each request, so the upper bound moves with the calendar. */
const year = q
  .int({ min: 1900, message: YEAR_INVALID })
  .refine((value) => value <= new Date().getFullYear() + 5, YEAR_INVALID);

const DISCOVER_SORTS = [
  "popularity.desc",
  "popularity.asc",
  "vote_average.desc",
  "vote_average.asc",
  "release_date.desc",
  "release_date.asc",
  "first_air_date.desc",
  "first_air_date.asc",
] as const;

// Deliberately forgiving: a genre, year or sort this route can't use is
// dropped rather than rejected, so the search page's other filters still apply.
export const discoverContentSchemas = {
  query: z.object({
    type: contentType.optional(),
    page,
    genre: q.int({ min: 1 }).optional().catch(undefined),
    year: year.optional().catch(undefined),
    sort_by: z.enum(DISCOVER_SORTS).optional().catch(undefined),
  }),
};

export const searchContentSchemas = {
  query: z
    .object({
      q: z
        .string("Search query is required")
        .trim()
        .min(1, "Search query is required"),
      // An unknown type falls back to searching everything, as it always has.
      type: z.enum(["all", "movie", "tv"]).default("all").catch("all"),
      year: year.optional(),
      page,
    })
    .superRefine((query, context) => {
      if (query.year !== undefined && query.type === "all") {
        context.addIssue({
          code: "custom",
          path: ["year"],
          message: "Year cannot be used with multi search",
        });
      }
    }),
};

export const getTrendingSchemas = {
  query: z.object({
    media_type: z
      .enum(["all", "movie", "tv"], 'Media type must be "all", "movie", or "tv"')
      .default("all"),
    time_window: z
      .enum(["day", "week"], 'Time window must be "day" or "week"')
      .default("week"),
  }),
};
