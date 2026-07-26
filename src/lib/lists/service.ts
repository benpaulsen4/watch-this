import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";

import type {
  ContentTypeEnum,
  ListTypeEnum,
  NewList,
  PermissionLevelEnum,
  WatchStatusEnum,
} from "../db";
import {
  activityFeed,
  ActivityType,
  db,
  listCollaborators,
  listItems,
  lists,
  PermissionLevel,
  userContentStatus,
  users,
} from "../db";
import { expectRow } from "../db/expectRow";
import {
  addToCache,
  getAllCachedContent,
  getCachedContent,
} from "../tmdb/cache-utils";
import {
  Collaborator,
  CreateCollaboratorInput,
  CreateListInput,
  CreateListItemInput,
  DeleteResponse,
  GetListItemsResponse,
  GetListResponse,
  ListCollaboratorsResponse,
  ListItemRow as ListItemResponse,
  ListListsResponse as ListResponse,
  UpdateCollaboratorInput,
  UpdateCollaboratorsResponse,
  UpdateListInput,
} from "./types";

async function fetchLists(
  userId: string,
  isArchived: boolean
): Promise<ListResponse[]> {
  // Get lists with counts in a single optimized query
  const userListsWithCounts = await db
    .select({
      id: lists.id,
      name: lists.name,
      description: lists.description,
      listType: lists.listType,
      isPublic: lists.isPublic,
      isArchived: lists.isArchived,
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
    .where(
      and(
        or(eq(lists.ownerId, userId), eq(listCollaborators.userId, userId)),
        eq(lists.isArchived, isArchived)
      )
    )
    .groupBy(
      lists.id,
      lists.name,
      lists.description,
      lists.listType,
      lists.isPublic,
      lists.isArchived,
      lists.ownerId,
      lists.createdAt,
      lists.updatedAt
    );

  if (userListsWithCounts.length === 0) return [];

  // DATA-06: this used to map over the lists and await a poster query, a cache
  // query and a status query *per list* -- 40 lists meant ~120 round-trips, and
  // the Promise.all fan-out saturated the pool rather than helping. One
  // windowed query now fetches the newest 6 items for every list at once, and
  // a single getAllCachedContent call resolves the union of their content.
  const listIds = userListsWithCounts.map((l) => l.id);

  const rankedItems = db
    .select({
      listId: listItems.listId,
      tmdbId: listItems.tmdbId,
      contentType: listItems.contentType,
      rowNumber: sql<number>`ROW_NUMBER() OVER (
          PARTITION BY ${listItems.listId}
          ORDER BY ${listItems.createdAt} DESC
        )`.as("row_number"),
    })
    .from(listItems)
    .where(inArray(listItems.listId, listIds))
    .as("ranked_items");

  const posterItems = await db
    .select({
      listId: rankedItems.listId,
      tmdbId: rankedItems.tmdbId,
      contentType: rankedItems.contentType,
    })
    .from(rankedItems)
    .where(sql`${rankedItems.rowNumber} <= 6`)
    .orderBy(rankedItems.listId, rankedItems.rowNumber);

  // Resolve every distinct piece of content in one call rather than once per
  // list; an uncached item would otherwise trigger a TMDB fetch inside the
  // per-list fan-out.
  const uniqueContent = new Map<
    string,
    { tmdbId: number; contentType: ContentTypeEnum }
  >();
  for (const item of posterItems) {
    uniqueContent.set(`${item.contentType}:${item.tmdbId}`, {
      tmdbId: item.tmdbId,
      contentType: item.contentType as ContentTypeEnum,
    });
  }

  const contentDetails = await getAllCachedContent(
    Array.from(uniqueContent.values()),
    userId
  );
  const posterPathByKey = new Map<string, string | null>();
  for (const detail of contentDetails) {
    posterPathByKey.set(
      `${detail.contentType}:${detail.tmdbId}`,
      detail.posterPath ?? null
    );
  }

  const postersByList = new Map<string, string[]>();
  for (const item of posterItems) {
    const posterPath = posterPathByKey.get(
      `${item.contentType}:${item.tmdbId}`
    );
    if (!posterPath) continue;
    const existing = postersByList.get(item.listId);
    if (existing) {
      if (existing.length < 4) existing.push(posterPath);
    } else {
      postersByList.set(item.listId, [posterPath]);
    }
  }

  return userListsWithCounts.map((list) => ({
    ...list,
    posterPaths: postersByList.get(list.id) ?? [],
  }));
}

export async function listLists(userId: string): Promise<ListResponse[]> {
  return fetchLists(userId, false);
}

export async function listArchivedLists(
  userId: string
): Promise<ListResponse[]> {
  return fetchLists(userId, true);
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
        isArchived: lists.isArchived,
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

    // Get item count and collaborator count
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

    return {
      ...listData,
      listType: listData.listType as ListTypeEnum,
      createdAt: listData.createdAt.toISOString(),
      updatedAt: listData.updatedAt.toISOString(),
      itemCount: itemCountResult[0]?.count || 0,
      collaborators: collaboratorCountResult[0]?.count || 0,
    };
  } catch (error) {
    console.error("Error in getList:", error);
    return "notFound";
  }
}

export async function getListItems(
  userId: string,
  listId: string,
  watchStatus?: (WatchStatusEnum | "none")[],
  sortOrder: "ascending" | "descending" = "ascending"
): Promise<GetListItemsResponse | "notFound"> {
  try {
    // Check if user has access to this list (owner or collaborator)
    const [listData] = await db
      .select({
        id: lists.id,
        ownerId: lists.ownerId,
        isPublic: lists.isPublic,
      })
      .from(lists)
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

    const conditions = [eq(listItems.listId, listId)];

    // Apply watch status filter
    if (watchStatus && watchStatus.length > 0) {
      const statuses = watchStatus.filter(
        (s) => s !== "none"
      ) as WatchStatusEnum[];
      const hasNone = watchStatus.includes("none");

      if (statuses.length > 0 && hasNone) {
        conditions.push(
          or(
            inArray(userContentStatus.status, statuses),
            isNull(userContentStatus.status)
          )!
        );
      } else if (statuses.length > 0) {
        conditions.push(inArray(userContentStatus.status, statuses));
      } else if (hasNone) {
        conditions.push(isNull(userContentStatus.status));
      }
    }

    let query = db
      .select({
        id: listItems.id,
        tmdbId: listItems.tmdbId,
        contentType: listItems.contentType,
        createdAt: listItems.createdAt,
      })
      .from(listItems)
      .leftJoin(
        userContentStatus,
        and(
          eq(listItems.tmdbId, userContentStatus.tmdbId),
          eq(listItems.contentType, userContentStatus.contentType),
          eq(userContentStatus.userId, userId)
        )
      )
      .where(and(...conditions))
      .$dynamic();

    // Apply sort order
    if (sortOrder === "descending") {
      query = query.orderBy(desc(listItems.createdAt));
    } else {
      query = query.orderBy(asc(listItems.createdAt));
    }

    const basicItems = await query;

    const completeItems = (
      await getAllCachedContent(
        basicItems as { tmdbId: number; contentType: ContentTypeEnum }[],
        userId
      )
    ).map((item) => {
      const original = basicItems.find(
        (i) => i.tmdbId === item.tmdbId && i.contentType === item.contentType
      );
      return {
        ...item,
        listItemId: original!.id,
        createdAt: original!.createdAt.toISOString(),
      };
    });

    return {
      items: completeItems,
    };
  } catch (error) {
    console.error("Error in getListItems:", error);
    return "notFound";
  }
}

export async function createList(
  userId: string,
  input: CreateListInput
): Promise<ListResponse> {
  // Unconditional single-row insert with no onConflict clause: it returns the
  // new row or throws, so the result array is never empty.
  const newList = expectRow(
    await db
      .insert(lists)
      .values({
        ownerId: userId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        listType: input.listType ?? "mixed",
        isPublic: Boolean(input.isPublic ?? false),
        syncWatchStatus: Boolean(input.syncWatchStatus ?? false),
      })
      .returning(),
    "createList insert lists"
  );

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
    listType: newList.listType as ListTypeEnum,
    isPublic: newList.isPublic,
    isArchived: newList.isArchived,
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
  if (input.isArchived !== undefined) {
    updateData.isArchived = Boolean(input.isArchived);
    if (updateData.isArchived) {
      updateData.syncWatchStatus = false;
    }
  }
  if (input.syncWatchStatus !== undefined)
    updateData.syncWatchStatus = Boolean(input.syncWatchStatus);

  const [updated] = await db
    .update(lists)
    .set(updateData)
    .where(eq(lists.id, listId))
    .returning();

  // The ownership check above proved the list existed, but that read and this
  // write are not in one transaction: a concurrent deleteList can land in
  // between, in which case the UPDATE matches nothing and returns []. Report it
  // as the same "notFound" the ownership check would have returned.
  if (!updated) return "notFound";

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
    isArchived: updated.isArchived,
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

  // DATA-07(b): the delete and its audit entry must commit together. Previously
  // the activity insert sat in a swallowing try/catch after an already-committed
  // delete, so a failure silently lost the audit record for a destructive action.
  //
  // This is the *strict* half of the rule written out in `createListItem`:
  // deleting a list is destructive and irreversible, so its audit entry is part
  // of the action rather than a feed item, and losing the entry rolls the delete
  // back. Every other activity write in this module is best-effort. Do not
  // "unify" the two -- the asymmetry is deliberate.
  await db.transaction(async (tx) => {
    await tx.delete(lists).where(eq(lists.id, listId));
    await tx.insert(activityFeed).values({
      userId,
      activityType: ActivityType.LIST_DELETED,
      metadata: { listName: existing.name, listType: existing.listType },
      createdAt: new Date(),
    });
  });
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
    .where(eq(lists.id, listId))
    .limit(1);
  if (!listData) return "notFound";

  if (listData.ownerId !== userId) {
    const [collaborator] = await db
      .select({ permissionLevel: listCollaborators.permissionLevel })
      .from(listCollaborators)
      .where(
        and(
          eq(listCollaborators.listId, listId),
          eq(listCollaborators.userId, userId)
        )
      )
      .limit(1);

    if (!collaborator) return "notFound";
    if (collaborator.permissionLevel !== PermissionLevel.COLLABORATOR)
      return "notFound";
  }

  if (
    listData.listType !== "mixed" &&
    !(
      (listData.listType === "movies" && input.contentType === "movie") ||
      (listData.listType === "tv" && input.contentType === "tv")
    )
  ) {
    return "invalidType";
  }

  // DATA-07(c): the TMDB round-trip is kept out of any transaction -- a network
  // call must never be held open inside one.
  //
  // This deliberately runs *before* the insert, even though it means a duplicate
  // add pays for it before finding out it is a duplicate. Warming the cache is a
  // precondition of the row existing, not merely metadata for the activity entry
  // below: every read path re-derives list items through `getAllCachedContent`,
  // which calls `addToCache` for anything uncached and throws for a tmdbId TMDB
  // does not know. Inserting first would let an unresolvable tmdbId become a
  // permanent row that makes `getListItems` return "notFound" for the entire
  // list and `fetchLists` throw outright -- with no in-app way to delete it.
  // The cost on a duplicate add is one TMDB read (served from the Next data
  // cache, `revalidate: 3600`) plus two queries, which is the cheaper half of
  // the trade against a row that can outlive its content.
  const contentDetails = await addToCache(input.tmdbId, input.contentType);

  // DATA-07(c): this used to be a check-then-insert. Two concurrent adds of the
  // same title both passed the existence check and the loser hit the unique
  // constraint, surfacing as a 500 instead of the intended "conflict". Let the
  // database arbitrate: an empty `returning()` means another writer won.
  const [newItem] = await db
    .insert(listItems)
    .values({
      listId,
      tmdbId: Number(input.tmdbId),
      contentType: input.contentType,
    })
    .onConflictDoNothing()
    .returning();

  if (!newItem) return "conflict";

  // The rule for activity_feed writes in this module, so it is not re-litigated:
  //
  //   * A *destructive* action's entry is strict -- it commits in the same
  //     transaction as the action, so losing the record fails the action.
  //     `deleteList` is the only case; the entry is the audit trail for
  //     something the user cannot undo.
  //   * Every other entry is best-effort -- it is a feed item, not an audit
  //     record, and must never fail the user's action. Log and carry on.
  //
  // Adding to a list is the second kind. A failed feed insert must not turn a
  // successful "add to list" into an error, so this write is deliberately
  // outside any transaction with the item insert above.
  try {
    await db.insert(activityFeed).values({
      userId,
      activityType: ActivityType.LIST_ITEM_ADDED,
      tmdbId: Number(input.tmdbId),
      contentType: input.contentType,
      listId,
      metadata: {
        title: contentDetails!.title,
        listName: listData?.name || "",
        posterPath: contentDetails!.posterPath,
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
    .where(eq(lists.id, listId))
    .limit(1);
  if (!listData) return "notFound";

  if (listData.ownerId !== userId) {
    const [collaborator] = await db
      .select({ permissionLevel: listCollaborators.permissionLevel })
      .from(listCollaborators)
      .where(
        and(
          eq(listCollaborators.listId, listId),
          eq(listCollaborators.userId, userId)
        )
      )
      .limit(1);

    if (!collaborator) return "notFound";
    if (collaborator.permissionLevel !== PermissionLevel.COLLABORATOR)
      return "notFound";
  }

  const [existingItem] = await db
    .select({
      id: listItems.id,
      tmdbId: listItems.tmdbId,
      contentType: listItems.contentType,
    })
    .from(listItems)
    .where(and(eq(listItems.id, itemId), eq(listItems.listId, listId)))
    .limit(1);
  if (!existingItem) return "notFound";

  await db.delete(listItems).where(eq(listItems.id, itemId));

  const contentDetails = await getCachedContent(
    existingItem.tmdbId,
    existingItem.contentType as ContentTypeEnum,
    userId
  );

  try {
    await db.insert(activityFeed).values({
      userId,
      activityType: ActivityType.LIST_ITEM_REMOVED,
      tmdbId: existingItem.tmdbId,
      contentType: existingItem.contentType,
      listId,
      metadata: {
        title: contentDetails!.title,
        posterPath: contentDetails!.posterPath,
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

  // Unconditional single-row insert with no onConflict clause: it returns the
  // new row or throws, so the result array is never empty.
  const newCollaborator = expectRow(
    await db
      .insert(listCollaborators)
      .values({
        listId,
        userId: targetUser.id,
        permissionLevel: input.permissionLevel,
      })
      .returning(),
    "createListCollaborator insert listCollaborators"
  );

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

  // As in updateList: the collaborator lookup above is a separate statement, so
  // a concurrent deleteListCollaborator can remove the row before this UPDATE
  // runs and leave it matching nothing.
  if (!updated) return "notFound";

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
