import { authedRoute } from "@/lib/api/route";
import * as listsApi from "@/lib/lists/contract";
import { deleteListItemSchemas } from "@/lib/lists/schemas";
import { deleteListItem } from "@/lib/lists/service";

// DELETE /api/lists/[id]/items/[itemId] - Remove item from list
export const DELETE = authedRoute(
  listsApi.deleteListItem,
  deleteListItemSchemas,
  ({ user, params }) => deleteListItem(user.id, params.id, params.itemId),
);
