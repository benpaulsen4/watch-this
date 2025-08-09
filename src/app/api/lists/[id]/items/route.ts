import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lists, listItems, listCollaborators } from "@/lib/db/schema";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
import { eq, and, max, or } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

// POST /api/lists/[id]/items - Add item to list
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const listId = url.pathname.split("/")[3]; // /api/lists/[id]/items

    if (!listId) {
      return NextResponse.json(
        { error: "List ID is required" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { tmdbId, contentType, title, posterPath, notes } = body;

    // Validate required fields
    if (!tmdbId || !contentType || !title) {
      return NextResponse.json(
        { error: "tmdbId, contentType, and title are required" },
        { status: 400 }
      );
    }

    // Validate contentType
    if (!["movie", "tv"].includes(contentType)) {
      return NextResponse.json(
        { error: 'contentType must be either "movie" or "tv"' },
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
          or(eq(lists.ownerId, userId), eq(listCollaborators.userId, userId))
        )
      )
      .limit(1);

    if (!listData) {
      return NextResponse.json(
        { error: "List not found or access denied" },
        { status: 404 }
      );
    }

    // Check if item already exists in the list
    const [existingItem] = await db
      .select({ id: listItems.id })
      .from(listItems)
      .where(
        and(
          eq(listItems.listId, listId),
          eq(listItems.tmdbId, tmdbId),
          eq(listItems.contentType, contentType)
        )
      )
      .limit(1);

    if (existingItem) {
      return NextResponse.json(
        { error: "This item is already in the list" },
        { status: 409 }
      );
    }

    // Get the next sort order
    const [maxSortResult] = await db
      .select({ maxSort: max(listItems.sortOrder) })
      .from(listItems)
      .where(eq(listItems.listId, listId));

    const nextSortOrder = (maxSortResult?.maxSort || 0) + 1;

    // Create the new list item
    const [newItem] = await db
      .insert(listItems)
      .values({
        id: uuidv4(),
        listId,
        tmdbId: Number(tmdbId),
        contentType,
        title: title.trim(),
        posterPath: posterPath || null,
        notes: notes?.trim() || null,
        sortOrder: nextSortOrder,
        addedAt: new Date(),
      })
      .returning();

    return NextResponse.json({ item: newItem }, { status: 201 });
  } catch (error) {
    console.error("Error adding item to list:", error);
    return NextResponse.json(
      { error: "Failed to add item to list" },
      { status: 500 }
    );
  }
});
