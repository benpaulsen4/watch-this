import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lists, listItems, listCollaborators } from "@/lib/db/schema";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
import { eq, and, or } from "drizzle-orm";

// PUT /api/lists/[id]/items/[itemId] - Update a list item
export const PUT = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const listId = pathParts[3]; // /api/lists/[id]/items/[itemId]
    const itemId = pathParts[5];
    
    if (!listId || !itemId) {
      return NextResponse.json(
        { error: 'List ID and Item ID are required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { notes, sortOrder } = body;

    // Check if user has access to this list (owner or collaborator)
    const [listData] = await db
      .select({ ownerId: lists.ownerId })
      .from(lists)
      .leftJoin(listCollaborators, eq(listCollaborators.listId, lists.id))
      .where(
        and(
          eq(lists.id, listId),
          or(
            eq(lists.ownerId, userId),
            eq(listCollaborators.userId, userId)
          )
        )
      )
      .limit(1);

    if (!listData) {
      return NextResponse.json(
        { error: "List not found or access denied" },
        { status: 404 }
      );
    }

    // Check if the item exists in this list
    const [existingItem] = await db
      .select({ id: listItems.id })
      .from(listItems)
      .where(
        and(
          eq(listItems.id, itemId),
          eq(listItems.listId, listId)
        )
      )
      .limit(1);

    if (!existingItem) {
      return NextResponse.json(
        { error: "Item not found in this list" },
        { status: 404 }
      );
    }

    // Build update object
    const updateData: Partial<typeof listItems.$inferInsert> = {};

    if (notes !== undefined) {
      updateData.notes = notes?.trim() || null;
    }

    if (sortOrder !== undefined) {
      if (typeof sortOrder !== 'number' || sortOrder < 0) {
        return NextResponse.json(
          { error: "Sort order must be a non-negative number" },
          { status: 400 }
        );
      }
      updateData.sortOrder = sortOrder;
    }

    // Update the item
    const [updatedItem] = await db
      .update(listItems)
      .set(updateData)
      .where(eq(listItems.id, itemId))
      .returning();

    return NextResponse.json({ item: updatedItem });
  } catch (error) {
    console.error("Error updating list item:", error);
    return NextResponse.json(
      { error: "Failed to update list item" },
      { status: 500 }
    );
  }
});

// DELETE /api/lists/[id]/items/[itemId] - Remove item from list
export const DELETE = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const listId = pathParts[3]; // /api/lists/[id]/items/[itemId]
    const itemId = pathParts[5];
    
    if (!listId || !itemId) {
      return NextResponse.json(
        { error: 'List ID and Item ID are required' },
        { status: 400 }
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
          or(
            eq(lists.ownerId, userId),
            eq(listCollaborators.userId, userId)
          )
        )
      )
      .limit(1);

    if (!listData) {
      return NextResponse.json(
        { error: "List not found or access denied" },
        { status: 404 }
      );
    }

    // Check if the item exists in this list
    const [existingItem] = await db
      .select({ id: listItems.id })
      .from(listItems)
      .where(
        and(
          eq(listItems.id, itemId),
          eq(listItems.listId, listId)
        )
      )
      .limit(1);

    if (!existingItem) {
      return NextResponse.json(
        { error: "Item not found in this list" },
        { status: 404 }
      );
    }

    // Delete the item
    await db
      .delete(listItems)
      .where(eq(listItems.id, itemId));

    return NextResponse.json({ message: "Item removed from list successfully" });
  } catch (error) {
    console.error("Error removing item from list:", error);
    return NextResponse.json(
      { error: "Failed to remove item from list" },
      { status: 500 }
    );
  }
});

// GET /api/lists/[id]/items/[itemId] - Get a specific list item
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const listId = pathParts[3]; // /api/lists/[id]/items/[itemId]
    const itemId = pathParts[5];
    
    if (!listId || !itemId) {
      return NextResponse.json(
        { error: 'List ID and Item ID are required' },
        { status: 400 }
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
            eq(lists.isPublic, true)
          )
        )
      )
      .limit(1);

    if (!listData) {
      return NextResponse.json(
        { error: "List not found or access denied" },
        { status: 404 }
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
        notes: listItems.notes,
        addedAt: listItems.addedAt,
        sortOrder: listItems.sortOrder,
      })
      .from(listItems)
      .where(
        and(
          eq(listItems.id, itemId),
          eq(listItems.listId, listId)
        )
      )
      .limit(1);

    if (!item) {
      return NextResponse.json(
        { error: "Item not found in this list" },
        { status: 404 }
      );
    }

    return NextResponse.json({ item });
  } catch (error) {
    console.error("Error fetching list item:", error);
    return NextResponse.json(
      { error: "Failed to fetch list item" },
      { status: 500 }
    );
  }
});