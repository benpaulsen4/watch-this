import { z } from "zod";

import { q } from "../api/query";

const TMDB_ID_MESSAGE = "tmdbId must be a positive integer";
const DAY_OF_WEEK_MESSAGE = "dayOfWeek must be a whole number between 0-6";

const tmdbIdParam = q.int({ min: 1, message: TMDB_ID_MESSAGE });
const dayOfWeekParam = q.int({ min: 0, max: 6, message: DAY_OF_WEEK_MESSAGE });

export const getSchedulesSchemas = {
  query: z.object({
    tmdbId: tmdbIdParam.optional(),
    dayOfWeek: dayOfWeekParam.optional(),
  }),
};

export const addScheduleSchemas = {
  body: z.object({
    tmdbId: z
      .number({ error: TMDB_ID_MESSAGE })
      .int({ error: TMDB_ID_MESSAGE })
      .positive({ error: TMDB_ID_MESSAGE }),
    dayOfWeek: z
      .number({ error: DAY_OF_WEEK_MESSAGE })
      .int({ error: DAY_OF_WEEK_MESSAGE })
      .min(0, { error: DAY_OF_WEEK_MESSAGE })
      .max(6, { error: DAY_OF_WEEK_MESSAGE }),
  }),
};

export const removeSchedulesSchemas = {
  query: z.object({
    tmdbId: tmdbIdParam,
    dayOfWeek: dayOfWeekParam.optional(),
  }),
};
