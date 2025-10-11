import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  lists,
  listItems,
  listCollaborators,
  activityFeed,
  ActivityType,
} from "@/lib/db/schema";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
import { eq, and, or } from "drizzle-orm";

// DELETE /api/lists/[id]/items/[itemId] - Remove item from list
export const DELETE = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const listId = pathParts[3]; // /api/lists/[id]/items/[itemId]
    const itemId = pathParts[5];

    if (!listId || !itemId) {
      return NextResponse.json(
        { error: "List ID and Item ID are required" },
        { status: 400 },
      );
    }

    // Check if user has access to this list (owner or collaborator)
    const [listData] = await db
      .select({ ownerId: lists.ownerId })
      .from(lists)
      .leftJoin(listCollaborators, eq(listCollaborators.listId, lists.id))
      .where(
        and(
          eq(lists.id, listId),
          or(eq(lists.ownerId, userId), eq(listCollaborators.userId, userId)),
        ),
      )
      .limit(1);

    if (!listData) {
      return NextResponse.json(
        { error: "List not found or access denied" },
        { status: 404 },
      );
    }

    // Check if the item exists in this list and get its details for activity
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

    if (!existingItem) {
      return NextResponse.json(
        { error: "Item not found in this list" },
        { status: 404 },
      );
    }

    // Delete the item
    await db.delete(listItems).where(eq(listItems.id, itemId));

    // Generate activity for content removal
    try {
      // Get list info for activity
      const [listInfo] = await db
        .select({ ownerId: lists.ownerId, name: lists.name })
        .from(lists)
        .where(eq(lists.id, listId))
        .limit(1);

      await db.insert(activityFeed).values({
        userId,
        activityType: ActivityType.LIST_ITEM_REMOVED,
        tmdbId: existingItem.tmdbId,
        contentType: existingItem.contentType,
        listId,
        metadata: {
          title: existingItem.title,
          listName: listInfo?.name || "Unknown List",
          posterPath: existingItem.posterPath,
        },
        createdAt: new Date(),
      });
    } catch (activityError) {
      console.error(
        "Failed to create activity for list item removal:",
        activityError,
      );
      // Don't fail the main operation if activity creation fails
    }

    return NextResponse.json({
      message: "Item removed from list successfully",
    });
  } catch (error) {
    console.error("Error removing item from list:", error);
    return NextResponse.json(
      { error: "Failed to remove item from list" },
      { status: 500 },
    );
  }
});

// GET /api/lists/[id]/items/[itemId] - Get a specific list item
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const listId = pathParts[3]; // /api/lists/[id]/items/[itemId]
    const itemId = pathParts[5];

    if (!listId || !itemId) {
      return NextResponse.json(
        { error: "List ID and Item ID are required" },
        { status: 400 },
      );
    }

    // Check if user has access to this list
    const [listData] = await db
      .select({ ownerId: lists.ownerId, isPublic: lists.isPublic })
      .from(lists)
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

    // Get the specific item
    const [item] = await db
      .select({
        id: listItems.id,
        tmdbId: listItems.tmdbId,
        contentType: listItems.contentType,
        title: listItems.title,
        posterPath: listItems.posterPath,
        createdAt: listItems.createdAt,
      })
      .from(listItems)
      .where(and(eq(listItems.id, itemId), eq(listItems.listId, listId)))
      .limit(1);

    if (!item) {
      return NextResponse.json(
        { error: "Item not found in this list" },
        { status: 404 },
      );
    }

    return NextResponse.json({ item });
  } catch (error) {
    console.error("Error fetching list item:", error);
    return NextResponse.json(
      { error: "Failed to fetch list item" },
      { status: 500 },
    );
  }
});
