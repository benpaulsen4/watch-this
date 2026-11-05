import { authedRoute } from "@/lib/api/route";
import * as listsApi from "@/lib/lists/contract";
import { listArchivedLists } from "@/lib/lists/service";

// GET /api/lists/archived - Get all archived lists for the authenticated user
export const GET = authedRoute(
  listsApi.listArchivedLists,
  {},
  async ({ user }) => ({ lists: await listArchivedLists(user.id) }),
);
