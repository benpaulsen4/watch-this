import { authedRoute } from "@/lib/api/route";
import * as listsApi from "@/lib/lists/contract";
import {
  deleteListSchemas,
  getListSchemas,
  updateListSchemas,
} from "@/lib/lists/schemas";
import { deleteList, getList, updateList } from "@/lib/lists/service";

// GET /api/lists/[id] - Get a specific list
//
// getList returns the "notFound" sentinel for both a missing list and an
// access-denied list (they are indistinguishable here), which the contract maps
// to a real 404 instead of serializing the string with a 200 (API-08).
export const GET = authedRoute(
  listsApi.getList,
  getListSchemas,
  ({ user, params }) => getList(user.id, params.id),
);

// PUT /api/lists/[id] - Update a list
export const PUT = authedRoute(
  listsApi.updateList,
  updateListSchemas,
  async ({ user, params, body }) => {
    const updated = await updateList(user.id, params.id, body);
    return typeof updated === "string" ? updated : { list: updated };
  },
);

// DELETE /api/lists/[id] - Delete a list
export const DELETE = authedRoute(
  listsApi.deleteList,
  deleteListSchemas,
  ({ user, params }) => deleteList(user.id, params.id),
);
