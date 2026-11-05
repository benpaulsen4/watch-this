import { z } from "zod";

import { q } from "../api/query";
import {
  ContentType,
  ListType,
  WatchStatus,
} from "../db/schema";

const LIST_NAME_REQUIRED = "List name is required";
const LIST_NAME_TOO_LONG = "List name must be 100 characters or less";
const LIST_TYPE_INVALID = "Invalid list type. Must be 'movies', 'tv', or 'mixed'";
const TMDB_ID_INVALID = "tmdbId must be a positive integer";

const listName = z
  .string(LIST_NAME_REQUIRED)
  .trim()
  .min(1, LIST_NAME_REQUIRED)
  .max(100, LIST_NAME_TOO_LONG);

const listParams = z.object({ id: z.uuid("Invalid list ID") });

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

export const getListItemsSchemas = {
  params: listParams,
  // Deliberately forgiving: old URLs can carry filter values that no longer
  // exist, through ListFilters, and those are ignored rather than rejected.
  query: z.object({
    watchStatus: q
      .list(z.enum({ ...WatchStatus, NONE: "none" }), { dropInvalid: true })
      .optional(),
    sortOrder: z
      .enum(["ascending", "descending"])
      .default("ascending")
      .catch("ascending"),
  }),
};

export const createListItemSchemas = {
  params: listParams,
  body: z.object({
    // A positive integer at the boundary (API-06), so a crafted string (e.g.
    // "../../authentication/token/new") can never reach the upstream TMDB path
    // template.
    tmdbId: z.int(TMDB_ID_INVALID).positive(TMDB_ID_INVALID),
    contentType: z.enum(
      ContentType,
      'contentType must be either "movie" or "tv"',
    ),
  }),
};

export const deleteListItemSchemas = {
  params: z.object({
    id: z.uuid("Invalid list ID"),
    itemId: z.uuid("Invalid item ID"),
  }),
};

export const listContentListsSchemas = {
  params: z.object({ id: q.int({ min: 1, message: "Invalid content ID" }) }),
  query: z.object({
    // A TMDB id is only unique within a content type, and `list_items` is keyed
    // on (listId, tmdbId, contentType), so the caller must say which it means.
    contentType: z.enum(ContentType, "Invalid content type"),
  }),
};
