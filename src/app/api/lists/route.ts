import { authedRoute } from "@/lib/api/route";
import * as listsApi from "@/lib/lists/contract";
import { createListSchemas } from "@/lib/lists/schemas";
import { createList, listLists } from "@/lib/lists/service";

// GET /api/lists - Get all lists for the authenticated user
export const GET = authedRoute(listsApi.listLists, {}, async ({ user }) => ({
  lists: await listLists(user.id),
}));

// POST /api/lists - Create a new list
export const POST = authedRoute(
  listsApi.createList,
  createListSchemas,
  async ({ user, body }) => ({ list: await createList(user.id, body) }),
);
