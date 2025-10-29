import { sql, eq, or, desc, and, isNotNull, asc, count } from "drizzle-orm";
import {
  db,
  lists,
  listItems,
  listCollaborators,
  users,
  ListTypeEnum,
} from "../db";
import { tmdbClient, TMDBMovie, TMDBTVShow } from "../tmdb/client";
import { enrichWithContentStatus } from "../tmdb/contentUtils";

// Interface for list items that matches what the frontend expects
export interface ListItem extends TMDBMovie, TMDBTVShow {
  listItemId: string;
  createdAt: string;
}

// Interface for the complete list response
export interface ListResponse {
  id: string;
  name: string;
  description: string | null;
  listType: ListTypeEnum;
  isPublic: boolean;
  syncWatchStatus: boolean;
  ownerId: string;
  ownerUsername: string;
  ownerProfilePictureUrl: string | null;
  createdAt: string;
  updatedAt: string;
  items: ListItem[];
  collaborators: number;
}

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

export async function getListResponse(
  userId: string,
  listId: string
): Promise<ListResponse | "notFound"> {
  try {
    // Check if user has access to this list (owner or collaborator)
    const [listData] = await db
      .select({
        id: lists.id,
        name: lists.name,
        description: lists.description,
        listType: lists.listType,
        isPublic: lists.isPublic,
        syncWatchStatus: lists.syncWatchStatus,
        ownerId: lists.ownerId,
        ownerUsername: users.username,
        ownerProfilePictureUrl: users.profilePictureUrl,
        createdAt: lists.createdAt,
        updatedAt: lists.updatedAt,
      })
      .from(lists)
      .innerJoin(users, eq(users.id, lists.ownerId))
      .leftJoin(listCollaborators, eq(listCollaborators.listId, lists.id))
      .where(
        and(
          eq(lists.id, listId),
          or(
            eq(lists.ownerId, userId),
            eq(listCollaborators.userId, userId),
            eq(lists.isPublic, true)
          )
        )
      )
      .limit(1);

    if (!listData) {
      return "notFound";
    }

    // Get basic list items and collaborator count
    const [basicItems, collaboratorCountResult] = await Promise.all([
      db
        .select({
          id: listItems.id,
          tmdbId: listItems.tmdbId,
          contentType: listItems.contentType,
          title: listItems.title,
          posterPath: listItems.posterPath,
          createdAt: listItems.createdAt,
        })
        .from(listItems)
        .where(eq(listItems.listId, listId))
        .orderBy(asc(listItems.createdAt)),
      db
        .select({ count: count() })
        .from(listCollaborators)
        .where(eq(listCollaborators.listId, listId)),
    ]);

    const tmdbItems = await Promise.all(
      basicItems.map(async (item) => {
        const tmdbData =
          item.contentType === "movie"
            ? await tmdbClient.getMovieDetails(item.tmdbId)
            : await tmdbClient.getTVShowDetails(item.tmdbId);
        return {
          ...tmdbData,
          // Override with list-specific data
          listItemId: item.id,
          createdAt: item.createdAt.toISOString(),
        } as unknown as ListItem;
      })
    );

    const enrichedItems = (await Promise.all(
      tmdbItems.map(async (item) => await enrichWithContentStatus(item, userId))
    )) as ListItem[];

    return {
      ...listData,
      listType: listData.listType as ListTypeEnum,
      createdAt: listData.createdAt.toISOString(),
      updatedAt: listData.updatedAt.toISOString(),
      items: enrichedItems || [],
      collaborators: collaboratorCountResult[0]?.count || 0,
    };
  } catch (error) {
    // Handle any other errors that might occur during processing
    console.error("Error in getListResponse:", error);
    return "notFound";
  }
}
