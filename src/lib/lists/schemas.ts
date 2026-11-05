import { z } from "zod";

import { q } from "../api/query";
import {
  ContentType,
  ListType,
  PermissionLevel,
  WatchStatus,
} from "../db/schema";

const LIST_NAME_REQUIRED = "List name is required";
const LIST_NAME_TOO_LONG = "List name must be 100 characters or less";
const LIST_TYPE_INVALID = "Invalid list type. Must be 'movies', 'tv', or 'mixed'";
export const TMDB_ID_INVALID = "tmdbId must be a positive integer";

const listName = z
  .string(LIST_NAME_REQUIRED)
  .trim()
  .min(1, LIST_NAME_REQUIRED)
  .max(100, LIST_NAME_TOO_LONG);

export const listParams = z.object({ id: z.uuid("Invalid list ID") });

export const getListSchemas = { params: listParams };

export const createListSchemas = {
  body: z.object({
    name: listName,
    description: z.string().nullable().optional(),
    listType: z.enum(ListType, LIST_TYPE_INVALID).default(ListType.MIXED),
    isPublic: z.boolean().default(false),
    syncWatchStatus: z.boolean().default(false),
  }),
};

export const updateListSchemas = {
  params: listParams,
  body: z.object({
    name: listName.optional(),
    description: z.string().nullable().optional(),
    listType: z.enum(ListType, LIST_TYPE_INVALID).optional(),
    isPublic: z.boolean().optional(),
    isArchived: z.boolean().optional(),
    syncWatchStatus: z.boolean().optional(),
  }),
};

export const deleteListSchemas = { params: listParams };
