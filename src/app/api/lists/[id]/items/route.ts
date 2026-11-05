import { authedRoute } from "@/lib/api/route";
import * as listsApi from "@/lib/lists/contract";
import {
  createListItemSchemas,
  getListItemsSchemas,
} from "@/lib/lists/schemas";
import { createListItem, getListItems } from "@/lib/lists/service";

// GET /api/lists/[id]/items - Get a list's items
export const GET = authedRoute(
  listsApi.getListItems,
  getListItemsSchemas,
  ({ user, params, query }) =>
    getListItems(user.id, params.id, query.watchStatus, query.sortOrder),
);

// POST /api/lists/[id]/items - Add item to list
export const POST = authedRoute(
  listsApi.createListItem,
  createListItemSchemas,
  async ({ user, params, body }) => {
    const item = await createListItem(user.id, params.id, body);
    return typeof item === "string" ? item : { item };
  },
);
