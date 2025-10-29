import { sql, eq, or, desc, and, isNotNull } from "drizzle-orm";
import { db, lists, listItems, listCollaborators } from "../db";

export async function getListsResponse(userId: string) {
  // Get lists with counts in a single optimized query
  const userListsWithCounts = await db
    .select({
      id: lists.id,
      name: lists.name,
      description: lists.description,
      listType: lists.listType,
      isPublic: lists.isPublic,
      syncWatchStatus: lists.syncWatchStatus,
      ownerId: lists.ownerId,
      createdAt: lists.createdAt,
      updatedAt: lists.updatedAt,
      itemCount: sql<number>`(
          SELECT COUNT(*) 
          FROM ${listItems} 
          WHERE ${listItems.listId} = ${lists.id}
        )`.as("item_count"),
      collaborators: sql<number>`(
          SELECT COUNT(*) 
          FROM ${listCollaborators} 
          WHERE ${listCollaborators.listId} = ${lists.id}
        )`.as("collaborator_count"),
    })
    .from(lists)
    .leftJoin(listCollaborators, eq(listCollaborators.listId, lists.id))
    .where(or(eq(lists.ownerId, userId), eq(listCollaborators.userId, userId)))
    .groupBy(
      lists.id,
      lists.name,
      lists.description,
      lists.listType,
      lists.isPublic,
      lists.ownerId,
      lists.createdAt,
      lists.updatedAt
    );

  // Get poster URLs for each list (up to 4 items)
  return await Promise.all(
    userListsWithCounts.map(async (list) => {
      const posterItems = await db
        .select({
          posterPath: listItems.posterPath,
        })
        .from(listItems)
        .where(
          and(eq(listItems.listId, list.id), isNotNull(listItems.posterPath))
        )
        .orderBy(desc(listItems.createdAt))
        .limit(4);

      return {
        ...list,
        posterPaths: posterItems.map((i) => i.posterPath!),
      };
    })
  );
}
