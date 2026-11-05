import { and, eq, or } from "drizzle-orm";

import { authedRoute } from "@/lib/api/route";
import { db } from "@/lib/db";
import { listCollaborators, listItems, lists } from "@/lib/db/schema";
import * as listsApi from "@/lib/lists/contract";
import { listContentListsSchemas } from "@/lib/lists/schemas";

// GET /api/content/[id]/lists - The user's lists containing this content
//
// Matching on the TMDB id alone reported the movie's row for the show and vice
// versa, which showed an "Added" badge for a list the title was never in and
// made Remove delete the unrelated row, so the query filters on the type too.
export const GET = authedRoute(
  listsApi.listContentLists,
  listContentListsSchemas,
  async ({ user, params, query }) => {
    // Find all lists where the user is owner or collaborator that contain this content
    const userListsWithContent = await db
      .select({
        listId: lists.id,
        itemId: listItems.id,
      })
      .from(lists)
      .innerJoin(listItems, eq(lists.id, listItems.listId))
      .leftJoin(listCollaborators, eq(listCollaborators.listId, lists.id))
      .where(
        and(
          or(eq(lists.ownerId, user.id), eq(listCollaborators.userId, user.id)),
          eq(listItems.tmdbId, params.id),
          eq(listItems.contentType, query.contentType),
        ),
      );

    return userListsWithContent.map((item) => ({
      listId: item.listId,
      itemId: item.itemId,
    }));
  },
);
