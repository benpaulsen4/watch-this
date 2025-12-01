import { sql, eq, or, desc, and, isNotNull, asc, count } from "drizzle-orm";
import {
  db,
  lists,
  listItems,
  listCollaborators,
  users,
  ListTypeEnum,
  ActivityType,
  activityFeed,
  PermissionLevelEnum,
  NewList,
} from "../db";
import { tmdbClient } from "../tmdb/client";
import { enrichWithContentStatus } from "../tmdb/contentUtils";
import {
  ListItem,
  GetListResponse,
  ListListsResponse as ListResponse,
  CreateListInput,
  UpdateListInput,
  DeleteResponse,
  CreateListItemInput,
  ListItemRow as ListItemResponse,
  Collaborator,
  CreateCollaboratorInput,
  UpdateCollaboratorInput,
  ListCollaboratorsResponse,
  UpdateCollaboratorsResponse,
} from "./types";
import { v4 as uuidv4 } from "uuid";

export async function listLists(userId: string): Promise<ListResponse[]> {
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

export async function getList(
  userId: string,
  listId: string
): Promise<GetListResponse | "notFound"> {
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

export async function createList(
  userId: string,
  input: CreateListInput
): Promise<ListResponse> {
  const [newList] = await db
    .insert(lists)
    .values({
      ownerId: userId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      listType: input.listType ?? "mixed",
      isPublic: Boolean(input.isPublic ?? false),
      syncWatchStatus: Boolean(input.syncWatchStatus ?? false),
    })
    .returning();

  try {
    await db.insert(activityFeed).values({
      userId,
      activityType: ActivityType.LIST_CREATED,
      listId: newList.id,
      metadata: {
        listName: newList.name,
        listType: newList.listType,
        isPublic: newList.isPublic,
      },
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("Error in createList activity:", error);
  }

  return {
    id: newList.id,
    name: newList.name,
    description: newList.description ?? null,
    listType: newList.listType,
    isPublic: newList.isPublic,
    syncWatchStatus: newList.syncWatchStatus,
    ownerId: newList.ownerId,
    createdAt: newList.createdAt,
    updatedAt: newList.updatedAt,
    itemCount: 0,
    collaborators: 0,
    posterPaths: [],
  };
}

export async function updateList(
  userId: string,
  listId: string,
  input: UpdateListInput
): Promise<ListResponse | "notFound" | "forbidden"> {
  const [existing] = await db
    .select({ ownerId: lists.ownerId })
    .from(lists)
    .where(eq(lists.id, listId))
    .limit(1);

  if (!existing) return "notFound";
  if (existing.ownerId !== userId) return "forbidden";

  const updateData: Partial<NewList> = {
    updatedAt: new Date(),
  };
  if (input.name !== undefined) updateData.name = input.name.trim();
  if (input.description !== undefined)
    updateData.description = input.description?.trim() || null;
  if (input.listType !== undefined) updateData.listType = input.listType;
  if (input.isPublic !== undefined)
    updateData.isPublic = Boolean(input.isPublic);
  if (input.syncWatchStatus !== undefined)
    updateData.syncWatchStatus = Boolean(input.syncWatchStatus);

  const [updated] = await db
    .update(lists)
    .set(updateData)
    .where(eq(lists.id, listId))
    .returning();

  const [itemCountResult, collaboratorCountResult] = await Promise.all([
    db
      .select({ count: count() })
      .from(listItems)
      .where(eq(listItems.listId, listId)),
    db
      .select({ count: count() })
      .from(listCollaborators)
      .where(eq(listCollaborators.listId, listId)),
  ]);

  try {
    await db.insert(activityFeed).values({
      userId,
      activityType: ActivityType.LIST_UPDATED,
      listId,
      metadata: {
        listName: updated.name,
        listType: updated.listType,
        isPublic: updated.isPublic,
      },
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("Error in updateList activity:", error);
  }

  return {
    id: updated.id,
    name: updated.name,
    description: updated.description ?? null,
    listType: updated.listType,
    isPublic: updated.isPublic,
    syncWatchStatus: updated.syncWatchStatus,
    ownerId: updated.ownerId,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
    itemCount: itemCountResult[0]?.count || 0,
    collaborators: collaboratorCountResult[0]?.count || 0,
    posterPaths: [],
  };
}

export async function deleteList(
  userId: string,
  listId: string
): Promise<DeleteResponse | "notFound" | "forbidden"> {
  const [existing] = await db
    .select({
      ownerId: lists.ownerId,
      name: lists.name,
      listType: lists.listType,
    })
    .from(lists)
    .where(eq(lists.id, listId))
    .limit(1);
  if (!existing) return "notFound";
  if (existing.ownerId !== userId) return "forbidden";

  await db.delete(lists).where(eq(lists.id, listId));
  try {
    await db.insert(activityFeed).values({
      userId,
      activityType: ActivityType.LIST_DELETED,
      metadata: { listName: existing.name, listType: existing.listType },
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("Error in deleteList activity:", error);
  }
  return { message: "List deleted successfully" };
}

export async function createListItem(
  userId: string,
  listId: string,
  input: CreateListItemInput
): Promise<ListItemResponse | "notFound" | "conflict" | "invalidType"> {
  const [listData] = await db
    .select({
      ownerId: lists.ownerId,
      listType: lists.listType,
      name: lists.name,
    })
    .from(lists)
    .leftJoin(listCollaborators, eq(listCollaborators.listId, lists.id))
    .where(
      and(
        eq(lists.id, listId),
        or(eq(lists.ownerId, userId), eq(listCollaborators.userId, userId))
      )
    )
    .limit(1);
  if (!listData) return "notFound";

  if (
    listData.listType !== "mixed" &&
    !(
      (listData.listType === "movies" && input.contentType === "movie") ||
      (listData.listType === "tv" && input.contentType === "tv")
    )
  ) {
    return "invalidType";
  }

  const [existingItem] = await db
    .select({ id: listItems.id })
    .from(listItems)
    .where(
      and(
        eq(listItems.listId, listId),
        eq(listItems.tmdbId, input.tmdbId),
        eq(listItems.contentType, input.contentType)
      )
    )
    .limit(1);
  if (existingItem) return "conflict";

  const [newItem] = await db
    .insert(listItems)
    .values({
      id: uuidv4(),
      listId,
      tmdbId: Number(input.tmdbId),
      contentType: input.contentType,
      title: input.title.trim(),
      posterPath: input.posterPath || null,
    })
    .returning();

  try {
    await db.insert(activityFeed).values({
      userId,
      activityType: ActivityType.LIST_ITEM_ADDED,
      tmdbId: Number(input.tmdbId),
      contentType: input.contentType,
      listId,
      metadata: {
        title: input.title,
        listName: listData?.name || "",
        posterPath: input.posterPath || null,
      },
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("Error in createListItem activity:", error);
  }

  return {
    id: newItem.id,
    listId: listId,
    tmdbId: newItem.tmdbId,
    contentType: newItem.contentType as "movie" | "tv",
    title: newItem.title,
    posterPath: newItem.posterPath ?? null,
    createdAt: newItem.createdAt.toISOString(),
  };
}

export async function deleteListItem(
  userId: string,
  listId: string,
  itemId: string
): Promise<DeleteResponse | "notFound"> {
  const [listData] = await db
    .select({ ownerId: lists.ownerId })
    .from(lists)
    .leftJoin(listCollaborators, eq(listCollaborators.listId, lists.id))
    .where(
      and(
        eq(lists.id, listId),
        or(eq(lists.ownerId, userId), eq(listCollaborators.userId, userId))
      )
    )
    .limit(1);
  if (!listData) return "notFound";

  const [existingItem] = await db
    .select({
      id: listItems.id,
      tmdbId: listItems.tmdbId,
      contentType: listItems.contentType,
      title: listItems.title,
      posterPath: listItems.posterPath,
    })
    .from(listItems)
    .where(and(eq(listItems.id, itemId), eq(listItems.listId, listId)))
    .limit(1);
  if (!existingItem) return "notFound";

  await db.delete(listItems).where(eq(listItems.id, itemId));

  try {
    await db.insert(activityFeed).values({
      userId,
      activityType: ActivityType.LIST_ITEM_REMOVED,
      tmdbId: existingItem.tmdbId,
      contentType: existingItem.contentType,
      listId,
      metadata: {
        title: existingItem.title,
        posterPath: existingItem.posterPath,
      },
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("Error in deleteListItem activity:", error);
  }

  return { message: "Item removed from list successfully" };
}

export async function listListCollaborators(
  userId: string,
  listId: string
): Promise<ListCollaboratorsResponse | "notFound" | "forbidden"> {
  const [listData] = await db
    .select({ id: lists.id, ownerId: lists.ownerId })
    .from(lists)
    .where(eq(lists.id, listId))
    .limit(1);
  if (!listData) return "notFound";
  if (listData.ownerId !== userId) return "forbidden";

  const rows = await db
    .select({
      id: listCollaborators.id,
      userId: listCollaborators.userId,
      username: users.username,
      profilePictureUrl: users.profilePictureUrl,
      permissionLevel: listCollaborators.permissionLevel,
      createdAt: listCollaborators.createdAt,
    })
    .from(listCollaborators)
    .innerJoin(users, eq(users.id, listCollaborators.userId))
    .where(eq(listCollaborators.listId, listId));

  const collaborators: Collaborator[] = rows.map((c) => ({
    id: c.id,
    userId: c.userId,
    username: c.username,
    profilePictureUrl: c.profilePictureUrl ?? null,
    permissionLevel: c.permissionLevel as PermissionLevelEnum,
    createdAt: c.createdAt.toISOString(),
  }));

  return { collaborators };
}

export async function createListCollaborator(
  userId: string,
  listId: string,
  input: CreateCollaboratorInput
): Promise<
  | UpdateCollaboratorsResponse
  | "notFound"
  | "forbidden"
  | "conflict"
  | "invalidUser"
> {
  const [existingList] = await db
    .select({ ownerId: lists.ownerId, name: lists.name })
    .from(lists)
    .where(eq(lists.id, listId))
    .limit(1);
  if (!existingList) return "notFound";
  if (existingList.ownerId !== userId) return "forbidden";

  const [targetUser] = await db
    .select({
      id: users.id,
      username: users.username,
      profilePictureUrl: users.profilePictureUrl,
    })
    .from(users)
    .where(eq(users.username, input.username.trim()))
    .limit(1);
  if (!targetUser) return "invalidUser";
  if (targetUser.id === userId) return "invalidUser";

  const [existingCollaborator] = await db
    .select({ id: listCollaborators.id })
    .from(listCollaborators)
    .where(
      and(
        eq(listCollaborators.listId, listId),
        eq(listCollaborators.userId, targetUser.id)
      )
    )
    .limit(1);
  if (existingCollaborator) return "conflict";

  const [newCollaborator] = await db
    .insert(listCollaborators)
    .values({
      listId,
      userId: targetUser.id,
      permissionLevel: input.permissionLevel,
    })
    .returning();

  try {
    await db.insert(activityFeed).values({
      userId,
      activityType: ActivityType.COLLABORATOR_ADDED,
      listId,
      metadata: {
        listName: existingList.name,
        collaboratorUsername: targetUser.username,
        collaboratorUserId: targetUser.id,
        permissionLevel: input.permissionLevel,
      },
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("Error in createListCollaborator activity:", error);
  }

  return {
    collaborator: {
      id: newCollaborator.id,
      userId: targetUser.id,
      username: targetUser.username,
      profilePictureUrl: targetUser.profilePictureUrl ?? null,
      permissionLevel: newCollaborator.permissionLevel as PermissionLevelEnum,
      createdAt: newCollaborator.createdAt.toISOString(),
    },
    message: `${targetUser.username} has been added as a ${input.permissionLevel} to ${existingList.name}`,
  };
}

export async function updateListCollaborator(
  userId: string,
  listId: string,
  collaboratorUserId: string,
  input: UpdateCollaboratorInput
): Promise<UpdateCollaboratorsResponse | "notFound" | "forbidden"> {
  const [existingList] = await db
    .select({ ownerId: lists.ownerId, name: lists.name })
    .from(lists)
    .where(eq(lists.id, listId))
    .limit(1);
  if (!existingList) return "notFound";
  if (existingList.ownerId !== userId) return "forbidden";

  const [existingCollaborator] = await db
    .select({ id: listCollaborators.id })
    .from(listCollaborators)
    .where(
      and(
        eq(listCollaborators.listId, listId),
        eq(listCollaborators.userId, collaboratorUserId)
      )
    )
    .limit(1);
  if (!existingCollaborator) return "notFound";

  const [updated] = await db
    .update(listCollaborators)
    .set({ permissionLevel: input.permissionLevel })
    .where(eq(listCollaborators.id, existingCollaborator.id))
    .returning();

  const [userInfo] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, collaboratorUserId))
    .limit(1);

  return {
    collaborator: {
      id: updated.id,
      userId: updated.userId,
      username: userInfo?.username || "",
      permissionLevel: updated.permissionLevel as PermissionLevelEnum,
      createdAt: updated.createdAt.toISOString(),
      profilePictureUrl: null,
    },
    message: `Permission level updated to ${input.permissionLevel}`,
  };
}

export async function deleteListCollaborator(
  userId: string,
  listId: string,
  collaboratorUserId: string
): Promise<DeleteResponse | "notFound" | "forbidden"> {
  const [existingList] = await db
    .select({ ownerId: lists.ownerId, name: lists.name })
    .from(lists)
    .where(eq(lists.id, listId))
    .limit(1);
  if (!existingList) return "notFound";
  if (existingList.ownerId !== userId) return "forbidden";

  const [existingCollaborator] = await db
    .select({ id: listCollaborators.id })
    .from(listCollaborators)
    .where(
      and(
        eq(listCollaborators.listId, listId),
        eq(listCollaborators.userId, collaboratorUserId)
      )
    )
    .limit(1);
  if (!existingCollaborator) return "notFound";

  const [userInfo] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, collaboratorUserId))
    .limit(1);

  await db
    .delete(listCollaborators)
    .where(eq(listCollaborators.id, existingCollaborator.id));

  try {
    await db.insert(activityFeed).values({
      userId,
      activityType: ActivityType.COLLABORATOR_REMOVED,
      listId,
      metadata: {
        listName: existingList.name,
        collaboratorUsername: userInfo?.username || "",
        collaboratorUserId,
      },
      createdAt: new Date(),
    });
  } catch (error) {
    console.error("Error in deleteListCollaborator activity:", error);
  }

  return {
    message: `${userInfo?.username || "User"} has been removed from ${
      existingList.name
    }`,
  };
}
