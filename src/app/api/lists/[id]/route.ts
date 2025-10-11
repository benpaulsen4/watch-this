import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  lists,
  listItems,
  listCollaborators,
  users,
  activityFeed,
  ActivityType,
} from "@/lib/db/schema";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
import { eq, and, or, count, asc } from "drizzle-orm";
import { tmdbClient } from "@/lib/tmdb/client";
import { enrichWithContentStatus } from "@/lib/tmdb/contentUtils";

// GET /api/lists/[id] - Get a specific list
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const listId = url.pathname.split("/").pop();

    if (!listId) {
      return NextResponse.json(
        { error: "List ID is required" },
        { status: 400 },
      );
    }

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
            eq(lists.isPublic, true),
          ),
        ),
      )
      .limit(1);

    if (!listData) {
      return NextResponse.json(
        { error: "List not found or access denied" },
        { status: 404 },
      );
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
          createdAt: item.createdAt,
        };
      }),
    );

    const enrichedItems = await Promise.all(
      tmdbItems.map(
        async (item) => await enrichWithContentStatus(item, userId),
      ),
    );

    const listWithItems = {
      ...listData,
      items: enrichedItems || [],
      collaborators: collaboratorCountResult[0]?.count || 0,
    };

    return NextResponse.json(listWithItems);
  } catch (error) {
    console.error("Error fetching list:", error);
    return NextResponse.json(
      { error: "Failed to fetch list" },
      { status: 500 },
    );
  }
});

// PUT /api/lists/[id] - Update a list
export const PUT = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const listId = url.pathname.split("/").pop();

    if (!listId) {
      return NextResponse.json(
        { error: "List ID is required" },
        { status: 400 },
      );
    }

    const body = await request.json();

    const { name, description, listType, isPublic, syncWatchStatus } = body;

    // Check if user owns this list
    const [existingList] = await db
      .select({ ownerId: lists.ownerId })
      .from(lists)
      .where(eq(lists.id, listId))
      .limit(1);

    if (!existingList) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    if (existingList.ownerId !== userId) {
      return NextResponse.json(
        { error: "Only the list owner can update this list" },
        { status: 403 },
      );
    }

    // Validate input
    if (name !== undefined) {
      if (!name || name.trim().length === 0) {
        return NextResponse.json(
          { error: "List name is required" },
          { status: 400 },
        );
      }
      if (name.length > 100) {
        return NextResponse.json(
          { error: "List name must be 100 characters or less" },
          { status: 400 },
        );
      }
    }

    if (listType !== undefined) {
      const validListTypes = ["movies", "tv", "mixed"];
      if (!validListTypes.includes(listType)) {
        return NextResponse.json(
          { error: "Invalid list type. Must be 'movies', 'tv', or 'mixed'" },
          { status: 400 },
        );
      }
    }

    // Build update object
    const updateData: Partial<typeof lists.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined)
      updateData.description = description?.trim() || null;
    if (listType !== undefined) updateData.listType = listType;
    if (isPublic !== undefined) updateData.isPublic = Boolean(isPublic);
    if (syncWatchStatus !== undefined)
      updateData.syncWatchStatus = Boolean(syncWatchStatus);

    // Update the list
    const [updatedList] = await db
      .update(lists)
      .set(updateData)
      .where(eq(lists.id, listId))
      .returning();

    // Get counts for the response
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

    const listWithCounts = {
      ...updatedList,
      itemCount: itemCountResult[0]?.count || 0,
      collaborators: collaboratorCountResult[0]?.count || 0,
    };

    // Generate activity for list update
    try {
      await db.insert(activityFeed).values({
        userId,
        activityType: ActivityType.LIST_UPDATED,
        listId,
        metadata: {
          listName: updatedList.name,
          listType: updatedList.listType,
          isPublic: updatedList.isPublic,
        },
        createdAt: new Date(),
      });
    } catch (activityError) {
      console.error(
        "Failed to create activity for list update:",
        activityError,
      );
      // Don't fail the main operation if activity creation fails
    }

    return NextResponse.json({ list: listWithCounts });
  } catch (error) {
    console.error("Error updating list:", error);
    return NextResponse.json(
      { error: "Failed to update list" },
      { status: 500 },
    );
  }
});

// DELETE /api/lists/[id] - Delete a list
export const DELETE = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const listId = url.pathname.split("/").pop();

    if (!listId) {
      return NextResponse.json(
        { error: "List ID is required" },
        { status: 400 },
      );
    }

    // Check if user owns this list
    const [existingList] = await db
      .select({ ownerId: lists.ownerId })
      .from(lists)
      .where(eq(lists.id, listId))
      .limit(1);

    if (!existingList) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    if (existingList.ownerId !== userId) {
      return NextResponse.json(
        { error: "Only the list owner can delete this list" },
        { status: 403 },
      );
    }

    // Get list info and collaborators before deletion for activity
    const [listInfo] = await db
      .select({ name: lists.name, listType: lists.listType })
      .from(lists)
      .where(eq(lists.id, listId))
      .limit(1);

    // Delete the list (cascade will handle related records)
    await db.delete(lists).where(eq(lists.id, listId));

    // Generate activity for list deletion
    try {
      await db.insert(activityFeed).values({
        userId,
        activityType: ActivityType.LIST_DELETED,
        metadata: {
          listName: listInfo?.name || "Unknown List",
          listType: listInfo?.listType || "mixed",
        },
        createdAt: new Date(),
      });
    } catch (activityError) {
      console.error(
        "Failed to create activity for list deletion:",
        activityError,
      );
      // Don't fail the main operation if activity creation fails
    }

    return NextResponse.json({ message: "List deleted successfully" });
  } catch (error) {
    console.error("Error deleting list:", error);
    return NextResponse.json(
      { error: "Failed to delete list" },
      { status: 500 },
    );
  }
});
